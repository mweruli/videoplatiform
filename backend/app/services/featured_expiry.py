"""Featured-placement expiry: "sweep on read", deliberately not a background
job.

Why: self-serve featured purchases (app/models/featured_purchase.py) are
time-limited (`Business.featured_until` / `Product.featured_until`), unlike
the pre-existing admin-set *permanent* featuring (`is_featured=True`,
`featured_until=NULL` — untouched by this module; see those columns'
docstrings). Something has to flip `is_featured` back to `False` once
`featured_until` passes.

This codebase has no job/scheduler infra wired up as of this writing:
DEVELOPMENT_PLAN.md's tech stack lists "arq/Celery for async jobs" as
aspirational, but neither package appears in requirements.txt, there's no
worker service in docker-compose.yml, and no queue is otherwise wired up
anywhere in the codebase (checked before writing this). Introducing a whole
new job-scheduler subsystem for this one narrow need — flip a boolean once a
timestamp passes — would be disproportionate new infra for a fast-follow
feature, and cuts against this project's own "buy, don't build" /
smallest-thing-that-satisfies-the-requirement posture.

Instead: a cheap, idempotent, indexed bulk UPDATE, run immediately before
each read of the affected table, flips any row where
`is_featured=True AND featured_until IS NOT NULL AND featured_until <= now()`
back to `is_featured=False, featured_until=NULL`. Call
`sweep_expired_featured_businesses()` / `sweep_expired_featured_products()`
at the top of every public endpoint that reads or filters on `is_featured`
— `GET /businesses`, `GET /businesses/{id}`, `GET /businesses/slug/{slug}`,
`GET /products`, `GET /products/{id}` (see the handoff plan in
docs/decisions.md for the exact call sites the backend-engineer round should
wire this into).

The overwhelming majority of calls match zero rows (a single indexed WHERE
scan against `featured_until`, which is indexed on both tables — see the
migration) — cost is negligible. When a row *has* expired, whichever request
happens to run next self-heals it before serving results, so the public API
is always correct with no propagation lag, and the boolean stays truthful in
the database itself (not just at response-serialization time) for anything
else that ever queries `is_featured` directly later — a future Meilisearch
sync job, an analytics query, an admin CSV export, etc.

If this ever becomes a measurable cost at real scale (it won't at Phase 1b
traffic), moving the sweep into a scheduled arq job is a one-file change:
call this same function from a cron-triggered task instead of from the
request path. The function signature deliberately doesn't change either way.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.business import Business
from app.models.product import Product


def sweep_expired_featured_businesses(db: Session) -> int:
    """Returns the number of businesses just unfeatured (0 in the common
    case). Commits — safe to call at the top of a read-only request; this
    codebase commits per-operation rather than once at request end (see
    app/db/session.py), so an extra small commit mid-GET is consistent with
    how every other endpoint in this codebase already uses the session."""
    result = db.execute(
        update(Business)
        .where(
            Business.is_featured.is_(True),
            Business.featured_until.is_not(None),
            Business.featured_until <= datetime.now(UTC),
        )
        .values(is_featured=False, featured_until=None)
    )
    db.commit()
    return result.rowcount or 0


def sweep_expired_featured_products(db: Session) -> int:
    """Product equivalent of sweep_expired_featured_businesses() — see that
    function's docstring."""
    result = db.execute(
        update(Product)
        .where(
            Product.is_featured.is_(True),
            Product.featured_until.is_not(None),
            Product.featured_until <= datetime.now(UTC),
        )
        .values(is_featured=False, featured_until=None)
    )
    db.commit()
    return result.rowcount or 0
