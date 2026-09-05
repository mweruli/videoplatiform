"""CampaignDailyStats — the campaign-level counterpart to
app/models/business_daily_stats.py. See that module's docstring for the base
design reasoning (composite PK, Postgres upsert, UTC dates, deferred
retention) — not repeated here. Written to inside the same billing call that
already updates `Campaign.impression_count`/`spent_kes` (impressions) or
`Campaign.click_count` (clicks), via
app/services/campaign_billing.py -> app/services/daily_stats.py.

**`spend_kes` is tracked here, unlike the other three daily-stats tables,
because campaigns are the one entity type with real day-by-day money to
chart** — PROJECT_BRIEF.md's Advertising Analytics bullet explicitly asks for
"campaign performance" including spend-over-time, and the fast-follow's own
"projected days until budget exhausts" feature needs a real daily spend
series to extrapolate from (see docs/decisions.md's daily-timeseries entry
for why this can't be reconstructed after the fact from `Campaign.spent_kes`
alone — that column is a lifetime running total with no date breakdown,
exactly the gap this whole feature closes).

**Bills each row its own snapshotted `Campaign.cpm_kes`-derived cost, not a
platform-wide constant** — see app/services/campaign_billing.py's
`record_campaign_impressions` docstring for the exact bug this project
already hit once (billing a live constant instead of a campaign's own
snapshot) and fixed; this table's writer reuses that same already-computed
per-row cost rather than re-deriving it, so it can never drift out of sync
with what `spent_kes` itself was actually incremented by in the same call.
"""

from __future__ import annotations

import uuid
from datetime import date as date_
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignDailyStats(Base):
    __tablename__ = "campaign_daily_stats"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        primary_key=True,
    )
    stat_date: Mapped[date_] = mapped_column(Date, primary_key=True)

    impression_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    click_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spend_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
