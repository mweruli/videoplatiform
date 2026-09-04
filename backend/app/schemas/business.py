from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.business import VerificationStatus
from app.schemas.category import CategoryRead

_PHONE_RE = re.compile(r"^\+?[0-9 \-]{7,20}$")


def _check_phone(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not _PHONE_RE.match(value):
        raise ValueError("Phone number must be 7-20 digits, optionally starting with '+'.")
    return value


def _reject_platform_controlled_fields(data: object) -> object:
    """`is_featured` is platform-controlled (see Business.is_featured's
    model docstring) — explicitly reject it here rather than relying on it
    simply being absent from these schemas' field lists, so a request body
    that includes it (even a "clever" attempt from a business owner) gets a
    clear 422 instead of being silently accepted-and-ignored or, worse,
    silently applied if a field is ever added carelessly later."""
    if isinstance(data, dict) and "is_featured" in data:
        raise ValueError(
            "'is_featured' is platform-controlled and cannot be set here; "
            "use POST /admin/businesses/{id}/feature or /unfeature."
        )
    return data


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
    @model_validator(mode="before")
    @classmethod
    def _reject_is_featured(cls, data: object) -> object:
        return _reject_platform_controlled_fields(data)


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

    @model_validator(mode="before")
    @classmethod
    def _reject_is_featured(cls, data: object) -> object:
        return _reject_platform_controlled_fields(data)


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
    is_featured: bool
    # Nullable — set only while a time-limited self-serve featured purchase
    # is active (see app/services/featured_expiry.py); NULL for an
    # admin-permanent feature or when not featured at all. Column already
    # existed on the model (see docs/decisions.md's "Phase 1b design pass:
    # M-Pesa self-serve payments" entry) but was missed from this response
    # shape until the featured-purchase frontend needed it to show "Featured
    # until <date>" without a second call.
    featured_until: datetime | None
    view_count: int
    impression_count: int
    created_at: datetime
    updated_at: datetime
    product_count: int = 0


class BusinessModerationAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class BusinessRejectAction(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class BusinessViewResult(BaseModel):
    view_count: int


class ModerationStatusCounts(BaseModel):
    """Field names match `app.models.product.ModerationStatus`'s values
    exactly — reused as-is for both products and videos rather than a
    separate enum, same "don't duplicate an identical set of values"
    reasoning as Video reusing Product's ModerationStatus (docs/decisions.md)."""

    pending: int = 0
    approved: int = 0
    rejected: int = 0


class BusinessStats(BaseModel):
    """`GET /businesses/{id}/stats` — owner/admin-only aggregate view (see
    docs/decisions.md). Product/video counts and view sums only cover
    currently-active (not soft-deleted) rows, matching how counts are shown
    everywhere else in this codebase (e.g. `Business.product_count`)."""

    business_id: uuid.UUID
    business_view_count: int
    business_impression_count: int
    total_product_views: int
    total_video_views: int
    product_counts: ModerationStatusCounts
    video_counts: ModerationStatusCounts
