"""Campaign model — Phase 1b fast-follow: "self-serve advertiser campaign
manager" (DEVELOPMENT_PLAN.md). See docs/decisions.md's "Phase 1b design
pass: self-serve advertiser campaign manager" entry for the full design
writeup this model implements; only the parts that need to live in code
comments (not re-derivable from reading the columns) are repeated here.

**One campaign = one target, same structural convention as
`FeaturedPurchase`** (see app/models/featured_purchase.py's module
docstring — this is a direct reuse of that pattern, not a new invention):
`business_id` is always the paying/owning business; `product_id` is NULL
when the campaign promotes the business itself, or set when it promotes one
specific product of that business. Enforced at the endpoint layer (validate
`product_id` belongs to `business_id`), not a DB constraint — same
"endpoint-level invariant" precedent as `Video.product_id` and
`FeaturedPurchase.product_id`.

**Targeting is two independent, both-optional dimensions**: `category_id`
(FK to the existing `categories` table — NULL means "all categories") and
`county` (a free-text field, NULL means "all locations") — deliberately
reusing the exact fields/conventions that already exist on Business/Product
(`Business.category_id`, `Business.county`/`Product.county`) rather than
inventing a parallel geography or category concept. A campaign does not have
to target a category/location its own business or product actually belongs
to — targeting is an independent advertiser choice (see docs/decisions.md
for the ad-serving-mechanic writeup on how this is matched against a
viewer's current browse/search context).

**Budget is prepaid and depletes with real spend — NOT a duration-based flat
fee like `FeaturedPurchase`.** `budget_kes` is the running total ever funded
(incremented by completed `CampaignFunding` rows, see that model), and
`spent_kes` is the running total actually billed against recorded
impressions (see app/services/campaign_billing.py for the atomic,
race-safe deduction). The campaign auto-transitions to EXHAUSTED the moment
`spent_kes` would reach `budget_kes` — see `CampaignStatus` below for the
full state machine.

**Pricing is CPM-only for v1** (see app/core/campaign_pricing.py's module
docstring for the full reasoning) — `cpm_kes` snapshots
`campaign_pricing.CPM_KES` at creation time, same "snapshot, don't
live-join" reasoning as `FeaturedPurchase.amount_kes`. `click_count` is
tracked for analytics (PROJECT_BRIEF.md's Advertising Analytics bullet
explicitly lists "clicks") but is NOT billed — clicks never touch
`spent_kes`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.category import Category
    from app.models.product import Product
    from app.models.user import User


class CampaignStatus(str, enum.Enum):
    """State machine (full writeup in docs/decisions.md — this is the
    reference summary, not a re-derivation):

    ``PENDING_REVIEW`` -- initial state on create. Funding IS accepted here
      (funding and moderation are independent — see docs/decisions.md) but
      the campaign never serves impressions in this state.
    ``REJECTED`` -- moderator rejected (from PENDING_REVIEW, or from
      APPROVED/ACTIVE/PAUSED/EXHAUSTED per this codebase's existing
      "approve/reject can act on already-reviewed content" convention — see
      the 2026-09-04 admin.py entry in docs/decisions.md). A rejected
      campaign can still be re-approved by a moderator (symmetric reversal,
      same as business/product/video) and can still accept funding, but
      cannot be edited by its owner (PATCH requires non-REJECTED... actually
      PATCH *is* allowed from REJECTED, see the endpoint plan — it resets
      back to PENDING_REVIEW like any other reviewed-content edit).
    ``APPROVED`` -- moderator approved, but not (yet, or no longer)
      sufficiently funded to serve (`spent_kes >= budget_kes`, including the
      `budget_kes == 0` case for a brand-new unfunded campaign). Holding
      state — becomes ACTIVE automatically the moment funding brings
      `budget_kes > spent_kes` while still APPROVED.
    ``ACTIVE`` -- approved AND funded (`budget_kes > spent_kes`) AND not
      owner-paused. The only status that serves impressions/clicks and that
      the impression-recording atomic UPDATE will touch.
    ``PAUSED`` -- owner-initiated pause of an ACTIVE campaign. Funding while
      PAUSED does NOT auto-resume it (owner's explicit pause is respected) —
      only an explicit ``POST /campaigns/{id}/resume`` moves it back to
      ACTIVE (unconditionally: a paused campaign never spends, so its budget
      headroom can't have changed while paused).
    ``EXHAUSTED`` -- budget fully spent; auto-set by the atomic deduction in
      app/services/campaign_billing.py the instant `spent_kes` reaches
      `budget_kes`. Recoverable: a completed top-up (`CampaignFunding`) that
      brings `budget_kes > spent_kes` again flips it straight back to
      ACTIVE (it was already approved to get here).
    ``COMPLETED`` -- owner deliberately ended the campaign
      (``POST /campaigns/{id}/complete``). Terminal by design: unlike
      EXHAUSTED (recoverable via top-up) this is the advertiser's own choice
      to stop, so it does not auto-reactivate on funding and cannot be
      edited/approved/rejected/funded again — a business that wants to
      advertise again creates a new campaign. This is what keeps "exhausted"
      and "completed" meaningfully distinct rather than being the same state
      under two names.
    """

    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    APPROVED = "approved"
    ACTIVE = "active"
    PAUSED = "paused"
    EXHAUSTED = "exhausted"
    COMPLETED = "completed"


# Statuses from which a moderator may REJECT — mirrors the exact
# "pending-or-already-reviewed" relaxation already applied to
# business/product/video approve/reject in app/api/v1/endpoints/admin.py
# (see docs/decisions.md's 2026-09-04 "approve/reject can now act on
# already-reviewed content" entry). EXHAUSTED is included deliberately: an
# exhausted-but-not-yet-rejected campaign could otherwise be silently
# revived by a top-up even after a moderator found a problem with it, which
# would defeat the point of rejecting it. COMPLETED is excluded — that's the
# advertiser's own terminal choice, not something moderation needs to
# override.
REJECTABLE_STATUSES = (
    CampaignStatus.PENDING_REVIEW,
    CampaignStatus.APPROVED,
    CampaignStatus.ACTIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.EXHAUSTED,
)

# Statuses from which a moderator may APPROVE — symmetric with reject: only
# PENDING_REVIEW (the normal path) or REJECTED (reversing an earlier
# rejection). Everything else is "already approved in some form" and 409s,
# same double-click-safety reasoning as the rest of this codebase's
# moderation endpoints.
APPROVABLE_STATUSES = (CampaignStatus.PENDING_REVIEW, CampaignStatus.REJECTED)

# A campaign in any of these statuses may still accept a new funding
# transaction — funding is independent of moderation (see docs/decisions.md)
# and even a paused/exhausted/rejected campaign has a legitimate reason to
# receive more money (paused: topping up for when it's resumed; exhausted:
# the whole point of a top-up; rejected: an owner funding ahead of an
# anticipated moderator reversal). Only COMPLETED — the owner's own
# deliberate "I'm done" — refuses further funding.
FUNDABLE_STATUSES = (
    CampaignStatus.PENDING_REVIEW,
    CampaignStatus.REJECTED,
    CampaignStatus.APPROVED,
    CampaignStatus.ACTIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.EXHAUSTED,
)

# A campaign may be owner-`complete`d from any state except COMPLETED itself
# (409, double-click safety) — ending a campaign early is always allowed,
# including from PENDING_REVIEW (the owner changed their mind before
# moderation ever ran) or REJECTED (formally closing out a rejected attempt
# instead of leaving it sitting there).
COMPLETABLE_STATUSES = (
    CampaignStatus.PENDING_REVIEW,
    CampaignStatus.REJECTED,
    CampaignStatus.APPROVED,
    CampaignStatus.ACTIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.EXHAUSTED,
)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # NULL = this campaign promotes the business itself. Non-NULL = it
    # promotes that one product instead. See module docstring for the
    # "exactly one target" invariant (endpoint-enforced, not a DB
    # constraint — same convention as FeaturedPurchase.product_id).
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
    )
    initiated_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)

    # --- Targeting (both optional/independent — see module docstring) ---
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    county: Mapped[str | None] = mapped_column(String(100), index=True)

    # --- Pricing (CPM-only v1 — see app/core/campaign_pricing.py) ---
    # Snapshotted from campaign_pricing.CPM_KES at creation time, same
    # "never let a later rate change retroactively alter this campaign's
    # economics" reasoning as FeaturedPurchase.amount_kes.
    cpm_kes: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # --- Budget (prepaid, depletes with spend — NOT a duration/flat fee) ---
    # Running total ever funded (sum of completed CampaignFunding amounts),
    # materialized here rather than computed via a live SUM every time it's
    # needed — this is also the value the atomic deduction UPDATE's WHERE
    # guard reads against, so it must be a plain column, not a query.
    budget_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    # Running total billed against recorded impressions. Only ever
    # incremented by app/services/campaign_billing.py's atomic, race-safe
    # UPDATE — never decremented (a "refund" concept doesn't exist yet).
    spent_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Analytics-only counters (PROJECT_BRIEF.md's Advertising Analytics
    # bullet: "impressions ... clicks ... campaign performance"). Both are
    # plain counters, no per-viewer dedup — same MVP bar as every other
    # view/impression counter in this codebase (Business/Product/Video).
    # impression_count is billed (drives spent_kes); click_count is NOT
    # billed (see app/core/campaign_pricing.py's CPM-only-for-v1 reasoning).
    impression_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    click_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status", native_enum=False, length=20),
        default=CampaignStatus.PENDING_REVIEW,
        nullable=False,
        index=True,
    )
    # Reused for both a moderator's rejection reason and (implicitly cleared)
    # on approval — same single-field convention as
    # Business.verification_note/Product.moderation_note.
    moderation_note: Mapped[str | None] = mapped_column(String(2000))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    business: Mapped[Business] = relationship(lazy="joined")
    product: Mapped[Product | None] = relationship(lazy="joined")
    category: Mapped[Category | None] = relationship(lazy="joined")
    initiated_by: Mapped[User] = relationship(lazy="joined")
