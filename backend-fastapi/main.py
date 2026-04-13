"""
FastAPI backend for Inyatsi File Portal.
Permission-aware department list and file count stats from Active Directory.
"""
import threading
import time
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from auth.ad_auth import (
    get_user_groups_by_username,
    get_permitted_departments,
    get_permitted_department_ids,
)
from auth.jwt import decode_token
from config import settings
from services.file_scanner import run_scan, get_cached_count
from services.acl_service import get_effective_permissions

app = FastAPI(title="Inyatsi Departments API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


def get_username_from_token(credentials: HTTPAuthorizationCredentials = None) -> str:
    """Extract and validate token, return username/employeeId."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    username = payload.get("username") or payload.get("employeeId") or payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Token missing user identity")
    return str(username)


@app.get("/health")
def health():
    """Health check."""
    return {"ok": True}


def _background_scanner():
    """Run file scanner periodically."""
    interval = getattr(settings, "file_scanner_interval", 300) or 0
    while True:
        time.sleep(interval)
        run_scan()


@app.on_event("startup")
def startup():
    """Run initial scan and start background scanner thread."""
    run_scan()
    interval = getattr(settings, "file_scanner_interval", 300) or 0
    if interval > 0:
        t = threading.Thread(target=_background_scanner, daemon=True)
        t.start()


@app.get("/api/departments")
def get_departments(credentials=Depends(security)):
    """
    Return departments the logged-in user is permitted to see.
    - Accepts Bearer token (JWT from login)
    - Queries Active Directory for user's security groups
    - Cross-references with department mapping
    - Returns only permitted departments for Department Overview
    """
    username = get_username_from_token(credentials)
    groups = get_user_groups_by_username(username)
    if groups is None:
        raise HTTPException(
            status_code=503,
            detail="Could not reach Active Directory or user not found",
        )
    departments = get_permitted_departments(groups)
    return {"departments": departments}


@app.get("/api/stats/file-count")
def get_file_count(
    path: Optional[str] = None,
    department: Optional[str] = None,
    credentials=Depends(security),
):
    """
    Return cached file count for a network share path.
    Only returns if the user is authorized to view that share (via AD department mapping).
    Query params: path (e.g. Z:/Engineering/Site_Reports) or department (e.g. site-reports).
    """
    username = get_username_from_token(credentials)
    groups = get_user_groups_by_username(username)
    if groups is None:
        raise HTTPException(
            status_code=503,
            detail="Could not reach Active Directory or user not found",
        )
    permitted = get_permitted_department_ids(groups)

    if department:
        if department not in permitted:
            raise HTTPException(status_code=403, detail="Not authorized to view this share")
        data = get_cached_count(department)
    elif path:
        data = get_cached_count(path)
        dept_id = data.get("department_id") if data else None
        if dept_id and dept_id not in permitted:
            raise HTTPException(status_code=403, detail="Not authorized to view this share")
    else:
        raise HTTPException(status_code=400, detail="Provide path or department query param")

    if not data:
        raise HTTPException(status_code=404, detail="No cached count for this path")

    return {
        "total": data.get("total", 0),
        "by_folder": data.get("by_folder", {}),
        "path": data.get("path", path or department),
        "updated_at": data.get("updated_at"),
    }


@app.get("/api/permissions")
def get_path_permissions(
    path: str,
    credentials=Depends(security),
):
    """
    Return effective NTFS permissions (Read, Write, Delete) for the authenticated user
    on the given file server path. Uses pywin32 on Windows.
    The React frontend can use this to conditionally show/hide buttons
    (e.g. hide Delete if user has read-only access).
    """
    username = get_username_from_token(credentials)
    groups = get_user_groups_by_username(username)
    group_names = list(groups) if groups else []

    perms = get_effective_permissions(
        path=path,
        username=username,
        group_names=group_names,
        domain=getattr(settings, "ad_domain", None) or None,
    )

    return {
        "path": path,
        "read": perms["read"],
        "write": perms["write"],
        "delete": perms["delete"],
    }
