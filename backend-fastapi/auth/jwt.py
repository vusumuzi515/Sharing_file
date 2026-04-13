"""JWT token creation and validation."""
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt

from config import settings


def create_token(
    user_id: str,
    username: str,
    department_id: str,
    department_label: str,
    permission: str,
    groups: list[str],
) -> str:
    """Create JWT for authenticated user."""
    expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": user_id,
        "username": username,
        "departmentId": department_id,
        "department": department_label,
        "permission": permission,
        "groups": groups,
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate JWT. Returns payload or None."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        return None
