"""Business (company profile) model.

Fields follow PROJECT_BRIEF.md's "Business & Company Management" section:
logo, cover image/video, description, industry/category, location(s),
contacts, website/social links, verification status, owner.

Scoping notes (flagged for Tech Lead/PM — see docs/decisions.md):
- One primary location per business (county/city/address), not a full
  multi-branch model. The brief says "locations" (plural) and the prototype
  shows one location string per business; a proper multi-branch model
  (separate BusinessLocation table) is a reasonable fast-follow once a real
  business asks for it, not needed for launch.
- `category_id` is a single FK to the existing Category model (an industry
  can only be one of the 18 launch categories) even though the design
  prototype's mock data shows a business with two categories
  (`categories: ['Manufacturing','Construction']`). This is deliberately
  unchanged even though Product/Video moved to many-to-many categories (see
  docs/decisions.md, 2026-08-30) — that change was scoped to Product/Video
  only; a business-category many-to-many hasn't been raised/requested.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.product import Product
    from app.models.user import User
    from app.schemas.campaign_targeting import CampaignTargetingRead


class VerificationStatus(str, enum.Enum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)

    logo_url: Mapped[str | None] = mapped_column(String(500))
    cover_image_url: Mapped[str | None] = mapped_column(String(500))
    # Managed video API asset id for the cover/showcase video (Cloudflare
    # Stream / Bunny Stream). Upload + webhook wiring is Sprint 3 (video
    # pipeline) — this column just reserves the association so Sprint 3 has
    # somewhere to write the processed asset id without another migration.
    cover_video_asset_id: Mapped[str | None] = mapped_column(String(255))

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )

    # --- Location (Kenya-market: county/city, not US-style street address) ---
    county: Mapped[str | None] = mapped_column(String(100), index=True)
    city: Mapped[str | None] = mapped_column(String(100), index=True)
    address_line: Mapped[str | None] = mapped_column(String(255))

    # --- Contact & links ---
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    website_url: Mapped[str | None] = mapped_column(String(500))
    facebook_url: Mapped[str | None] = mapped_column(String(500))
    instagram_url: Mapped[str | None] = mapped_column(String(500))
    twitter_url: Mapped[str | None] = mapped_column(String(500))
    tiktok_url: Mapped[str | None] = mapped_column(String(500))

    verification_status: Mapped[VerificationStatus] = mapped_column(
        Enum(VerificationStatus, name="business_verification_status", native_enum=False, length=20),
        default=VerificationStatus.UNVERIFIED,
        nullable=False,
        index=True,
    )
    verification_note: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Manual "featured" placement (Phase 1a — see PROJECT_BRIEF.md's Digital
    # Advertising section and DEVELOPMENT_PLAN.md's must-ship list). This is
    # a platform-controlled flag only, toggled via the admin endpoints in
    # app/api/v1/endpoints/admin.py (POST .../feature, .../unfeature) — it is
    # deliberately excluded from BusinessCreate/BusinessUpdate so a business
    # owner can never set it on themselves. NOT a self-serve campaign
    # (budgets/dates/targeting are Phase 1b+, see docs/decisions.md).
    is_featured: Mapped[bool] = mapped_column(default=False, nullable=False, index=True)

    # --- Core analytics (Phase 1a — see PROJECT_BRIEF.md's Advertising
    # Analytics section and DEVELOPMENT_PLAN.md's must-ship "Core analytics:
    # views, search appearances, basic counts"). Both are plain counters, no
    # per-viewer dedup — see docs/decisions.md for the reasoning (matches
    # Video.view_count's existing, already-shipped design exactly).
    # `view_count`: incremented by POST /businesses/{id}/view when someone
    # opens the business's profile page.
    # `impression_count`: incremented by POST /businesses/impressions when
    # the business appears in a rendered search-results/browse list — the
    # closest honest signal to "search appearances" this client-side-search
    # architecture can produce server-side without moving search server-side
    # (see docs/decisions.md).
    view_count: Mapped[int] = mapped_column(default=0, nullable=False)
    impression_count: Mapped[int] = mapped_column(default=0, nullable=False)

    # Self-serve, time-limited featuring (Phase 1b — see
    # app/models/featured_purchase.py and docs/decisions.md). NULL means
    # either "not featured" or "featured permanently by an admin" via
    # POST /admin/businesses/{id}/feature (manual admin featuring never
    # touches this column). A non-NULL value means `is_featured=True` is
    # only valid until this timestamp — enforced by a "sweep on read", not a
    # background job; see app/services/featured_expiry.py for why.
    featured_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    owner: Mapped[User] = relationship(lazy="joined")
    category: Mapped[Category | None] = relationship(lazy="joined")
    products: Mapped[list[Product]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )

    @property
    def product_count(self) -> int:
        """Active product count — computed, not persisted. Fine at MVP scale;
        move to a SELECT COUNT query if a business profile page ever needs to
        avoid loading the full `products` collection just for this number."""
        return sum(1 for p in self.products if p.is_active)

    if TYPE_CHECKING:
        # Not a mapped column — a transient, request-scoped attribute set
        # directly on the ORM instance by app/api/v1/endpoints/businesses.py's
        # `_attach_active_campaigns()` before the response schema validates it
        # (see docs/decisions.md's "Phase 1b design pass: self-serve
        # advertiser campaign manager" entry's "Bulk-loading `active_campaign`
        # without N+1" section). Declared here under `TYPE_CHECKING` only so
        # mypy knows the attribute exists without it being a real DB column.
        active_campaign: CampaignTargetingRead | None
