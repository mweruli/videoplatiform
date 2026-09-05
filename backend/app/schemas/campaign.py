"""Schemas for Phase 1b's self-serve advertiser campaign manager.

See app/models/campaign.py, app/models/campaign_funding.py,
app/services/campaign_billing.py, and docs/decisions.md's "Phase 1b design
pass: self-serve advertiser campaign manager" entry (plus its same-day
billing-rate-bug follow-up) for the full design writeup this implements.
"""

from __future__ import annotations

import uuid
from datetime import date as date_
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    "CampaignPricingUpdate",
    "CampaignRead",
    "CampaignRejectAction",
    "CampaignStatsTimeseries",
    "CampaignStatsTimeseriesDay",
    "CampaignTargetingRead",
    "CampaignUpdate",
]


class CampaignPricingRead(BaseModel):
    """`GET /campaigns/pricing` — public, so the frontend never hardcodes the
    CPM rate/minimum top-up. Reads from the single-row
    `campaign_pricing_settings` table (app/models/campaign_pricing_settings.py)
    — see docs/decisions.md's "Admin-editable pricing" entry for why this
    replaced the old hardcoded `CPM_KES`/`MIN_FUNDING_KES` constants."""

    cpm_kes: Decimal
    cost_per_impression_kes: Decimal
    min_funding_kes: Decimal


class CampaignPricingUpdate(BaseModel):
    """Body for `PATCH /admin/campaign-pricing` — PATCH semantics, both
    fields optional. Updates the live settings row; never retroactively
    alters an already-created `Campaign`'s snapshotted `cpm_kes` (see
    app/services/campaign_pricing.py's module docstring)."""

    cpm_kes: Decimal | None = Field(default=None, gt=0)
    min_funding_kes: Decimal | None = Field(default=None, gt=0)


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


class CampaignStatsTimeseriesDay(BaseModel):
    """One row of `CampaignStatsTimeseries.days` — see that model and
    `GET /campaigns/{id}/stats/timeseries`'s docstring. Every calendar day in
    the requested window appears here, zero-filled, same guarantee as
    `BusinessStatsTimeseriesDay` (app/schemas/business.py)."""

    date: date_
    impressions: int
    clicks: int
    spend_kes: Decimal


class CampaignStatsTimeseries(BaseModel):
    """`GET /campaigns/{id}/stats/timeseries` response — the per-day series
    plus a derived budget-exhaustion projection, per docs/decisions.md's
    "core analytics: daily timeseries layer" entry (2026-09-05 read-endpoint
    follow-up): `projected_days_remaining` is a trailing-7-day average daily
    spend (over the most recent `min(7, len(days))` days of the *requested*
    window, zero-filled, so a quiet recent week correctly pulls the average
    down) divided into `remaining_kes` (`budget_kes - spent_kes`, floored at
    0, same as `CampaignRead.remaining_kes`). `None` when the trailing
    average is exactly 0 (no recent spend at all) — a campaign that hasn't
    spent anything lately has no meaningful "time until exhausted" to
    project, so this returns `None` rather than a division-by-zero error or
    a nonsensical `Infinity`. Computed fresh on every call, never stored or
    cached."""

    campaign_id: uuid.UUID
    days: list[CampaignStatsTimeseriesDay]
    remaining_kes: Decimal
    avg_daily_spend_kes: Decimal
    projected_days_remaining: float | None


class CampaignFundingCreate(BaseModel):
    """Body for `POST /campaigns/{id}/funding`. `amount_kes` is
    advertiser-chosen (no pricing tier for a top-up — see
    app/models/campaign_funding.py's module docstring). Validated against the
    live `min_funding_kes` at the endpoint layer (`campaigns.py`), NOT here
    with a `field_validator` — unlike the old hardcoded `MIN_FUNDING_KES`
    constant this schema used to import at module-load time, the minimum is
    now a DB-backed, admin-editable value (app/models/campaign_pricing_
    settings.py) that a pydantic schema has no DB session to read; only
    `gt=0` (a real, static invariant) is enforced here. `phone` is the MSISDN
    the STK Push prompt is sent to, same "explicitly supplied, not assumed to
    be the account's own phone" reasoning as `FeaturedPurchaseCreate.phone`."""

    amount_kes: Decimal = Field(gt=0)
    phone: str = Field(min_length=7, max_length=20)

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
