from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.otp import OtpPurpose
from app.models.user import UserRole
from app.schemas.business import BusinessSummary
from app.utils.phone import is_valid_phone, normalize_phone

# Roles a caller may self-select at registration. Platform admin / content
# moderator are staff roles assigned internally (via the admin dashboard or
# direct DB action), never through open self-registration — see
# docs/decisions.md.
SELF_REGISTERABLE_ROLES = {
    UserRole.GENERAL_USER,
    UserRole.BUSINESS_ADMIN,
    UserRole.ADVERTISER,
    UserRole.CONTENT_CREATOR,
    UserRole.PUBLISHER,
}


def _normalize_and_validate_phone(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    value = normalize_phone(value)
    if not is_valid_phone(value):
        raise ValueError("Phone number must be 7-20 digits, optionally starting with '+'.")
    return value


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
    """DEBUG-only convenience for local dev/testing — see
    app/api/v1/endpoints/auth_dev.py. Creates the user if `email`/`phone`
    doesn't already exist, then issues a real access token for them. Never
    available when settings.DEBUG is False."""

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


class OtpDebugInfo(BaseModel):
    """Only ever populated when settings.DEBUG is true — see
    app/services/otp.py's module docstring. Lets the register/otp endpoints
    be exercised end-to-end without a real SMS/email provider."""

    code: str
    destination: str
    expires_in_seconds: int


class _IdentityMixin(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str | None) -> str | None:
        return _normalize_and_validate_phone(value)

    @model_validator(mode="after")
    def _require_identity(self) -> _IdentityMixin:
        if not self.email and not self.phone:
            raise ValueError("Provide an email or phone number.")
        return self


class RegisterRequest(_IdentityMixin):
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)
    role: UserRole = UserRole.GENERAL_USER

    @field_validator("role")
    @classmethod
    def _validate_role(cls, value: UserRole) -> UserRole:
        if value not in SELF_REGISTERABLE_ROLES:
            raise ValueError(
                "That role cannot be self-registered; it is assigned by an administrator."
            )
        return value


class RegisterResponse(BaseModel):
    user: UserRead
    message: str
    otp: OtpDebugInfo | None = None


class OtpRequestRequest(_IdentityMixin):
    """Exactly one of email/phone — that's the channel the code is sent to.
    Providing both is rejected (ambiguous which channel to use)."""

    purpose: OtpPurpose = OtpPurpose.REGISTRATION

    @model_validator(mode="after")
    def _exactly_one_identity(self) -> OtpRequestRequest:
        if self.email and self.phone:
            raise ValueError("Provide either email or phone, not both.")
        return self


class OtpRequestResponse(BaseModel):
    message: str
    otp: OtpDebugInfo | None = None


class OtpVerifyRequest(_IdentityMixin):
    code: str = Field(min_length=4, max_length=8)
    purpose: OtpPurpose = OtpPurpose.REGISTRATION

    @model_validator(mode="after")
    def _exactly_one_identity(self) -> OtpVerifyRequest:
        if self.email and self.phone:
            raise ValueError("Provide either email or phone, not both.")
        return self


class OtpVerifyResponse(BaseModel):
    message: str
    user: UserRead


class LoginRequest(_IdentityMixin):
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(_IdentityMixin):
    @model_validator(mode="after")
    def _exactly_one_identity(self) -> ForgotPasswordRequest:
        if self.email and self.phone:
            raise ValueError("Provide either email or phone, not both.")
        return self


class ForgotPasswordResponse(BaseModel):
    message: str
    otp: OtpDebugInfo | None = None


class ResetPasswordRequest(_IdentityMixin):
    code: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def _exactly_one_identity(self) -> ResetPasswordRequest:
        if self.email and self.phone:
            raise ValueError("Provide either email or phone, not both.")
        return self


class AdminUserRead(BaseModel):
    """Admin dashboard user-list/detail shape. Deliberately never includes
    `hashed_password`, OTP codes/secrets, or anything else sensitive — only
    fields an admin reviewing an account actually needs (role, verified
    contact info, join date, active state)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str | None
    email: str | None
    full_name: str | None
    role: UserRole
    is_active: bool
    is_verified: bool
    created_at: datetime


class AdminUserDetail(AdminUserRead):
    """Single-user admin view — adds the businesses this user owns, so an
    admin reviewing an account doesn't need a second call."""

    businesses: list[BusinessSummary] = Field(default_factory=list)


class AdminUserUpdate(BaseModel):
    """Admin-only. Currently just the deactivate/reactivate toggle — see
    docs/decisions.md for the self-deactivation / platform_admin guards
    enforced at the endpoint level (not expressible in the schema alone)."""

    is_active: bool
