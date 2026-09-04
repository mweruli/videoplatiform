"""Schemas for Phase 1b's M-Pesa self-serve featured-placement purchases.

See app/models/featured_purchase.py and docs/decisions.md ("Phase 1b design
pass: M-Pesa self-serve payments for featured placement", and the later
"Admin-editable pricing" entry that replaced the fixed `FeaturedPricingTier`
enum with the `FeaturedPricingTier` DB model) for the full design writeup
this implements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.featured_purchase import FeaturedPurchaseStatus
from app.utils.phone import is_valid_phone, normalize_phone


class FeaturedPurchaseCreate(BaseModel):
    """Body for `POST /businesses/{business_id}/featured-purchases`.
    `tier_id` references a currently-`is_active` `FeaturedPricingTier` row
    (app/models/featured_pricing_tier.py) — resolved and validated at the
    endpoint layer (400 if unknown or inactive), not here, since that needs a
    DB session. `product_id=None` features the business itself; a non-null
    value features that one product (validated to belong to `business_id` at
    the endpoint layer — see app/models/featured_purchase.py's module
    docstring for why this is an endpoint-level invariant, not a DB
    constraint). `phone` is the MSISDN the STK Push prompt is sent to —
    explicitly supplied rather than assumed to be the caller's own account
    phone, since the person paying for placement may pay from a different
    line."""

    tier_id: int
    product_id: uuid.UUID | None = None
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str) -> str:
        normalized = normalize_phone(value)
        if not is_valid_phone(normalized):
            raise ValueError("Phone number must be a valid Kenyan MSISDN.")
        return normalized


class FeaturedPurchaseRead(BaseModel):
    """Deliberately omits `checkout_request_id`/`merchant_request_id`/other
    internal M-Pesa correlation fields — those are server-internal
    correlators for the callback handler, not something the frontend needs
    or should see.

    `tier_label` is a plain snapshotted string, not the live tier row (which
    may since have been edited or deactivated) — see
    app/models/featured_purchase.py's module docstring for why."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    product_id: uuid.UUID | None
    tier_label: str
    amount_kes: Decimal
    duration_days: int
    status: FeaturedPurchaseStatus
    payer_phone: str
    mpesa_receipt_number: str | None
    failure_reason: str | None
    featured_until: datetime | None
    created_at: datetime
