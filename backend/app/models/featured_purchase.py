"""FeaturedPurchase model — Phase 1b fast-follow: "M-Pesa self-serve
payments for ads" (DEVELOPMENT_PLAN.md), scoped down to featured placement
only (no budgets/targeting/campaign date-ranges — see docs/decisions.md).

Why a dedicated table rather than fields on Business/Product: a purchase has
its own lifecycle (pending -> completed/failed) that is independent of, and
outlives, the business/product it targets — a rejected/failed payment still
needs a durable record (support/dispute questions, "why wasn't I featured"),
and a business can accumulate a purchase *history* (repeat placements) that
a single set of columns on Business/Product can't represent. Business/
Product only need to know the *current* effective state, which is exactly
the pre-existing `is_featured` bool plus one new column: `featured_until`
(nullable — see those models' docstrings and app/services/featured_expiry.py
for how it interacts with the pre-existing admin-set *permanent* featuring,
which leaves `featured_until` NULL and is untouched by any of this).

One purchase = one target, expressed structurally rather than via a flag:
`business_id` is always the paying business; `product_id` is NULL when the
purchase features the business itself, or set when it features one specific
product of that business. A row can never target both or neither. This is
an endpoint-level invariant (validate `product_id` belongs to `business_id`,
exactly like `Video.product_id`'s same-business check in
app/api/v1/endpoints/videos.py), not a DB constraint — consistent with how
this codebase already handles that class of cross-table invariant.

`amount_kes`/`duration_days` are snapshotted from
app/core/featured_pricing.py at purchase time, not live-joined to it — a
future pricing change must never retroactively alter a historical purchase.
`tier` is kept alongside the snapshot purely as a human-readable label of
which tier was chosen (analytics/support convenience), not the source of
truth for the amount/duration once the row exists.

Status is a real "waiting to hear back" state machine, not a boolean,
because M-Pesa's STK Push is fire-and-forget-then-async-callback: a purchase
sits in PENDING from the moment the STK Push is accepted until Safaricom's
callback arrives (see app/services/mpesa.py), then moves to exactly one of
COMPLETED or FAILED and never changes again — there is no "retry the same
purchase" path; a failed/cancelled STK push means the caller starts a new
purchase (a fresh row), matching how M-Pesa itself treats a CheckoutRequestID
as single-use.
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

from app.core.featured_pricing import FeaturedPricingTier
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.product import Product
    from app.models.user import User


class FeaturedPurchaseStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class FeaturedPurchase(Base):
    __tablename__ = "featured_purchases"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # NULL = this purchase features the business itself. Non-NULL = it
    # features that one product instead. See module docstring for the
    # "exactly one target" invariant and why it's endpoint-enforced.
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        index=True,
    )
    # Who clicked "buy" — the business owner in the normal case, or a
    # platform_admin acting on a business's behalf. Kept for audit/support
    # ("who authorised this charge") even though it's always derivable from
    # request context at creation time; a purchase row should be
    # self-describing without needing to correlate against request logs.
    initiated_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    tier: Mapped[FeaturedPricingTier] = mapped_column(
        Enum(FeaturedPricingTier, name="featured_purchase_tier", native_enum=False, length=20),
        nullable=False,
    )
    # Snapshotted from app/core/featured_pricing.py at purchase time — see
    # module docstring.
    amount_kes: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[FeaturedPurchaseStatus] = mapped_column(
        Enum(FeaturedPurchaseStatus, name="featured_purchase_status", native_enum=False, length=20),
        default=FeaturedPurchaseStatus.PENDING,
        nullable=False,
        index=True,
    )

    # --- M-Pesa STK Push correlation (see app/services/mpesa.py) ---
    # CheckoutRequestID is the only thing Safaricom's async callback carries
    # that ties it back to this row, so it's unique+indexed and is the
    # primary lookup key for the callback handler. MerchantRequestID is
    # stored too and cross-checked on callback as a cheap second correlation
    # factor — Daraja callbacks are not cryptographically signed, see
    # docs/decisions.md for the full validation-posture writeup.
    checkout_request_id: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    merchant_request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # The MSISDN the STK push was actually sent to — explicitly supplied at
    # purchase time (not silently assumed to be the caller's account phone),
    # since the person paying for placement may pay from a different line.
    payer_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    mpesa_receipt_number: Mapped[str | None] = mapped_column(String(50))
    result_code: Mapped[int | None] = mapped_column(Integer)
    failure_reason: Mapped[str | None] = mapped_column(Text)

    # Set only on COMPLETED, from the moment the callback is processed —
    # see app/services/featured_expiry.py for how this is later reconciled
    # back to Business.is_featured/Product.is_featured.
    featured_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

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
    initiated_by: Mapped[User] = relationship(lazy="joined")
