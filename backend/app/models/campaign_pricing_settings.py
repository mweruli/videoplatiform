"""CampaignPricingSettings — a single-row settings table replacing the
hardcoded `CPM_KES`/`MIN_FUNDING_KES` constants that used to live in
`app/core/campaign_pricing.py` (now deleted, see docs/decisions.md's
"Admin-editable pricing" entry for the full design writeup).

**A single-row settings table, not a tier list** — unlike featured-placement
pricing (`app/models/featured_pricing_tier.py`, genuinely multi-row/
flexible per the PM's decision there), the campaign manager only ever has
one *current* CPM rate and one *current* minimum top-up amount at a time —
there is no "pick one of several campaign pricing plans" concept anywhere in
this codebase, so a tier table would be modeling flexibility nothing asks
for. The row's primary key is pinned to `SETTINGS_ID` (1) by convention —
enforced by callers always reading/writing that id, not a DB-level
singleton constraint, matching this codebase's existing "endpoint/
service-level invariant, not a schema constraint" tolerance for this class
of rule (see e.g. `FeaturedPurchase.product_id`'s "exactly one target"
invariant).

**Still snapshotted correctly at usage time — this table's existence changes
nothing about that**: `Campaign.cpm_kes` continues to snapshot whatever this
row's `cpm_kes` was *at campaign-creation time* (see app/models/campaign.py
and app/services/campaign_billing.py, both already correctly reading the
per-row snapshot, not a live constant) — reading this settings row happens
exactly once, at the moment `POST /businesses/{id}/campaigns` creates the
row, never again after. `min_funding_kes` is read live on every `POST
/campaigns/{id}/funding` call (a top-up has no snapshot of its own to
protect — the *minimum* a top-up may be is inherently a "what's the current
rule" question, not something a past top-up needs insulated from a later
change).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# The one and only row this table will ever have. Callers always read/write
# this exact id — see module docstring for why this is an endpoint/service-
# level convention rather than a DB-enforced singleton constraint.
SETTINGS_ID = 1


class CampaignPricingSettings(Base):
    __tablename__ = "campaign_pricing_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    cpm_kes: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_funding_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
