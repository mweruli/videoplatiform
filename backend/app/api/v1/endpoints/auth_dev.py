"""DEV-ONLY auth stub.

Real registration + phone/email OTP + login is outstanding backlog from
Sprint 1 (see docs/decisions.md and app/core/security.py's docstring) — this
endpoint exists solely so Sprint 2's business/product ownership and
RBAC-gated endpoints are exercisable end-to-end without that flow existing
yet. It is hard-disabled (404) unless settings.DEBUG is true, so it can never
reach a production deployment by accident. DELETE THIS FILE once real auth
ships; nothing else in the codebase should come to depend on it.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import DevTokenRequest, TokenResponse

router = APIRouter()


@router.post("/dev/token", response_model=TokenResponse, tags=["dev"])
def issue_dev_token(payload: DevTokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if not settings.DEBUG:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if not payload.identity_ok():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Provide an email or phone."
        )

    user = None
    if payload.email:
        user = db.scalar(select(User).where(User.email == payload.email))
    if user is None and payload.phone:
        user = db.scalar(select(User).where(User.phone == payload.phone))

    if user is None:
        user = User(
            email=payload.email,
            phone=payload.phone,
            full_name=payload.full_name,
            role=payload.role,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=user)
