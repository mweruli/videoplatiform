"""Video model — PROJECT_BRIEF.md's "Video & Shorts Platform" module.

Phase 1a scope (see DEVELOPMENT_PLAN.md's Sprint 3 line and docs/decisions.md):
videos are business-uploaded, not creator-uploaded — a business owner uploads
a product demo / manufacturing / "how it's made" video for their own
business, optionally tied to one specific product. Creator-uploaded content
with its own licensing/rights workflow is PROJECT_BRIEF.md's "Content
Creator Ecosystem" module, explicitly Phase 1b/2 — out of scope here.

Moderation follows the exact same pending/approved/rejected pattern as
Product (reusing `app.models.product.ModerationStatus` rather than a
parallel enum with identical values — see docs/decisions.md's "Enums stored
as VARCHAR" note for why adding a *value* to that set is cheap; this reuses
existing values, so no new enum type is even needed).

`video_asset_id` is the VideoBackend-opaque identifier (see
app/services/video.py) needed for `backend.delete()` later — it's whatever
`VideoAsset.asset_id` was for whichever backend processed the upload (the
object storage URL today — see ObjectStorageVideoBackend; a Cloudflare
Stream UID / Bunny Stream GUID once a real provider is wired in). `video_url`
is always the directly-fetchable playback URL the frontend's <video> tag
uses; keeping both means a future "switch providers" migration doesn't have
to derive one from the other.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.product import ModerationStatus

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.category import Category
    from app.models.product import Product


# Video <-> Category, many-to-many. A video can carry zero or more
# categories — mirrors app/models/product.py's product_categories table
# exactly (same reasoning: a video can genuinely belong in more than one
# category, see docs/decisions.md).
video_categories = Table(
    "video_categories",
    Base.metadata,
    Column(
        "video_id",
        PG_UUID(as_uuid=True),
        ForeignKey("videos.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A video can showcase one specific product, or just the business
    # generally (NULL) — see module docstring.
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # See app/services/video.py's VideoAsset — video_url is the playback URL,
    # video_asset_id is the backend-opaque id needed to delete/manage the
    # asset with whichever VideoBackend processed it.
    video_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    video_asset_id: Mapped[str | None] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(1000))
    # Nullable: ObjectStorageVideoBackend can't extract duration without
    # ffmpeg (see app/services/video.py) — don't block on that. A real
    # managed video API provider fills this in once processed.
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    moderation_status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, name="video_moderation_status", native_enum=False, length=20),
        default=ModerationStatus.PENDING,
        nullable=False,
        index=True,
    )
    moderation_note: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    business: Mapped[Business] = relationship(lazy="joined")
    categories: Mapped[list[Category]] = relationship(
        "Category", secondary=video_categories, lazy="selectin"
    )
    product: Mapped[Product | None] = relationship(lazy="joined")
