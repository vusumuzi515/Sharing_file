"""
Inyatsi agent — run on the Windows file server (next to files and the .NET bridge).

When USE_BRIDGE=1 (default), listing uses GET /api/files on the local bridge with ?username=
so NTFS/group rules match the real file server. Upload checks GET /api/departments for
department-level "edit" before writing bytes. Download (GET) requires department "view" or "edit".

The process still writes files as the Windows user running this script. For strict NTFS
on the destination folder, run the agent under an account that may write there, or use a
service account; the bridge checks above enforce *which portal user* may request the op.

Env:
  RELAY_URL          — https://your-vps:8000
  BRIDGE_URL         — http://127.0.0.1:5000 (local windows-bridge-api)
  USE_BRIDGE         — 1 = use bridge for LIST + permission gate for PUT; 0 = legacy os.walk only
  ROOT_STORAGE       — same as FileServer:RootPath parent (folder containing department dirs)
"""

from __future__ import annotations

import os
import time
from typing import Any

import requests

API_KEY = "INYATSI_SECURE_TOKEN_2026"
RELAY_URL = os.getenv("RELAY_URL", "http://YOUR_VPS_IP:8000")
BRIDGE_URL = os.getenv("BRIDGE_URL", "http://127.0.0.1:5000").rstrip("/")
USE_BRIDGE = os.getenv("USE_BRIDGE", "1") == "1"
ROOT_STORAGE = os.getenv("ROOT_STORAGE", r"D:\file server")

HEADERS = {"X-API-Key": API_KEY}


def safe_segment(name: str) -> str:
    base = os.path.basename(name.strip())
    if not base or base in (".", ".."):
        raise ValueError("Invalid path segment")
    return base


def bridge_list_files(department: str, project: str, username: str) -> dict[str, Any]:
    r = requests.get(
        f"{BRIDGE_URL}/api/files",
        params={"department": department, "username": username},
        timeout=120,
    )
    if r.status_code == 403:
        return {"error": "forbidden", "files": [], "detail": "Bridge denied access for this user"}
    if r.status_code == 404:
        return {"error": "not_found", "files": [], "detail": r.text[:200]}
    if not r.ok:
        return {"error": "bridge_error", "files": [], "detail": r.text[:200], "status": r.status_code}
    data = r.json()
    files = data.get("files") or []
    proj_norm = project.strip().lower()
    out = []
    for f in files:
        folder = str(f.get("folder") or "").strip().lower()
        if folder != proj_norm:
            continue
        out.append(
            {
                "name": f.get("name"),
                "rel_path": str(f.get("id") or "").replace("\\", "/"),
                "size": f.get("size"),
                "access": f.get("access"),
            }
        )
    return {"source": "bridge", "department": data.get("department"), "count": len(out), "files": out}


def bridge_department_allows_edit(department: str, username: str) -> tuple[bool, str]:
    r = requests.get(
        f"{BRIDGE_URL}/api/departments",
        params={"username": username},
        timeout=60,
    )
    if not r.ok:
        return False, f"departments_http_{r.status_code}"
    data = r.json()
    for d in data.get("departments") or []:
        did = str(d.get("id") or "").lower()
        lbl = str(d.get("label") or "").lower()
        dep = department.strip().lower()
        if dep == did or dep == lbl:
            perm = str(d.get("permission") or "").lower()
            return perm == "edit", perm
    return False, "department_not_found"


def bridge_department_allows_read(department: str, username: str) -> tuple[bool, str]:
    """view or edit allows download."""
    r = requests.get(
        f"{BRIDGE_URL}/api/departments",
        params={"username": username},
        timeout=60,
    )
    if not r.ok:
        return False, f"departments_http_{r.status_code}"
    data = r.json()
    for d in data.get("departments") or []:
        did = str(d.get("id") or "").lower()
        lbl = str(d.get("label") or "").lower()
        dep = department.strip().lower()
        if dep == did or dep == lbl:
            perm = str(d.get("permission") or "").lower()
            return perm in ("view", "edit"), perm
    return False, "department_not_found"


def legacy_list(target_path: str) -> dict[str, Any]:
    if not os.path.isdir(target_path):
        return {"error": "not_found", "path": target_path, "files": []}
    files = []
    for root, _, filenames in os.walk(target_path):
        for f in filenames:
            full_p = os.path.join(root, f)
            files.append(
                {
                    "name": f,
                    "rel_path": os.path.relpath(full_p, target_path).replace("\\", "/"),
                    "size": os.path.getsize(full_p),
                }
            )
    return {"source": "legacy", "files": files}


