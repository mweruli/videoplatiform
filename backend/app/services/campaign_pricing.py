"""DB-backed campaign pricing — replaces the old hardcoded
`app/core/campaign_pricing.py` (`CPM_KES`/`MIN_FUNDING_KES` constants,
deleted). See app/models/campaign_pricing_settings.py and
docs/decisions.md's "Admin-editable pricing" entry for the full design
writeup.

A service module (not `app/core/`) because, unlike the old constants module,
this genuinely touches the DB — matching this codebase's existing
`app/services/featured_expiry.py`/`app/services/campaign_billing.py`
convention of "a small, focused module the endpoint layer calls into" for
anything DB-backed, as opposed to `app/core/` (config/security, no DB
access).

**Read path is cheap by design** — a single PK lookup
(`db.get(CampaignPricingSettings, SETTINGS_ID)`) on a one-row table, called
on every `GET /campaigns/pricing`, every `POST /businesses/{id}/campaigns`
(to snapshot `Campaign.cpm_kes`), and every `POST /campaigns/{id}/funding`
(to validate against the current minimum). No caching layer — a PK lookup on
a table with exactly one row is already about as cheap as a read gets, and
introducing a cache here would be complexity with no measurable win.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.campaign_pricing_settings import SETTINGS_ID, CampaignPricingSettings


def get_campaign_pricing_settings(db: Session) -> CampaignPricingSettings:
    """Raises RuntimeError if the singleton row is missing — this should
    never happen post-migration (the row is seeded by the same migration
    that creates the table), so a missing row means a deployment ran the
    app without running migrations, not a normal runtime condition to
    degrade gracefully from."""
    settings = db.get(CampaignPricingSettings, SETTINGS_ID)
    if settings is None:
        raise RuntimeError(
            "campaign_pricing_settings row is missing — has `alembic upgrade head` "
            "been run against this database?"
        )
    return settings


def update_campaign_pricing_settings(
    db: Session,
    *,
    cpm_kes: Decimal | None = None,
    min_funding_kes: Decimal | None = None,
) -> CampaignPricingSettings:
    """PATCH semantics — only supplied fields change. Does not commit; the
    caller (the admin endpoint) owns the transaction boundary, same
    convention as every other admin update endpoint in this codebase."""
    settings = get_campaign_pricing_settings(db)
    if cpm_kes is not None:
        settings.cpm_kes = cpm_kes
    if min_funding_kes is not None:
        settings.min_funding_kes = min_funding_kes
    return settings
