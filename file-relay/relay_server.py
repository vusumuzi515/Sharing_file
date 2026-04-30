"""
Inyatsi file relay (runs on a public VPS).

- Dashboard requests must identify the logged-in user:
  - Header X-Portal-Username: <employeeId>  (required if JWT not used)
  - OR Authorization: Bearer <JWT>  (optional; set RELAY_JWT_SECRET to match backend JWT_SECRET)

- Each task includes "username" for the agent so it can call the Windows bridge with the
  same user context used for NTFS / group checks.

- Download (GET file from internal server → browser):
  GET /dashboard/download/{dept}/{proj}/{filename} — streams bytes; agent claims task GET,
  reads disk, POST /agent/push/{tid} with body stream, then sentinel end.

Run: uvicorn relay_server:app --host 0.0.0.0 --port 8000

Env:
  RELAY_JWT_SECRET  — same value as Node backend JWT_SECRET (HS256) if using Bearer tokens.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

API_KEY = "INYATSI_SECURE_TOKEN_2026"
RELAY_JWT_SECRET = os.getenv("RELAY_JWT_SECRET", "").strip()

tasks: dict[str, dict[str, Any]] = {}
buffers: dict[str, asyncio.Queue] = {}


def _require_key(x_api_key: str | None) -> None:
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


def _resolve_username(
    authorization: Optional[str],
    x_portal_username: Optional[str],
) -> str:
    """Prefer validated JWT (employeeId) when RELAY_JWT_SECRET is set; else require X-Portal-Username."""
    if RELAY_JWT_SECRET and authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            import jwt

            payload = jwt.decode(token, RELAY_JWT_SECRET, algorithms=["HS256"])
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        uid = (
            str(payload.get("employeeId") or payload.get("username") or payload.get("sub") or "")
            .strip()
        )
        if not uid:
            raise HTTPException(status_code=401, detail="Token missing employeeId")
        return uid

    u = (x_portal_username or "").strip()
    if not u:
        raise HTTPException(
            status_code=400,
            detail="Send X-Portal-Username or Bearer JWT (set RELAY_JWT_SECRET on relay).",
        )
    return u


@app.get("/health")
async def health():
    return {"ok": True, "service": "inyatsi-file-relay", "jwt": bool(RELAY_JWT_SECRET)}


@app.get("/tasks/pending")
async def get_pending(x_api_key: str | None = Header(None, alias="X-API-Key")):
    _require_key(x_api_key)
    pending = [t for t in tasks.values() if t.get("status") == "pending"]
    return {"tasks": pending}


@app.post("/tasks/claim/{task_id}")
async def claim_task(task_id: str, x_api_key: str | None = Header(None, alias="X-API-Key")):
    _require_key(x_api_key)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Unknown task")
    if tasks[task_id].get("status") != "pending":
        raise HTTPException(status_code=409, detail="Task not pending")
    tasks[task_id]["status"] = "claimed"
    return {"status": "claimed", "task_id": task_id}


@app.post("/tasks/complete/{task_id}")
async def complete_task(task_id: str, body: dict, x_api_key: str | None = Header(None, alias="X-API-Key")):
    _require_key(x_api_key)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Unknown task")
    tasks[task_id]["status"] = "complete"
    tasks[task_id]["result"] = body.get("result", body)
    buffers.pop(task_id, None)
    return {"ok": True}


@app.get("/dashboard/download/{dept}/{proj}/{filename:path}")
async def dashboard_download(
    dept: str,
    proj: str,
    filename: str,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    x_portal_username: str | None = Header(None, alias="X-Portal-Username"),
    authorization: str | None = Header(None),
):
    """Stream a file from the internal agent (outbound from LAN → VPS → client)."""
    _require_key(x_api_key)
    username = _resolve_username(authorization, x_portal_username)

    tid = str(uuid.uuid4())
    buffers[tid] = asyncio.Queue()
    tasks[tid] = {
        "id": tid,
        "action": "GET",
        "dept": dept,
        "proj": proj,
        "filename": filename,
        "username": username,
        "status": "pending",
        "created": time.time(),
    }

    async def stream_gen():
        try:
            while True:
                t = tasks.get(tid) or {}
                if t.get("download_error"):
                    yield (
                        json.dumps(
                            {
                                "error": t.get("download_error", "failed"),
                                "detail": t.get("download_detail", ""),
                            }
                        ).encode("utf-8")
                    )
                    return
                try:
                    chunk = await asyncio.wait_for(buffers[tid].get(), timeout=120.0)
                except asyncio.TimeoutError:
                    yield json.dumps(
                        {"error": "timeout", "detail": "Agent did not start streaming in time"}
                    ).encode("utf-8")
                    return
                if chunk is None:
                    t = tasks.get(tid) or {}
                    if t.get("download_error"):
                        yield (
                            json.dumps(
                                {
                                    "error": t.get("download_error", "failed"),
                                    "detail": t.get("download_detail", ""),
                                }
                            ).encode("utf-8")
                        )
                    break
                yield chunk
        finally:
            tasks.pop(tid, None)
            buffers.pop(tid, None)

    return StreamingResponse(stream_gen(), media_type="application/octet-stream")


@app.post("/agent/push/{task_id}")
async def agent_push(
    task_id: str,
    request: Request,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    """Agent uploads file bytes into the download buffer for a GET task."""
    _require_key(x_api_key)
    if task_id not in buffers:
        raise HTTPException(status_code=404, detail="Unknown task or buffer expired")
    if tasks.get(task_id, {}).get("action") != "GET":
        raise HTTPException(status_code=400, detail="Not a GET download task")
    async for chunk in request.stream():
        await buffers[task_id].put(chunk)
    await buffers[task_id].put(None)
    tasks[task_id]["status"] = "complete"
    return {"ok": True}


@app.post("/agent/download/error/{task_id}")
async def agent_download_error(
    task_id: str,
    body: dict[str, Any],
    x_api_key: str | None = Header(None, alias="X-API-Key"),
):
    """Agent reports failure before or instead of streaming (e.g. not found, forbidden)."""
    _require_key(x_api_key)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Unknown task")
    if tasks[task_id].get("action") != "GET":
        raise HTTPException(status_code=400, detail="Not a GET download task")
    tasks[task_id]["download_error"] = str(body.get("error") or "failed")
    tasks[task_id]["download_detail"] = str(body.get("detail") or "")
    if task_id in buffers:
        await buffers[task_id].put(None)
    tasks[task_id]["status"] = "complete"
    return {"ok": True}


@app.get("/pull/{task_id}")
async def pull_stream(task_id: str, x_api_key: str | None = Header(None, alias="X-API-Key")):
    _require_key(x_api_key)
    if task_id not in buffers:
        raise HTTPException(status_code=404, detail="No buffer for task")

    q = buffers[task_id]

    async def gen():
        try:
            while True:
                chunk = await q.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            buffers.pop(task_id, None)

    return StreamingResponse(gen(), media_type="application/octet-stream")


@app.get("/dashboard/list/{dept}/{proj}")
async def dashboard_list(
    dept: str,
    proj: str,
    request: Request,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    x_portal_username: str | None = Header(None, alias="X-Portal-Username"),
    authorization: str | None = Header(None),
):
    _require_key(x_api_key)
    username = _resolve_username(authorization, x_portal_username)

    tid = str(uuid.uuid4())
    tasks[tid] = {
        "id": tid,
        "action": "LIST",
        "dept": dept,
        "proj": proj,
        "username": username,
        "status": "pending",
        "created": time.time(),
    }

    for _ in range(30):
        await asyncio.sleep(1)
        if tasks.get(tid, {}).get("status") == "complete":
            result = tasks.pop(tid, {}).get("result")
            return result
    raise HTTPException(status_code=504, detail="Remote agent timeout")


@app.post("/dashboard/upload/{dept}/{proj}/{filename}")
async def dashboard_upload(
    dept: str,
    proj: str,
    filename: str,
    request: Request,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    x_portal_username: str | None = Header(None, alias="X-Portal-Username"),
    authorization: str | None = Header(None),
):
    _require_key(x_api_key)
    username = _resolve_username(authorization, x_portal_username)

    tid = str(uuid.uuid4())
    buffers[tid] = asyncio.Queue()
    tasks[tid] = {
        "id": tid,
        "action": "PUT",
        "filename": filename,
        "dept": dept,
        "proj": proj,
        "username": username,
        "status": "buffering",
        "created": time.time(),
    }

    async for chunk in request.stream():
        await buffers[tid].put(chunk)
    await buffers[tid].put(None)

    tasks[tid]["status"] = "pending"

    for _ in range(120):
        await asyncio.sleep(1)
        if tasks.get(tid, {}).get("status") == "complete":
            out = tasks.pop(tid, {}).get("result")
            return out if out is not None else {"ok": True}
    raise HTTPException(status_code=504, detail="Remote agent timeout after upload")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
