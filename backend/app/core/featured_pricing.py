"""Placeholder pricing for Phase 1b self-serve featured placement.

Single source of truth for tiers/amounts/durations — see
DEVELOPMENT_PLAN.md's fast-follow item "M-Pesa self-serve payments for ads"
and docs/decisions.md for the full design writeup. The PM has not supplied
real commercial pricing yet, so these are deliberately round, obviously-fake
test numbers, kept in exactly one place so swapping in real pricing later is
"edit this dict", not a hunt through endpoint code for magic numbers.

`FeaturedPricingTier` values are stored verbatim on `FeaturedPurchase.tier`
(app/models/featured_purchase.py) — a purchase also snapshots the resolved
`amount_kes`/`duration_days` onto its own row at purchase time (see that
model's docstring for why: a later change to this dict must never
retroactively alter what a past purchase is recorded as having cost or how
long it ran).
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from decimal import Decimal


class FeaturedPricingTier(str, enum.Enum):
    SEVEN_DAYS = "7_days"
    THIRTY_DAYS = "30_days"


@dataclass(frozen=True)
class FeaturedPricingOption:
    tier: FeaturedPricingTier
    label: str
    amount_kes: Decimal
    duration_days: int


# --- PLACEHOLDER / TEST PRICING — not real commercial numbers. ---
# Change here, and only here, once the PM supplies real client pricing.
FEATURED_PRICING: dict[FeaturedPricingTier, FeaturedPricingOption] = {
    FeaturedPricingTier.SEVEN_DAYS: FeaturedPricingOption(
        tier=FeaturedPricingTier.SEVEN_DAYS,
        label="7 days",
        amount_kes=Decimal("500"),
        duration_days=7,
    ),
    FeaturedPricingTier.THIRTY_DAYS: FeaturedPricingOption(
        tier=FeaturedPricingTier.THIRTY_DAYS,
        label="30 days",
        amount_kes=Decimal("1500"),
        duration_days=30,
    ),
}


def get_pricing_option(tier: FeaturedPricingTier) -> FeaturedPricingOption:
    """Raises KeyError for an unknown tier — callers (the future purchase
    endpoint) should translate that into a 422, not let it 500."""
    return FEATURED_PRICING[tier]
