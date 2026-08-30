from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.product import ModerationStatus
from app.schemas.business import BusinessSummary
from app.schemas.category import CategoryRead
from app.schemas.product import ProductSummary


class VideoUpdate(BaseModel):
    """All fields optional — PATCH semantics. Re-uploading the video file
    itself isn't supported here (upload creates a new Video); moderation
    fields are absent — they only change via the admin moderation endpoints."""

    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category_id: int | None = None
    product_id: uuid.UUID | None = None


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    business: BusinessSummary
    category: CategoryRead | None
    product_id: uuid.UUID | None
    product: ProductSummary | None
    title: str
    description: str | None
    video_url: str
    thumbnail_url: str | None
    duration_seconds: int | None
    view_count: int
    moderation_status: ModerationStatus
    moderation_note: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VideoModerationAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class VideoRejectAction(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class VideoViewResult(BaseModel):
    view_count: int
