"""featured_purchases table + businesses/products.featured_until

Revision ID: c4f8a1e3b6d2
Revises: b2e7c5a1f8d9
Create Date: 2026-09-04

Phase 1b fast-follow: "M-Pesa self-serve payments for ads"
(DEVELOPMENT_PLAN.md), scoped to featured placement only — see
app/models/featured_purchase.py's module docstring and docs/decisions.md
for the full design writeup (why a dedicated table, why one purchase = one
target, why `featured_until` is a sweep-on-read column rather than driving
a background job).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c4f8a1e3b6d2"
down_revision: Union[str, None] = "b2e7c5a1f8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("featured_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_businesses_featured_until", "businesses", ["featured_until"])

    op.add_column(
        "products",
        sa.Column("featured_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_products_featured_until", "products", ["featured_until"])

    op.create_table(
        "featured_purchases",
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
        sa.Column(
            "tier",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column("amount_kes", sa.Numeric(10, 2), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
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
        sa.Column("featured_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_featured_purchases_business_id", "featured_purchases", ["business_id"]
    )
    op.create_index(
        "ix_featured_purchases_product_id", "featured_purchases", ["product_id"]
    )
    op.create_index("ix_featured_purchases_status", "featured_purchases", ["status"])
    op.create_index(
        "ix_featured_purchases_checkout_request_id",
        "featured_purchases",
        ["checkout_request_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_featured_purchases_checkout_request_id", table_name="featured_purchases"
    )
    op.drop_index("ix_featured_purchases_status", table_name="featured_purchases")
    op.drop_index("ix_featured_purchases_product_id", table_name="featured_purchases")
    op.drop_index("ix_featured_purchases_business_id", table_name="featured_purchases")
    op.drop_table("featured_purchases")

    op.drop_index("ix_products_featured_until", table_name="products")
    op.drop_column("products", "featured_until")

    op.drop_index("ix_businesses_featured_until", table_name="businesses")
    op.drop_column("businesses", "featured_until")
