"""Daily, timestamped analytics upserts — the write-path half of Phase 1b's
"advanced business analytics dashboard" fast-follow item (DEVELOPMENT_PLAN.md).
Every function here is called from inside the exact same request/transaction
that already increments a lifetime counter (`Business`/`Product`/
`Video.view_count`/`impression_count`, `Campaign.impression_count`/
`click_count`/`spent_kes`) — see docs/decisions.md's "core analytics: daily
timeseries layer" entry for the full design writeup, and each
`app/models/*_daily_stats.py` module for the per-table reasoning.

**No job/scheduler infrastructure exists in this codebase — reconfirmed
before writing this module, not assumed from a prior session.** No `arq` or
`celery` in requirements.txt, no worker/beat service in docker-compose.yml,
nothing in `app/` imports either package — the identical finding
app/services/featured_expiry.py's module docstring already documented for
the featured-placement sweep. This module needs no such infrastructure
either: every function below is called synchronously, inline, from a request
that is already happening (a view/impression/click hit, or a campaign
impression-billing call) — there is no "roll up yesterday's data overnight"
step anywhere in this design.

**Why Postgres `INSERT ... ON CONFLICT DO UPDATE`, never a Python
read-modify-write.** Two nearly-simultaneous requests recording the same
entity's view/impression/click on the same calendar day must never lose one
of the two increments. A naive "SELECT the row, add 1 in Python, UPDATE it
back" has a classic read-modify-write race: both requests' SELECTs can read
the same pre-increment value before either commits, and one increment is
silently dropped — this would silently corrupt analytics data (not billing
data, but still real data other trend numbers depend on being accurate).
`INSERT ... ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x` computes the new
value from the row's own current-at-lock-time value entirely inside one
atomic statement — Postgres serializes concurrent upserts targeting the same
conflict key, so no increment can be dropped. Same "let the database itself
resolve the race" principle already proven under real 40-thread concurrency
for app/services/campaign_billing.py's budget deduction — re-verified for
this module too under equivalent concurrency (see docs/decisions.md).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Table
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.business_daily_stats import BusinessDailyStats
from app.models.campaign_daily_stats import CampaignDailyStats
from app.models.product_daily_stats import ProductDailyStats
from app.models.video_daily_stats import VideoDailyStats


def _today() -> date:
    """UTC calendar date — see each `*_daily_stats.py` model's module
    docstring for why UTC (not Africa/Nairobi-local) is the deliberate,
    documented MVP choice for `stat_date`."""
    return datetime.now(UTC).date()


def _upsert_one(
    db: Session,
    table: Table,
    id_col_name: str,
    entity_id: uuid.UUID,
    increments: dict[str, int | Decimal],
) -> None:
    """Shared low-level upsert for a single entity's today-row. Not
    committed here — callers share the same transaction/commit boundary as
    the lifetime-counter update they're piggybacking on (SQLAlchemy's
    autoflush sends this statement to Postgres ahead of the caller's own
    `db.commit()`, so both land in one transaction)."""
    values = {id_col_name: entity_id, "stat_date": _today(), **increments}
    stmt = pg_insert(table).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[id_col_name, "stat_date"],
        set_={col: table.c[col] + stmt.excluded[col] for col in increments},
    )
    db.execute(stmt)


def _upsert_many(
    db: Session,
    table: Table,
    id_col_name: str,
    rows: list[dict],
    metric_cols: list[str],
) -> None:
    """Batched version of `_upsert_one` — one multi-row `INSERT ... ON
    CONFLICT` statement for N entities at once (used by the impression-batch
    endpoints and campaign billing, where a single call can touch many
    entities). Each conflicting row's `SET` clause references *that row's
    own* `EXCLUDED` values, so a multi-row statement increments/bills each
    entity independently and correctly even when several are mixed into one
    call — standard, well-defined Postgres `ON CONFLICT` semantics, not a
    workaround. Callers must pass at most one row per entity id (the ids
    driving `rows` already come from a `WHERE id IN (...)` match, so this is
    naturally satisfied) — Postgres raises if the *same* conflict key
    appears twice within one `INSERT`'s own VALUES list."""
    if not rows:
        return
    stmt = pg_insert(table).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[id_col_name, "stat_date"],
        set_={col: table.c[col] + stmt.excluded[col] for col in metric_cols},
    )
    db.execute(stmt)


# --- Business ---------------------------------------------------------


def record_business_view_daily(db: Session, business_id: uuid.UUID) -> None:
    _upsert_one(
        db, BusinessDailyStats.__table__, "business_id", business_id, {"view_count": 1}
    )


def record_business_impressions_daily(db: Session, business_ids: list[uuid.UUID]) -> None:
    day = _today()
    rows = [
        {"business_id": bid, "stat_date": day, "impression_count": 1}
        for bid in business_ids
    ]
    _upsert_many(
        db, BusinessDailyStats.__table__, "business_id", rows, ["impression_count"]
    )


# --- Product ------------------------------------------------------------


def record_product_view_daily(db: Session, product_id: uuid.UUID) -> None:
    _upsert_one(
        db, ProductDailyStats.__table__, "product_id", product_id, {"view_count": 1}
    )


def record_product_impressions_daily(db: Session, product_ids: list[uuid.UUID]) -> None:
    day = _today()
    rows = [
        {"product_id": pid, "stat_date": day, "impression_count": 1}
        for pid in product_ids
    ]
    _upsert_many(
        db, ProductDailyStats.__table__, "product_id", rows, ["impression_count"]
    )


# --- Video --------------------------------------------------------------


def record_video_view_daily(db: Session, video_id: uuid.UUID) -> None:
    _upsert_one(db, VideoDailyStats.__table__, "video_id", video_id, {"view_count": 1})


# --- Campaign -------------------------------------------------------------


def record_campaign_impressions_daily(
    db: Session, campaign_costs: dict[uuid.UUID, Decimal]
) -> None:
    """`campaign_costs` maps each campaign id actually billed this call to
    the per-impression cost billed to it this call (`Campaign.cpm_kes /
    1000`, read from the same `RETURNING` clause the atomic budget-deduction
    UPDATE in app/services/campaign_billing.py already produces) — this
    function never re-derives or re-reads the rate itself, it only records
    what the billing statement already decided, so this table can never
    drift out of sync with what `spent_kes` was actually incremented by."""
    if not campaign_costs:
        return
    day = _today()
    rows = [
        {
            "campaign_id": cid,
            "stat_date": day,
            "impression_count": 1,
            "spend_kes": cost,
        }
        for cid, cost in campaign_costs.items()
    ]
    _upsert_many(
        db,
        CampaignDailyStats.__table__,
        "campaign_id",
        rows,
        ["impression_count", "spend_kes"],
    )


def record_campaign_clicks_daily(db: Session, campaign_ids: list[uuid.UUID]) -> None:
    if not campaign_ids:
        return
    day = _today()
    rows = [
        {"campaign_id": cid, "stat_date": day, "click_count": 1} for cid in campaign_ids
    ]
    _upsert_many(
        db, CampaignDailyStats.__table__, "campaign_id", rows, ["click_count"]
    )