def run_agent():
    print(f"[*] Agent online. BRIDGE_URL={BRIDGE_URL} USE_BRIDGE={USE_BRIDGE} ROOT={ROOT_STORAGE}")
    while True:
        try:
            resp = requests.get(f"{RELAY_URL}/tasks/pending", headers=HEADERS, timeout=30)
            resp.raise_for_status()
            for task in resp.json().get("tasks", []):
                tid = task["id"]
                username = (task.get("username") or "").strip()
                if not username:
                    requests.post(
                        f"{RELAY_URL}/tasks/complete/{tid}",
                        headers=HEADERS,
                        json={"result": {"error": "bad_task", "detail": "missing username"}},
                        timeout=30,
                    )
                    continue

                claim = requests.post(f"{RELAY_URL}/tasks/claim/{tid}", headers=HEADERS, timeout=30)
                if claim.status_code != 200:
                    continue

                dept = safe_segment(task.get("dept", ""))
                proj = safe_segment(task.get("proj", ""))
                target_path = os.path.join(ROOT_STORAGE, dept, proj)

                if task.get("action") == "LIST":
                    if USE_BRIDGE:
                        result = bridge_list_files(dept, proj, username)
                    else:
                        result = legacy_list(target_path)
                    requests.post(
                        f"{RELAY_URL}/tasks/complete/{tid}",
                        headers=HEADERS,
                        json={"result": result},
                        timeout=120,
                    )

                elif task.get("action") == "GET":
                    fname = safe_segment(os.path.basename(str(task.get("filename", ""))))
                    if USE_BRIDGE:
                        ok, perm = bridge_department_allows_read(dept, username)
                        if not ok:
                            requests.post(
                                f"{RELAY_URL}/agent/download/error/{tid}",
                                headers=HEADERS,
                                json={
                                    "error": "forbidden",
                                    "detail": f"No read access to department (permission={perm!r}).",
                                },
                                timeout=30,
                            )
                            continue
                    dest = os.path.join(ROOT_STORAGE, dept, proj, fname)
                    if not os.path.isfile(dest):
                        requests.post(
                            f"{RELAY_URL}/agent/download/error/{tid}",
                            headers=HEADERS,
                            json={"error": "not_found", "detail": dest},
                            timeout=30,
                        )
                        continue
                    try:
                        with open(dest, "rb") as f:
                            requests.post(
                                f"{RELAY_URL}/agent/push/{tid}",
                                headers=HEADERS,
                                data=f,
                                timeout=600,
                            )
                    except Exception as ex:
                        requests.post(
                            f"{RELAY_URL}/agent/download/error/{tid}",
                            headers=HEADERS,
                            json={"error": "read_failed", "detail": str(ex)[:300]},
                            timeout=30,
                        )

                elif task.get("action") == "PUT":
                    if USE_BRIDGE:
                        ok, perm = bridge_department_allows_edit(dept, username)
                        if not ok:
                            requests.post(
                                f"{RELAY_URL}/tasks/complete/{tid}",
                                headers=HEADERS,
                                json={
                                    "result": {
                                        "ok": False,
                                        "error": "forbidden",
                                        "detail": f"Department permission is {perm!r}; edit required to upload.",
                                    }
                                },
                                timeout=30,
                            )
                            continue

                    fname = safe_segment(task.get("filename", ""))
                    os.makedirs(target_path, exist_ok=True)
                    dest = os.path.join(target_path, fname)
                    try:
                        with requests.get(
                            f"{RELAY_URL}/pull/{tid}",
                            headers=HEADERS,
                            stream=True,
                            timeout=600,
                        ) as r:
                            r.raise_for_status()
                            with open(dest, "wb") as out:
                                for chunk in r.iter_content(chunk_size=8192):
                                    if chunk:
                                        out.write(chunk)
                    except Exception as ex:
                        requests.post(
                            f"{RELAY_URL}/tasks/complete/{tid}",
                            headers=HEADERS,
                            json={"result": {"ok": False, "error": "write_failed", "detail": str(ex)[:200]}},
                            timeout=30,
                        )
                        continue

                    requests.post(
                        f"{RELAY_URL}/tasks/complete/{tid}",
                        headers=HEADERS,
                        json={"result": {"ok": True, "path": dest}},
                        timeout=30,
                    )

        except Exception as e:
            print(f"[-] Error: {e}")
        time.sleep(1)


if __name__ == "__main__":
    run_agent()
