"""Campaign budget/status mechanics for Phase 1b's self-serve advertiser
campaign manager: atomic, race-safe impression billing against a prepaid
budget, click counting (analytics-only, never billed — see
app/core/campaign_pricing.py), and the funding/approval status transitions
that move a Campaign between APPROVED/ACTIVE/EXHAUSTED.

Mirrors app/services/featured_expiry.py's spirit (a small, focused,
transaction-owning module the endpoint layer calls into rather than
duplicating SQL in every route) but there is no "sweep on read" here — a
Campaign's status never silently drifts out of truth the way
Business/Product.is_featured could against an unwatched clock. Every status
change (exhaustion, funding-triggered activation, owner pause/resume,
moderation) happens synchronously, in the same statement/transaction as
whatever caused it, at the single call site responsible for it. That's why
this module has no `sweep_*` function and none is needed: nothing external
to these functions (and the endpoint layer's own moderation/pause/resume
actions) can change `spent_kes` or `budget_kes` out from under a row between
reads.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import case, update
from sqlalchemy.orm import Session

from app.models.campaign import Campaign, CampaignStatus


def record_campaign_impressions(db: Session, campaign_ids: list[uuid.UUID]) -> int:
    """Atomically bills each campaign's own snapshotted `cpm_kes` (divided by
    1,000 for a per-impression cost) against every currently-ACTIVE campaign
    in `campaign_ids`, incrementing `impression_count`, and flips a campaign
    straight to EXHAUSTED in the *same* statement the instant its spend
    would reach its budget ceiling.

    **Bills `Campaign.cpm_kes`, not the current `campaign_pricing.CPM_KES`
    constant — this matters and was a real bug caught before this shipped.**
    An earlier version of this function imported and billed the module-level
    `COST_PER_IMPRESSION_KES` constant directly, which silently contradicted
    `Campaign.cpm_kes`'s own documented purpose (snapshot the rate at
    creation time "so a future rate change never retroactively alters an
    already-running campaign's economics" — see app/models/campaign.py and
    app/core/campaign_pricing.py's docstrings). Billing the live constant
    instead of each row's own snapshot meant a future platform rate change
    would have immediately repriced every already-running campaign too,
    exactly the outcome the snapshot exists to prevent. Fixed by computing
    the per-impression cost as a per-row SQL expression (`Campaign.cpm_kes /
    1000`) so a batch call spanning campaigns created under different
    historical rates still bills each one correctly.

    **Why this must be one atomic UPDATE, not read-then-write**: two nearly
    simultaneous calls (e.g. two users' browsers both rendering the same
    sponsored result at once) must never be able to jointly push
    `spent_kes` past `budget_kes`. The guard is the WHERE clause itself —
    ``WHERE status = 'active' AND spent_kes + cpm_kes/1000 <= budget_kes``
    — built from bare column expressions, so Postgres evaluates it against
    each row's live, currently-committed values at the moment this
    statement takes that row's lock, not against a value read into Python
    earlier. This is standard READ COMMITTED "UPDATE re-checks its WHERE
    against the latest committed row version before applying" behavior — no
    explicit `SELECT ... FOR UPDATE` or elevated isolation level needed.
    Verified under simulated concurrency — see docs/decisions.md for the
    reproduction and result.

    The `status` flip to EXHAUSTED is computed with a SQL `CASE` in the same
    `SET` clause as the spend increment, so an external reader can never
    observe `spent_kes >= budget_kes` with `status` still `'active'` — there
    is no separate "now go flip the status" follow-up statement/transaction
    that could be observed half-applied.

    A campaign whose remaining headroom is smaller than one impression's
    cost is left with that small unspendable remainder once it exhausts —
    accepted, not a bug, same as any fixed-unit-price billing model.

    Ids that don't resolve to a currently-ACTIVE campaign (paused, pending
    review, exhausted, rejected, completed, or nonexistent) are silently
    skipped, matching `record_business_impressions`/`record_product_impressions`'s
    existing "a stale id in a render's batch shouldn't fail the whole call"
    philosophy (app/api/v1/endpoints/businesses.py / products.py).

    Returns the number of campaigns actually billed this call.
    """
    if not campaign_ids:
        return 0

    cost = Campaign.cpm_kes / Decimal(1000)
    new_spent = Campaign.spent_kes + cost
    stmt = (
        update(Campaign)
        .where(
            Campaign.id.in_(campaign_ids),
            Campaign.status == CampaignStatus.ACTIVE,
            new_spent <= Campaign.budget_kes,
        )
        .values(
            spent_kes=new_spent,
            impression_count=Campaign.impression_count + 1,
            # NOTE: this codebase's `Enum(..., native_enum=False)` columns
            # store the Python enum member's *name* (e.g. "ACTIVE"), not its
            # `.value` ("active") — confirmed against the mapped column's
            # own bind_processor, not assumed. A bare CampaignStatus member
            # handed to `case()` does NOT reliably go through that same
            # bind processor (case()'s literal-type inference picks its own
            # generic Enum type for a bare Python enum value, which does not
            # match this column's actual on-the-wire representation) — using
            # plain `.name` strings here sidesteps that ambiguity entirely
            # and is guaranteed correct because it's the literal string this
            # column already stores.
            status=case(
                (new_spent >= Campaign.budget_kes, CampaignStatus.EXHAUSTED.name),
                else_=CampaignStatus.ACTIVE.name,
            ),
        )
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def record_campaign_clicks(db: Session, campaign_ids: list[uuid.UUID]) -> int:
    """Analytics-only click counter — never touches `spent_kes` (CPM-only
    for v1, see app/core/campaign_pricing.py). Same "currently-ACTIVE only,
    unknown/inactive ids silently skipped" policy as impressions, for
    consistency, though there is no race-safety concern here (a plain
    counter, no ceiling to respect)."""
    if not campaign_ids:
        return 0
    stmt = (
        update(Campaign)
        .where(Campaign.id.in_(campaign_ids), Campaign.status == CampaignStatus.ACTIVE)
        .values(click_count=Campaign.click_count + 1)
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def apply_campaign_funding(campaign: Campaign, amount_kes: Decimal) -> None:
    """Call once a `CampaignFunding` transaction COMPLETEs (from the M-Pesa
    callback handler, app/api/v1/endpoints/payments.py — see
    app/models/campaign_funding.py's module docstring for why that callback
    is extended rather than duplicated). Increments the campaign's budget
    and, only if the campaign is currently APPROVED or EXHAUSTED (i.e.
    waiting on *money*, not on moderation or an owner's pause), flips it
    straight to ACTIVE now that funding headroom exists.

    Deliberately leaves PENDING_REVIEW/REJECTED (still waiting on
    moderation — funding alone must never make an unreviewed or rejected
    campaign start serving) and PAUSED (an owner's explicit pause is
    respected; only `resume_campaign`-shaped endpoint logic should move a
    PAUSED campaign back to ACTIVE) untouched by funding alone.

    Mutates `campaign` in place and does not commit — the caller owns the
    transaction boundary alongside marking the `CampaignFunding` row
    COMPLETED, same pattern as payments.py's existing
    `_apply_completed_purchase` for `FeaturedPurchase`.
    """
    campaign.budget_kes = campaign.budget_kes + amount_kes
    if (
        campaign.status in (CampaignStatus.APPROVED, CampaignStatus.EXHAUSTED)
        and campaign.budget_kes > campaign.spent_kes
    ):
        campaign.status = CampaignStatus.ACTIVE


def resolve_status_after_approval(campaign: Campaign) -> CampaignStatus:
    """What `POST /admin/campaigns/{id}/approve` (endpoint-wiring round)
    should set `campaign.status` to once moderation itself has passed:
    ACTIVE immediately if the campaign already has funding headroom
    (`budget_kes > spent_kes` — e.g. an advertiser funded it while it was
    still pending review, funding and moderation being independent per
    docs/decisions.md), otherwise APPROVED — a moderated-but-not-yet-funded
    holding state that `apply_campaign_funding` will later promote to
    ACTIVE once a top-up completes. The approve endpoint should call this
    rather than hardcoding `CampaignStatus.APPROVED`."""
    if campaign.budget_kes > campaign.spent_kes:
        return CampaignStatus.ACTIVE
    return CampaignStatus.APPROVED
