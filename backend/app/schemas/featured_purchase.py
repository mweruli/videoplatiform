"""Schemas for Phase 1b's M-Pesa self-serve featured-placement purchases.

See app/models/featured_purchase.py and docs/decisions.md ("Phase 1b design
pass: M-Pesa self-serve payments for featured placement") for the full design
writeup this implements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.featured_pricing import FeaturedPricingTier
from app.models.featured_purchase import FeaturedPurchaseStatus
from app.utils.phone import is_valid_phone, normalize_phone


class FeaturedPricingOptionRead(BaseModel):
    """`GET /featured/pricing` — public, so the frontend never hardcodes
    amounts/durations (see app/core/featured_pricing.py, the single source
    of truth these are read from)."""

    tier: FeaturedPricingTier
    label: str
    amount_kes: Decimal
    duration_days: int


class FeaturedPurchaseCreate(BaseModel):
    """Body for `POST /businesses/{business_id}/featured-purchases`.
    `product_id=None` features the business itself; a non-null value
    features that one product (validated to belong to `business_id` at the
    endpoint layer — see app/models/featured_purchase.py's module docstring
    for why this is an endpoint-level invariant, not a DB constraint).
    `phone` is the MSISDN the STK Push prompt is sent to — explicitly
    supplied rather than assumed to be the caller's own account phone, since
    the person paying for placement may pay from a different line."""

    tier: FeaturedPricingTier
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
    or should see."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    product_id: uuid.UUID | None
    tier: FeaturedPricingTier
    amount_kes: Decimal
    duration_days: int
    status: FeaturedPurchaseStatus
    payer_phone: str
    mpesa_receipt_number: str | None
    failure_reason: str | None
    featured_until: datetime | None
    created_at: datetime
