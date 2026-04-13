"""
NTFS ACL – read effective permissions for a user on a file server path.
Uses pywin32 (win32security) on Windows. Returns Read, Write, Delete flags.
"""
import platform
from typing import Optional

# Windows-only: pywin32 (optional dependency)
HAS_WIN32 = False
if platform.system() == "Windows":
    try:
        import win32security
        HAS_WIN32 = True
    except ImportError:
        pass

# NTFS access rights (from WinNT.h)
FILE_READ_DATA = 0x0001
FILE_WRITE_DATA = 0x0002
FILE_APPEND_DATA = 0x0004
FILE_READ_EA = 0x0008
FILE_WRITE_EA = 0x0010
FILE_READ_ATTRIBUTES = 0x0080
FILE_WRITE_ATTRIBUTES = 0x0100
DELETE = 0x00010000
READ_CONTROL = 0x00020000
WRITE_DAC = 0x00040000
WRITE_OWNER = 0x00080000
SYNCHRONIZE = 0x00100000

# Composite masks for our permission checks
READ_MASK = (
    FILE_READ_DATA
    | FILE_READ_ATTRIBUTES
    | FILE_READ_EA
    | READ_CONTROL
    | SYNCHRONIZE
)
WRITE_MASK = (
    FILE_WRITE_DATA
    | FILE_APPEND_DATA
    | FILE_WRITE_ATTRIBUTES
    | FILE_WRITE_EA
    | WRITE_DAC
    | WRITE_OWNER
    | SYNCHRONIZE
)
DELETE_MASK = DELETE

# ACE types
ACCESS_ALLOWED_ACE_TYPE = 0x00
ACCESS_DENIED_ACE_TYPE = 0x01
ACCESS_ALLOWED_OBJECT_ACE_TYPE = 0x05
ACCESS_DENIED_OBJECT_ACE_TYPE = 0x06


def _get_user_sid(username: str, domain: Optional[str] = None) -> Optional[object]:
    """Resolve username to SID. domain can be None to try local + default domain."""
    if not HAS_WIN32:
        return None
    try:
        if domain:
            account = f"{domain}\\{username}" if "\\" not in username else username
        else:
            account = username
        sid, _, _ = win32security.LookupAccountName(None, account)
        return sid
    except Exception:
        try:
            sid, _, _ = win32security.LookupAccountName(None, username)
            return sid
        except Exception:
            return None


def _get_group_sids(group_names: list[str], domain: Optional[str] = None) -> set:
    """Resolve group names to SIDs."""
    sids = set()
    if not HAS_WIN32:
        return sids
    for name in group_names or []:
        try:
            account = f"{domain}\\{name}" if domain and "\\" not in name else name
            sid, _, _ = win32security.LookupAccountName(None, account)
            sids.add(sid)
        except Exception:
            pass
    return sids


def _sid_in_set(sid, sid_set) -> bool:
    """Check if SID equals any in set (by string representation)."""
    if not sid or not sid_set:
        return False
    try:
        sid_str = win32security.ConvertSidToStringSid(sid)
        for s in sid_set:
            try:
                if win32security.ConvertSidToStringSid(s) == sid_str:
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def get_effective_permissions(
    path: str,
    username: str,
    group_names: Optional[list[str]] = None,
    domain: Optional[str] = None,
) -> dict:
    """
    Read NTFS ACL of path and determine effective permissions for the user.
    Uses pywin32 win32security. Windows only.

    Returns: { "read": bool, "write": bool, "delete": bool }
    """
    result = {"read": False, "write": False, "delete": False}

    if not HAS_WIN32:
        return result

    user_sid = _get_user_sid(username, domain)
    if not user_sid:
        return result

    sids_to_check = {user_sid}
    if group_names:
        sids_to_check.update(_get_group_sids(group_names, domain))

    try:
        sd = win32security.GetNamedSecurityInfo(
            path,
            win32security.SE_FILE_OBJECT,
            win32security.DACL_SECURITY_INFORMATION,
        )
        dacl = sd.GetSecurityDescriptorDacl()
        if not dacl:
            return result

        allowed_mask = 0
        denied_mask = 0

        for i in range(dacl.GetAceCount()):
            try:
                ace = dacl.GetAce(i)
            except Exception:
                continue

            ace_type = ace[0][0] if ace[0] else 0
            if ace_type in (
                ACCESS_ALLOWED_ACE_TYPE,
                ACCESS_DENIED_ACE_TYPE,
                ACCESS_ALLOWED_OBJECT_ACE_TYPE,
                ACCESS_DENIED_OBJECT_ACE_TYPE,
            ):
                if len(ace) == 3:
                    mask, sid = ace[1], ace[2]
                elif len(ace) >= 5:
                    mask, sid = ace[1], ace[4]
                else:
                    continue

                if not _sid_in_set(sid, sids_to_check):
                    continue

                if ace_type in (ACCESS_ALLOWED_ACE_TYPE, ACCESS_ALLOWED_OBJECT_ACE_TYPE):
                    allowed_mask |= mask
                else:
                    denied_mask |= mask
            except Exception:
                continue

        effective = (allowed_mask & ~denied_mask) if denied_mask else allowed_mask

        result["read"] = bool(effective & READ_MASK)
        result["write"] = bool(effective & WRITE_MASK)
        result["delete"] = bool(effective & DELETE_MASK)

    except Exception:
        pass

    return result
