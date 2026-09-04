"""admin-editable pricing: featured_pricing_tiers, featured_purchases.tier ->
tier_label, campaign_pricing_settings

Revision ID: d3f8b2a9c1e4
Revises: a1e6c9f3d5b7
Create Date: 2026-09-04

Makes both Featured Placement pricing and Ad Campaign CPM/minimum-funding
admin-editable instead of hardcoded (`app/core/featured_pricing.py` and
`app/core/campaign_pricing.py`, both deleted by this change) — see
docs/decisions.md's "Admin-editable pricing" entry for the full design
writeup this migration implements.

1. Creates `featured_pricing_tiers` (see app/models/featured_pricing_tier.py)
   and seeds it with the two tiers that used to be the hardcoded
   `FEATURED_PRICING` dict's only entries (KES 500/7 days, KES 1,500/30
   days) — real launch data that must exist on every environment, same
   "seed via the migration" precedent as the 18 launch categories
   (app/db/seed.py), except those are seeded by a standalone script run
   after migrations while these — being referenced by the very next step of
   this same migration (the tier_label backfill) — are seeded inline here so
   the backfill has real labels to copy even on a database that never runs
   `app/db/seed.py` at all (e.g. a from-scratch CI/test database).
2. Adds `featured_purchases.tier_label` (backfilled from each row's existing
   `tier` enum value's human-readable form: `SEVEN_DAYS` -> "7 days",
   `THIRTY_DAYS` -> "30 days" — this codebase's `Enum(native_enum=False)`
   columns store the member's `.name`, confirmed against this exact column
   multiple times elsewhere in this codebase, not re-derived here), then
   drops the old `tier` column. `FeaturedPurchase.tier_label` is a plain
   string, not an FK to `featured_pricing_tiers` — see that model's module
   docstring for why.
3. Creates `campaign_pricing_settings` (see
   app/models/campaign_pricing_settings.py) and seeds its one row with the
   values that used to be the hardcoded `CPM_KES`/`MIN_FUNDING_KES`
   constants (500.00 / 200.00).
"""
from datetime import UTC, datetime
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f8b2a9c1e4"
down_revision: Union[str, None] = "a1e6c9f3d5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    now = datetime.now(UTC)

    # --- 1. featured_pricing_tiers ------------------------------------
    op.create_table(
        "featured_pricing_tiers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("amount_kes", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_featured_pricing_tiers_is_active", "featured_pricing_tiers", ["is_active"]
    )

    featured_pricing_tiers_table = sa.table(
        "featured_pricing_tiers",
        sa.column("id", sa.Integer),
        sa.column("label", sa.String),
        sa.column("duration_days", sa.Integer),
        sa.column("amount_kes", sa.Numeric),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        featured_pricing_tiers_table,
        [
            {
                "id": 1,
                "label": "7 days",
                "duration_days": 7,
                "amount_kes": Decimal("500.00"),
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": 2,
                "label": "30 days",
                "duration_days": 30,
                "amount_kes": Decimal("1500.00"),
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        ],
    )
    # Keep the sequence in sync with the explicit ids inserted above so the
    # next admin-created tier doesn't collide with id 1/2.
    op.execute(
        "SELECT setval(pg_get_serial_sequence('featured_pricing_tiers', 'id'), 2, true)"
    )

    # --- 2. featured_purchases.tier -> tier_label ----------------------
    op.add_column(
        "featured_purchases", sa.Column("tier_label", sa.String(length=100), nullable=True)
    )
    op.execute(
        """
        UPDATE featured_purchases
        SET tier_label = CASE tier
            WHEN 'SEVEN_DAYS' THEN '7 days'
            WHEN 'THIRTY_DAYS' THEN '30 days'
            ELSE tier
        END
        """
    )
    op.alter_column("featured_purchases", "tier_label", nullable=False)
    op.drop_column("featured_purchases", "tier")

    # --- 3. campaign_pricing_settings -----------------------------------
    op.create_table(
        "campaign_pricing_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cpm_kes", sa.Numeric(10, 2), nullable=False),
        sa.Column("min_funding_kes", sa.Numeric(12, 2), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    campaign_pricing_settings_table = sa.table(
        "campaign_pricing_settings",
        sa.column("id", sa.Integer),
        sa.column("cpm_kes", sa.Numeric),
        sa.column("min_funding_kes", sa.Numeric),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        campaign_pricing_settings_table,
        [
            {
                "id": 1,
                "cpm_kes": Decimal("500.00"),
                "min_funding_kes": Decimal("200.00"),
                "updated_at": now,
            }
        ],
    )
    op.execute(
        "SELECT setval(pg_get_serial_sequence('campaign_pricing_settings', 'id'), 1, true)"
    )


def downgrade() -> None:
    op.drop_table("campaign_pricing_settings")

    op.add_column("featured_purchases", sa.Column("tier", sa.String(length=20), nullable=True))
    op.execute(
        """
        UPDATE featured_purchases
        SET tier = CASE
            WHEN tier_label = '7 days' THEN 'SEVEN_DAYS'
            WHEN tier_label = '30 days' THEN 'THIRTY_DAYS'
            ELSE 'SEVEN_DAYS'
        END
        """
    )
    op.alter_column("featured_purchases", "tier", nullable=False)
    op.drop_column("featured_purchases", "tier_label")

    op.drop_index("ix_featured_pricing_tiers_is_active", table_name="featured_pricing_tiers")
    op.drop_table("featured_pricing_tiers")
