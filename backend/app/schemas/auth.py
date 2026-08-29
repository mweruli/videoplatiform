from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.user import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str | None
    email: str | None
    full_name: str | None
    role: UserRole
    is_active: bool
    is_verified: bool


class DevTokenRequest(BaseModel):
    """DEBUG-only convenience for local dev/testing until real registration +
    phone/email OTP + login exists (see docs/decisions.md). Creates the user
    if `email`/`phone` doesn't already exist, then issues a real access
    token for them. Never available when settings.DEBUG is False."""

    email: EmailStr | None = None
    phone: str | None = None
    full_name: str | None = None
    role: UserRole = UserRole.GENERAL_USER

    def identity_ok(self) -> bool:
        return bool(self.email or self.phone)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = Field(default="bearer")
    user: UserRead
