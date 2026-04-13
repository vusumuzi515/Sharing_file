"""
File scanner – uses os.walk to count files in mounted paths.
Caches results for the file count statistic.
"""
import os
import threading
import time
from pathlib import Path
from typing import Optional

from config import settings


# In-memory cache: { path: { "total": int, "by_folder": { rel_path: int }, "updated_at": float } }
_cache: dict = {}
_cache_lock = threading.Lock()


def _normalize_path(path: str) -> str:
    """Normalize path for cross-platform use."""
    return path.replace("\\", "/").strip().rstrip("/")


def scan_path(root_path: str) -> dict:
    """
    Walk the path with os.walk and count files per folder.
    Returns: { "total": int, "by_folder": { "relative/path": count }, "path": str }
    """
    root = _normalize_path(root_path)
    if not root or not os.path.exists(root):
        return {"total": 0, "by_folder": {}, "path": root, "error": "Path not found"}

    if not os.path.isdir(root):
        return {"total": 0, "by_folder": {}, "path": root, "error": "Not a directory"}

    total = 0
    by_folder = {}
    root_abs = os.path.abspath(root)

    try:
        for dirpath, _dirnames, filenames in os.walk(root):
            count = len([f for f in filenames if not f.startswith(".")])
            total += count
            rel = os.path.relpath(dirpath, root_abs)
            if rel == ".":
                rel = ""
            by_folder[rel] = count
    except (PermissionError, OSError) as e:
        return {"total": 0, "by_folder": {}, "path": root, "error": str(e)}

    return {"total": total, "by_folder": by_folder, "path": root}


def run_scan() -> None:
    """Scan all configured paths and update cache."""
    paths = _get_configured_paths()
    if not paths:
        return

    for item in paths:
        path = item.get("path") if isinstance(item, dict) else item
        dept_id = item.get("department_id") if isinstance(item, dict) else None
        if not path:
            continue

        result = scan_path(path)
        result["department_id"] = dept_id
        result["updated_at"] = time.time()

        with _cache_lock:
            _cache[path] = result
            if dept_id:
                _cache[dept_id] = result


def _get_configured_paths() -> list:
    """Load paths from config. Format: path|department_id per line or comma-sep."""
    env_val = getattr(settings, "file_scanner_paths_env", None) or os.environ.get("FILE_SCANNER_PATHS", "")
    if env_val:
        result = []
        for part in env_val.replace(",", "\n").split():
            part = part.strip()
            if "|" in part:
                path, dept = part.split("|", 1)
                result.append({"path": path.strip(), "department_id": dept.strip() or None})
            elif part:
                result.append({"path": part, "department_id": None})
        if result:
            return result
    root = getattr(settings, "file_server_root", None) or os.environ.get("FILE_SERVER_ROOT", "")
    if root:
        return [{"path": root.strip(), "department_id": None}]
    return []


def get_cached_count(path_or_department: str) -> Optional[dict]:
    """
    Get cached file count for a path or department_id.
    Returns: { "total": int, "by_folder": {...}, "updated_at": float } or None
    """
    key = _normalize_path(path_or_department)
    with _cache_lock:
        if key in _cache:
            return _cache[key]
        for cached_path, data in _cache.items():
            if data.get("department_id") == path_or_department:
                return data
    return None


def get_all_cached() -> dict:
    """Return all cached scan results (for debugging)."""
    with _cache_lock:
        return dict(_cache)
