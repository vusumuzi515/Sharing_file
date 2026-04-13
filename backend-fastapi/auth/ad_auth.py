"""
AD Authentication – validate user and fetch groups.
Uses ldap3 to bind against Windows Active Directory.
"""
import json
from pathlib import Path
from typing import Optional

from ldap3 import Connection, Server, ALL, SUBTREE

from config import settings


def load_ad_groups_config() -> dict:
    """Load AD group → department mapping."""
    path = Path(settings.ad_groups_config)
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {
        "groups_to_departments": {},
        "departments": [],
        "restricted_folders": [],
        "admin_groups": [],
    }


def get_user_groups_by_username(username: str) -> Optional[list[str]]:
    """
    Get AD security groups for a user (by username/sAMAccountName).
    Uses service account bind. Returns None if user not found or AD unavailable.
    """
    if not settings.ad_server or not settings.ad_base_dn:
        return None

    server = Server(settings.ad_server, get_info=ALL)
    groups = []

    try:
        conn = Connection(
            server,
            user=settings.ad_bind_user or None,
            password=settings.ad_bind_password or None,
            auto_bind=True,
        )

        filter_str = settings.ad_user_filter.format(username=username)
        conn.search(
            settings.ad_base_dn,
            filter_str,
            search_scope=SUBTREE,
            attributes=["memberOf"],
        )

        if not conn.entries:
            conn.unbind()
            return None

        member_of = conn.entries[0].memberOf
        conn.unbind()

        if member_of:
            for dn in member_of.values:
                parts = dn.split(",")
                for p in parts:
                    if p.strip().upper().startswith("CN="):
                        groups.append(p.strip()[3:])
                        break

        return groups

    except Exception:
        return None


def authenticate_and_get_groups(username: str, password: str) -> Optional[list[str]]:
    """
    Authenticate user against AD and return their group names.
    Returns None if auth fails.
    """
    if not settings.ad_server or not settings.ad_base_dn:
        return None

    server = Server(settings.ad_server, get_info=ALL)
    user_dn = None
    groups = []

    try:
        # Bind as service account to search
        conn = Connection(
            server,
            user=settings.ad_bind_user or None,
            password=settings.ad_bind_password or None,
            auto_bind=True,
        )

        # Search for user
        filter_str = settings.ad_user_filter.format(username=username)
        conn.search(
            settings.ad_base_dn,
            filter_str,
            search_scope=SUBTREE,
            attributes=["memberOf", "distinguishedName"],
        )

        if not conn.entries:
            conn.unbind()
            return None

        user_dn = str(conn.entries[0].distinguishedName)
        member_of = conn.entries[0].memberOf

        if member_of:
            for dn in member_of.values:
                # Extract CN from DN (e.g. CN=Engineering,OU=Groups,...)
                parts = dn.split(",")
                for p in parts:
                    if p.strip().upper().startswith("CN="):
                        groups.append(p.strip()[3:])
                        break

        conn.unbind()

        # Try to bind as user to verify password
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        user_conn.unbind()

        return groups

    except Exception:
        return None


def map_groups_to_departments(groups: list[str]) -> dict:
    """
    Map AD group names to department access.
    Returns: { department_id: permission }
    """
    cfg = load_ad_groups_config()
    mapping = cfg.get("groups_to_departments", {})
    admin_groups = set(g.lower() for g in cfg.get("admin_groups", []))
    result = {}

    for group in groups:
        g_lower = group.lower()
        if g_lower in admin_groups:
            # Admin: all departments
            for dept in cfg.get("departments", []):
                result[dept["id"]] = "edit"
            break
        dept_id = mapping.get(group)
        if dept_id:
            dept = next((d for d in cfg.get("departments", []) if d["id"] == dept_id), None)
            if dept:
                result[dept_id] = dept.get("permission", "edit")

    return result


def get_permitted_departments(groups: list[str]) -> list[dict]:
    """
    Return list of department objects the user is permitted to see,
    based on their AD security groups.
    """
    cfg = load_ad_groups_config()
    dept_access = map_groups_to_departments(groups)
    departments = cfg.get("departments", [])

    return [
        {
            "id": d["id"],
            "department": d.get("label", d["id"]),
            "label": d.get("label", d["id"]),
            "folderPath": d.get("folder_path", d["id"]),
            "permission": dept_access.get(d["id"], "view"),
            "has_access": True,
        }
        for d in departments
        if d["id"] in dept_access
    ]


def get_permitted_department_ids(groups: list[str]) -> set[str]:
    """Return set of department IDs the user is permitted to access."""
    dept_access = map_groups_to_departments(groups)
    return set(dept_access.keys())
