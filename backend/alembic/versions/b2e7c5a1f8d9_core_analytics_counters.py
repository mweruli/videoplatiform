"""core analytics: businesses/products view_count + impression_count

Revision ID: b2e7c5a1f8d9
Revises: 9a1c4d2f7b3e
Create Date: 2026-09-04

Phase 1a must-ship: "Core analytics: views, search appearances, basic
counts" (DEVELOPMENT_PLAN.md). Video already has `view_count` (shipped in
Sprint 3) — this adds the equivalent to Business/Product, plus
`impression_count` on both (the "search appearances" signal — see
docs/decisions.md for why an impression-batch endpoint, not a fabricated
number, and why it doesn't exist on Video). No `impression_count` on Video:
not requested, and search results in this architecture are
business/product-centric, not video-centric.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2e7c5a1f8d9"
down_revision: Union[str, None] = "9a1c4d2f7b3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "businesses",
        sa.Column("impression_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "products",
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "products",
        sa.Column("impression_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("products", "impression_count")
    op.drop_column("products", "view_count")

    op.drop_column("businesses", "impression_count")
    op.drop_column("businesses", "view_count")
