"""Schemas for the admin-editable Featured Placement pricing tiers
(app/models/featured_pricing_tier.py). See docs/decisions.md's
"Admin-editable pricing" entry for the full design writeup.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class FeaturedPricingTierRead(BaseModel):
    """Used both by the public `GET /featured/pricing` (filtered to
    `is_active=True` tiers only) and the admin `GET /admin/featured-pricing-
    tiers` (all tiers) — `id` is included on both so the frontend can pass it
    straight back as `tier_id` on purchase, and `is_active` is harmless to
    expose publicly (every row returned there is already active anyway)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    duration_days: int
    amount_kes: Decimal
    is_active: bool


class FeaturedPricingTierCreate(BaseModel):
    """Admin-only. Fully flexible — any positive `duration_days`/`amount_kes`
    combination, not locked to a fixed set (PM decision, see
    docs/decisions.md)."""

    label: str = Field(min_length=2, max_length=100)
    duration_days: int = Field(gt=0, le=3650)
    amount_kes: Decimal = Field(gt=0)


class FeaturedPricingTierUpdate(BaseModel):
    """Admin-only, PATCH semantics — all fields optional. Editing an
    existing tier's `amount_kes`/`duration_days` never touches any purchase
    already made under the old values (those are snapshotted onto
    `FeaturedPurchase` at purchase time, not live-joined — see
    app/models/featured_purchase.py)."""

    label: str | None = Field(default=None, min_length=2, max_length=100)
    duration_days: int | None = Field(default=None, gt=0, le=3650)
    amount_kes: Decimal | None = Field(default=None, gt=0)
    is_active: bool | None = None


class FeaturedPricingTierAdmin(FeaturedPricingTierRead):
    """`GET /admin/featured-pricing-tiers` response shape — same fields as
    the public read shape today, kept as its own subclass (rather than
    reusing `FeaturedPricingTierRead` directly) so an admin-only field can be
    added later (e.g. a purchase count, mirroring `AdminCategoryRead`'s
    "used by" counts) without touching the public schema."""

    created_at: datetime
