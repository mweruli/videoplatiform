"""manual featured placement: businesses.is_featured, products.is_featured

Revision ID: 9a1c4d2f7b3e
Revises: 7f3a9c1d2b4e
Create Date: 2026-09-03

Phase 1a must-ship: "Manual featured placement, clearly labelled sponsored"
(DEVELOPMENT_PLAN.md). Platform-controlled only — see docs/decisions.md and
the `is_featured` column comments on Business/Product for why owners can't
set this themselves via the normal update endpoints.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9a1c4d2f7b3e"
down_revision: Union[str, None] = "7f3a9c1d2b4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_businesses_is_featured", "businesses", ["is_featured"])

    op.add_column(
        "products",
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_products_is_featured", "products", ["is_featured"])


def downgrade() -> None:
    op.drop_index("ix_products_is_featured", table_name="products")
    op.drop_column("products", "is_featured")

    op.drop_index("ix_businesses_is_featured", table_name="businesses")
    op.drop_column("businesses", "is_featured")
