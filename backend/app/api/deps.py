"""Shared FastAPI dependencies: current user resolution + RBAC checks.

See app/core/security.py's module docstring for why a minimal JWT layer
exists here ahead of the full auth build.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User, UserRole

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise unauthorized

    user_id = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (TypeError, ValueError) as exc:
        raise unauthorized from exc

    user = db.get(User, user_uuid)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None instead of raising.

    Useful for endpoints that behave differently for anonymous vs. logged-in
    callers (e.g. a business owner sees their own pending listings on a
    public detail endpoint) without splitting the endpoint in two.
    """
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        return None
    try:
        user_uuid = uuid.UUID(str(payload.get("sub")))
    except (TypeError, ValueError):
        return None
    user = db.get(User, user_uuid)
    if user is None or not user.is_active:
        return None
    return user


def require_roles(*roles: UserRole):
    """Dependency factory: 403s unless current_user.role is one of `roles`."""

    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return _check


require_admin = require_roles(UserRole.PLATFORM_ADMIN)
require_moderator = require_roles(UserRole.PLATFORM_ADMIN, UserRole.CONTENT_MODERATOR)
