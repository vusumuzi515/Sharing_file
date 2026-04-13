"""
SMB File Server – list folders, list files, read, write.
Uses smbprotocol for SMB2/3.
"""
import os
from pathlib import Path
from typing import Optional

from smbprotocol.connection import Connection as SMBConnection
from smbprotocol.open import Open, CreateDisposition
from smbprotocol.structure import Structure
from smbprotocol.tree import TreeConnect

from config import settings


def get_smb_share_path() -> str:
    """Return the share path (e.g. \\\\server\\share)."""
    if settings.smb_unc:
        return settings.smb_unc.replace("/", "\\")
    return f"\\\\{settings.smb_server}\\{settings.smb_share}"


def _normalize_path(path: str) -> str:
    """Normalize path for SMB."""
    p = path.replace("\\", "/").strip("/")
    return p or ""


def list_folders(path: str) -> list[dict]:
    """
    List subfolders in the given path.
    path: relative path within share (e.g. "Engineering" or "Engineering/Project Plans")
    Returns: [{ "id": "name", "name": "name" }, ...]
    """
    # For now, use local filesystem if SMB not configured (dev fallback)
    if not settings.smb_server and not settings.smb_unc:
        return _list_folders_local(path)
    return _list_folders_smb(path)


def _list_folders_local(path: str) -> list[dict]:
    """Fallback: list from local mount (e.g. /mnt/inyatsi-files)."""
    root = os.environ.get("FILE_SERVER_ROOT", "/tmp/inyatsi-files")
    full = os.path.join(root, _normalize_path(path))
    if not os.path.isdir(full):
        return []
    result = []
    for name in sorted(os.listdir(full)):
        if not name.startswith(".") and os.path.isdir(os.path.join(full, name)):
            result.append({"id": name, "name": name})
    return result


def _list_folders_smb(path: str) -> list[dict]:
    """List folders via SMB."""
    # TODO: Implement SMB connection and directory listing
    # smbprotocol requires: Connection -> Session -> TreeConnect -> Open directory
    # For scaffold, return empty; implement when SMB credentials are available
    return []


def list_files(path: str, query: str = "") -> list[dict]:
    """
    List files in the given path.
    path: relative path within share
    query: optional search filter
    Returns: [{ name, size, uploadedAt, fileType, ... }, ...]
    """
    if not settings.smb_server and not settings.smb_unc:
        return _list_files_local(path, query)
    return _list_files_smb(path, query)


def _list_files_local(path: str, query: str) -> list[dict]:
    """Fallback: list files from local mount."""
    root = os.environ.get("FILE_SERVER_ROOT", "/tmp/inyatsi-files")
    full = os.path.join(root, _normalize_path(path))
    if not os.path.isdir(full):
        return []
    result = []
    q_lower = query.lower() if query else ""
    for name in sorted(os.listdir(full)):
        if name.startswith("."):
            continue
        item_path = os.path.join(full, name)
        if os.path.isfile(item_path):
            if q_lower and q_lower not in name.lower():
                continue
            stat = os.stat(item_path)
            ext = Path(name).suffix.replace(".", "").upper() or "FILE"
            result.append({
                "name": name,
                "size": stat.st_size,
                "uploadedAt": stat.st_mtime,
                "fileType": ext,
            })
    return sorted(result, key=lambda x: x.get("uploadedAt", 0), reverse=True)


def _list_files_smb(path: str, query: str) -> list[dict]:
    """List files via SMB."""
    # TODO: Implement SMB file listing
    return []
