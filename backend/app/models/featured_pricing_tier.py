"""FeaturedPricingTier model — admin-editable pricing tiers for Phase 1b's
self-serve featured placement, replacing the old hardcoded
`app/core/featured_pricing.py` (`FeaturedPricingTier` enum + `FEATURED_PRICING`
dict) entirely. See docs/decisions.md's "Admin-editable pricing" entry for
the full design writeup.

**Fully flexible, not locked to two fixed durations** — an admin can create,
edit, or deactivate any `label`/`duration_days`/`amount_kes` combination
(PM decision, not re-litigated here). This replaces the old 2-member
`FeaturedPricingTier` enum (`SEVEN_DAYS`/`THIRTY_DAYS`), which is deleted
along with the rest of `app/core/featured_pricing.py` — there is no longer a
fixed, code-defined set of tiers anywhere.

**Deactivate-only, never hard-delete** — identical reasoning and precedent
to `Category` (app/models/category.py): a tier referenced by historical
`FeaturedPurchase` rows can't be safely hard-deleted without orphaning that
history. Unlike `Category`, though, `FeaturedPurchase` does NOT hold a
foreign key to this table at all (see that model's module docstring) — a
purchase snapshots the tier's `label`/`amount_kes`/`duration_days` onto its
own row at purchase time and never looks back at this table again, so
deactivating (or even editing) a tier can never retroactively change what an
existing purchase is recorded as having cost or how long it ran. `is_active`
only controls whether the tier is offered to a *future* purchaser via the
public `GET /featured/pricing` endpoint and whether `POST
/businesses/{id}/featured-purchases` will accept a purchase against it.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FeaturedPricingTier(Base):
    __tablename__ = "featured_pricing_tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Admin-chosen, free-form — e.g. "7 days", "Launch Special — 10 days".
    # Not a slug/identifier (nothing else references it by value — see
    # module docstring), so no uniqueness constraint is enforced.
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_kes: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
