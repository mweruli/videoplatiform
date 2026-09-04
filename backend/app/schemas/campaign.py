"""Schemas for Phase 1b's self-serve advertiser campaign manager.

See app/models/campaign.py, app/models/campaign_funding.py,
app/services/campaign_billing.py, and docs/decisions.md's "Phase 1b design
pass: self-serve advertiser campaign manager" entry (plus its same-day
billing-rate-bug follow-up) for the full design writeup this implements.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.campaign_pricing import MIN_FUNDING_KES
from app.models.campaign import CampaignStatus
from app.models.campaign_funding import CampaignFundingStatus
from app.schemas.business import BusinessSummary
from app.schemas.campaign_targeting import CampaignTargetingRead
from app.schemas.category import CategoryRead
from app.schemas.product import ProductSummary
from app.utils.phone import is_valid_phone, normalize_phone

__all__ = [
    "CampaignCreate",
    "CampaignFundingCreate",
    "CampaignFundingRead",
    "CampaignModerationAction",
    "CampaignPricingRead",
    "CampaignRead",
    "CampaignRejectAction",
    "CampaignTargetingRead",
    "CampaignUpdate",
]


class CampaignPricingRead(BaseModel):
    """`GET /campaigns/pricing` — public, so the frontend never hardcodes the
    CPM rate/minimum top-up (see app/core/campaign_pricing.py, the single
    source of truth these are read from)."""

    cpm_kes: Decimal
    cost_per_impression_kes: Decimal
    min_funding_kes: Decimal


class CampaignCreate(BaseModel):
    """Body for `POST /businesses/{business_id}/campaigns`. `product_id=None`
    promotes the business itself; a non-null value promotes that one product
    (validated to belong to `business_id` at the endpoint layer, same
    endpoint-level-invariant convention as `FeaturedPurchase`/`Video`). Both
    targeting dimensions are optional/independent — see app/models/
    campaign.py's module docstring."""

    name: str = Field(min_length=2, max_length=200)
    product_id: uuid.UUID | None = None
    category_id: int | None = None
    county: str | None = Field(default=None, max_length=100)


class CampaignUpdate(BaseModel):
    """PATCH semantics — all fields optional. Deliberately excludes
    `product_id`/`business_id`: the target is immutable after creation (same
    convention as `FeaturedPurchase` never allowing its target to change) —
    an advertiser who wants to promote a different product creates a new
    campaign. Editing any of these fields re-triggers moderation review on an
    already-reviewed campaign — see the endpoint for the exact state-machine
    reset rule."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    category_id: int | None = None
    county: str | None = Field(default=None, max_length=100)


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    business: BusinessSummary
    product: ProductSummary | None
    name: str
    category: CategoryRead | None
    county: str | None
    cpm_kes: Decimal
    budget_kes: Decimal
    spent_kes: Decimal
    remaining_kes: Decimal = Decimal("0")
    impression_count: int
    click_count: int
    status: CampaignStatus
    moderation_note: str | None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _compute_remaining(self) -> CampaignRead:
        """Computed, not stored — `budget_kes - spent_kes`, floored at 0 (a
        campaign can't have negative remaining headroom; the atomic
        deduction guard in app/services/campaign_billing.py never lets
        `spent_kes` exceed `budget_kes` in the first place, this floor is
        just defensive). Done as an `after` validator, not a `before` one
        reading `info.data`, because a `before` field validator never even
        runs for a field whose raw value is absent from the source object
        (Campaign has no `remaining_kes` column) — it silently falls back to
        the field's declared default without invoking the validator at all."""
        remaining = self.budget_kes - self.spent_kes
        self.remaining_kes = remaining if remaining > 0 else Decimal("0")
        return self


class CampaignModerationAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class CampaignRejectAction(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class CampaignFundingCreate(BaseModel):
    """Body for `POST /campaigns/{id}/funding`. `amount_kes` is
    advertiser-chosen (no pricing tier for a top-up — see
    app/models/campaign_funding.py's module docstring), validated against
    `MIN_FUNDING_KES`. `phone` is the MSISDN the STK Push prompt is sent to,
    same "explicitly supplied, not assumed to be the account's own phone"
    reasoning as `FeaturedPurchaseCreate.phone`."""

    amount_kes: Decimal = Field(gt=0)
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("amount_kes")
    @classmethod
    def _validate_min_funding(cls, value: Decimal) -> Decimal:
        if value < MIN_FUNDING_KES:
            raise ValueError(f"amount_kes must be at least {MIN_FUNDING_KES}.")
        return value

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str) -> str:
        normalized = normalize_phone(value)
        if not is_valid_phone(normalized):
            raise ValueError("Phone number must be a valid Kenyan MSISDN.")
        return normalized


class CampaignFundingRead(BaseModel):
    """Deliberately omits `checkout_request_id`/`merchant_request_id` — same
    "server-internal correlator, not for the frontend" reasoning as
    `FeaturedPurchaseRead`."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: uuid.UUID
    amount_kes: Decimal
    status: CampaignFundingStatus
    mpesa_receipt_number: str | None
    created_at: datetime
