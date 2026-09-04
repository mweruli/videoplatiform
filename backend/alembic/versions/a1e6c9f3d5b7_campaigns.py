"""campaigns + campaign_fundings tables

Revision ID: a1e6c9f3d5b7
Revises: c4f8a1e3b6d2
Create Date: 2026-09-04

Phase 1b fast-follow: "self-serve advertiser campaign manager"
(DEVELOPMENT_PLAN.md) — see app/models/campaign.py and
app/models/campaign_funding.py's module docstrings, and docs/decisions.md's
"Phase 1b design pass: self-serve advertiser campaign manager" entry, for
the full design writeup (targeting fields, budget/spend semantics, the
status state machine, why funding is a separate repeatable-transaction
table rather than fields on Campaign itself).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a1e6c9f3d5b7"
down_revision: Union[str, None] = "c4f8a1e3b6d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "initiated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column("cpm_kes", sa.Numeric(10, 2), nullable=False),
        sa.Column("budget_kes", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("spent_kes", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("impression_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending_review",
        ),
        sa.Column("moderation_note", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_campaigns_business_id", "campaigns", ["business_id"])
    op.create_index("ix_campaigns_product_id", "campaigns", ["product_id"])
    op.create_index("ix_campaigns_category_id", "campaigns", ["category_id"])
    op.create_index("ix_campaigns_county", "campaigns", ["county"])
    op.create_index("ix_campaigns_status", "campaigns", ["status"])

    op.create_table(
        "campaign_fundings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "initiated_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_kes", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("checkout_request_id", sa.String(length=64), nullable=False),
        sa.Column("merchant_request_id", sa.String(length=64), nullable=False),
        sa.Column("payer_phone", sa.String(length=20), nullable=False),
        sa.Column("mpesa_receipt_number", sa.String(length=50), nullable=True),
        sa.Column("result_code", sa.Integer(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_campaign_fundings_campaign_id", "campaign_fundings", ["campaign_id"]
    )
    op.create_index("ix_campaign_fundings_status", "campaign_fundings", ["status"])
    op.create_index(
        "ix_campaign_fundings_checkout_request_id",
        "campaign_fundings",
        ["checkout_request_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_campaign_fundings_checkout_request_id", table_name="campaign_fundings"
    )
    op.drop_index("ix_campaign_fundings_status", table_name="campaign_fundings")
    op.drop_index("ix_campaign_fundings_campaign_id", table_name="campaign_fundings")
    op.drop_table("campaign_fundings")

    op.drop_index("ix_campaigns_status", table_name="campaigns")
    op.drop_index("ix_campaigns_county", table_name="campaigns")
    op.drop_index("ix_campaigns_category_id", table_name="campaigns")
    op.drop_index("ix_campaigns_product_id", table_name="campaigns")
    op.drop_index("ix_campaigns_business_id", table_name="campaigns")
    op.drop_table("campaigns")
