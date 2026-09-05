"""daily_analytics_tables

Revision ID: 32952d992b27
Revises: d3f8b2a9c1e4
Create Date: 2026-09-05 06:26:44.078641

Adds the four timestamped daily-analytics tables for Phase 1b's "advanced
business analytics dashboard" fast-follow item (DEVELOPMENT_PLAN.md) — see
docs/decisions.md's "core analytics: daily timeseries layer" entry for the
full design writeup and each app/models/*_daily_stats.py module for the
per-table reasoning. Purely additive: no existing table/column is touched.

Autogenerate also reported a long list of unrelated unique-constraint/
index-naming drift on businesses/categories/otp_codes/product_related/
products/users (pre-existing quirks between how those older migrations
created constraints and how the current models declare them) — the exact
same pre-existing drift already called out as harmless noise in
docs/decisions.md's 2026-09-04 campaign-manager entry ("`alembic check`'s
only reported drift is pre-existing ... nothing it reported touches
`campaigns`/`campaign_fundings`"). That noise is deliberately stripped from
this migration; it isn't this change's to fix.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32952d992b27'
down_revision: Union[str, None] = 'd3f8b2a9c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'business_daily_stats',
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('stat_date', sa.Date(), nullable=False),
        sa.Column('view_count', sa.Integer(), nullable=False),
        sa.Column('impression_count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('business_id', 'stat_date'),
    )
    op.create_table(
        'product_daily_stats',
        sa.Column('product_id', sa.UUID(), nullable=False),
        sa.Column('stat_date', sa.Date(), nullable=False),
        sa.Column('view_count', sa.Integer(), nullable=False),
        sa.Column('impression_count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('product_id', 'stat_date'),
    )
    op.create_table(
        'video_daily_stats',
        sa.Column('video_id', sa.UUID(), nullable=False),
        sa.Column('stat_date', sa.Date(), nullable=False),
        sa.Column('view_count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('video_id', 'stat_date'),
    )
    op.create_table(
        'campaign_daily_stats',
        sa.Column('campaign_id', sa.UUID(), nullable=False),
        sa.Column('stat_date', sa.Date(), nullable=False),
        sa.Column('impression_count', sa.Integer(), nullable=False),
        sa.Column('click_count', sa.Integer(), nullable=False),
        sa.Column('spend_kes', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('campaign_id', 'stat_date'),
    )


def downgrade() -> None:
    op.drop_table('campaign_daily_stats')
    op.drop_table('video_daily_stats')
    op.drop_table('product_daily_stats')
    op.drop_table('business_daily_stats')
