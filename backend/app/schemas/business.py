from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.business import VerificationStatus
from app.schemas.category import CategoryRead

_PHONE_RE = re.compile(r"^\+?[0-9 \-]{7,20}$")


def _check_phone(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _PHONE_RE.match(value):
        raise ValueError("Phone number must be 7-20 digits, optionally starting with '+'.")
    return value


class BusinessBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category_id: int | None = None
    county: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    address_line: str | None = Field(default=None, max_length=255)
    phone: str | None = None
    email: EmailStr | None = None
    website_url: str | None = Field(default=None, max_length=500)
    facebook_url: str | None = Field(default=None, max_length=500)
    instagram_url: str | None = Field(default=None, max_length=500)
    twitter_url: str | None = Field(default=None, max_length=500)
    tiktok_url: str | None = Field(default=None, max_length=500)

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str | None) -> str | None:
        return _check_phone(value)


class BusinessCreate(BusinessBase):
    pass


class BusinessUpdate(BaseModel):
    """All fields optional — PATCH semantics. Verification status is
    intentionally absent: it only changes via the admin moderation endpoints."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category_id: int | None = None
    county: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    address_line: str | None = Field(default=None, max_length=255)
    phone: str | None = None
    email: EmailStr | None = None
    website_url: str | None = Field(default=None, max_length=500)
    facebook_url: str | None = Field(default=None, max_length=500)
    instagram_url: str | None = Field(default=None, max_length=500)
    twitter_url: str | None = Field(default=None, max_length=500)
    tiktok_url: str | None = Field(default=None, max_length=500)
    cover_video_asset_id: str | None = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str | None) -> str | None:
        return _check_phone(value)


class OwnerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str | None = None


class BusinessSummary(BaseModel):
    """Slim shape for embedding a business inside a Product response —
    exactly what a product detail screen needs, no extra round trip."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None
    county: str | None
    city: str | None
    verification_status: VerificationStatus


class BusinessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    logo_url: str | None
    cover_image_url: str | None
    cover_video_asset_id: str | None
    category: CategoryRead | None
    county: str | None
    city: str | None
    address_line: str | None
    phone: str | None
    email: str | None
    website_url: str | None
    facebook_url: str | None
    instagram_url: str | None
    twitter_url: str | None
    tiktok_url: str | None
    verification_status: VerificationStatus
    verification_note: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    product_count: int = 0


class BusinessModerationAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class BusinessRejectAction(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
