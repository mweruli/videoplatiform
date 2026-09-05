"""BusinessDailyStats — timestamped daily analytics layer for Phase 1b's
"advanced business analytics dashboard" fast-follow item (DEVELOPMENT_PLAN.md).
See docs/decisions.md's "core analytics: daily timeseries layer" entry for
the full design writeup; this docstring only covers what needs to live in
code.

**Why this table exists alongside Business.view_count/impression_count, not
instead of them.** The Phase 1a lifetime counters (see the 2026-09-04 "core
analytics" entry in docs/decisions.md) answer "how many total," never "how
many this week vs last week" — a trend needs a value recorded *with a date*,
not folded into one running integer. This table is written to inside the
exact same request that already increments the lifetime counter (see
`record_business_view`/`record_business_impressions` in
app/api/v1/endpoints/businesses.py, via app/services/daily_stats.py) — no new
write path, no background job, no scheduler. It is purely additive: deleting
this table would not change what `Business.view_count`/`impression_count`
report, and vice versa.

**Composite primary key (`business_id`, `stat_date`), no surrogate id** —
same "the natural key IS the identity" convention already used by this
codebase's other multi-column keyed tables (`product_categories`/
`video_categories`'s composite `(product_id|video_id, category_id)` PKs in
app/models/product.py / app/models/video.py). One row per business per
calendar day; a second write on the same day upserts the existing row rather
than creating a duplicate.

**Upserted via Postgres `INSERT ... ON CONFLICT DO UPDATE`, never a Python
read-modify-write** — see app/services/daily_stats.py for the shared upsert
helper and the concurrency reasoning (the same "let the database's own
atomic statement resolve the race" principle already proven under real
concurrency for app/services/campaign_billing.py's budget deduction, and
re-verified for this table — see docs/decisions.md).

**`stat_date` is a UTC calendar date, not Africa/Nairobi-local** — a
deliberate, documented MVP simplification: Kenya is UTC+3, so activity
between roughly 21:00-23:59 Nairobi time lands in "tomorrow"'s UTC bucket.
This only affects a few hours near the day boundary, not the overall shape a
trend chart is meant to convey — revisit only if a real business owner
reports a day-boundary discrepancy, not solved preemptively by threading a
timezone through every write path.

**No retention/pruning policy.** This table grows by at most one row per
business per day (bounded, tiny growth at this platform's scale) — no
archival/deletion mechanism is built now. Flagged as a future concern in
docs/decisions.md, not solved for a scale this platform isn't at.
"""

from __future__ import annotations

import uuid
from datetime import date as date_

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BusinessDailyStats(Base):
    __tablename__ = "business_daily_stats"

    business_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    stat_date: Mapped[date_] = mapped_column(Date, primary_key=True)

    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    impression_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
