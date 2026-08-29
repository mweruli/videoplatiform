"""DEV-ONLY auth stub.

Real registration + phone/email OTP + login now exists in
app/api/v1/endpoints/auth.py (see docs/decisions.md's Sprint 2 auth
follow-up entry) — this endpoint is kept only as a fast shortcut for
manually testing *other* endpoints without going through the full
register -> verify -> login flow each time. It is hard-disabled (404)
unless settings.DEBUG is true, so it can never reach a production
deployment by accident. DELETE THIS FILE once the rest of the in-flight
work that still uses it for quick testing is done; nothing in app/api/deps.py
or any business/product endpoint depends on it specifically — they all just
consume the standard Authorization: Bearer <jwt> contract that real login
also produces.
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
