"""CampaignFunding model — individual M-Pesa STK Push top-up transactions
against a Campaign (app/models/campaign.py).

Why a separate model from `Campaign` itself, and why it looks like
`FeaturedPurchase` but isn't the same table: a `Campaign` can be topped up
more than once over its life (unlike `FeaturedPurchase`, which *is* the
one-shot purchase — a campaign's "purchase" is really an ongoing budget that
accumulates across many top-ups). Each top-up is its own fire-and-forget
STK-Push-then-async-callback transaction with its own pending/completed/
failed lifecycle, so it needs the same durable, individually-addressable
row `FeaturedPurchase` uses for the same reason (support/dispute questions,
"I was charged but the campaign wasn't topped up", a failed top-up leaving
no trace otherwise) — a running `Campaign.budget_kes` total alone can't
answer "which of my top-ups actually went through."

**Deliberately its own `CampaignFundingStatus` enum, not a reuse of
`FeaturedPurchaseStatus`** even though the three values (pending/completed/
failed) are identical. Unlike Product/Video sharing one `ModerationStatus`
(the exact same review pipeline, reused on purpose — see
docs/decisions.md), `FeaturedPurchase` and `CampaignFunding` are two
independently-owned features with their own migrations/enum-name strings
(`featured_purchase_status` vs `campaign_funding_status`) — cross-importing
one enum from the other's module would create a coupling between two
otherwise-unrelated fast-follow features for zero migration/code savings
(each still needs its own `Enum(..., name=...)` mapped_column either way).
Kept separate so a future change to one funding flow's states doesn't
silently ripple into the other's.

`amount_kes` is advertiser-chosen at funding time (unlike
`FeaturedPurchase.amount_kes`, which snapshots a fixed pricing tier) — a
campaign top-up has no "tier," the advertiser types in how much to add,
validated against `app/core/campaign_pricing.py`'s `MIN_FUNDING_KES` floor.

M-Pesa STK Push correlation fields (`checkout_request_id`,
`merchant_request_id`, `payer_phone`, `mpesa_receipt_number`, `result_code`,
`failure_reason`) are byte-for-byte the same shape and reasoning as
`FeaturedPurchase`'s — see that model's docstring for the full validation-
posture writeup, which applies identically here. The Safaricom-facing
callback endpoint (`POST /payments/mpesa/callback`,
app/api/v1/endpoints/payments.py) is extended, not duplicated, to also look
up `CampaignFunding` by `checkout_request_id` when no `FeaturedPurchase`
matches — see docs/decisions.md for why one shared webhook URL is kept
rather than standing up a second Safaricom-facing endpoint (`checkout_request_id`
values are Safaricom-generated and globally unique per STK push regardless
of which of this codebase's tables initiated it, so there's no collision
risk in sharing the lookup-by-id space across both tables).
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.campaign import Campaign
    from app.models.user import User


class CampaignFundingStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class CampaignFunding(Base):
    __tablename__ = "campaign_fundings"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    initiated_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Advertiser-chosen top-up amount (validated >= MIN_FUNDING_KES at the
    # schema layer) — see module docstring for why this isn't a snapshotted
    # pricing-tier amount the way FeaturedPurchase's is.
    amount_kes: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    status: Mapped[CampaignFundingStatus] = mapped_column(
        Enum(CampaignFundingStatus, name="campaign_funding_status", native_enum=False, length=20),
        default=CampaignFundingStatus.PENDING,
        nullable=False,
        index=True,
    )

    # --- M-Pesa STK Push correlation — identical shape/reasoning to
    # FeaturedPurchase's equivalent fields, see that model's docstring. ---
    checkout_request_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    merchant_request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payer_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    mpesa_receipt_number: Mapped[str | None] = mapped_column(String(50))
    result_code: Mapped[int | None] = mapped_column(Integer)
    failure_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    campaign: Mapped[Campaign] = relationship(lazy="joined")
    initiated_by: Mapped[User] = relationship(lazy="joined")
