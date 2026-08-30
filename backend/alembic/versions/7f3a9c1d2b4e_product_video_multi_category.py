"""product/video multi-category (many-to-many)

Revision ID: 7f3a9c1d2b4e
Revises: 335e25eb5bab
Create Date: 2026-08-30 09:00:00.000000

Reverses the Sprint 2 decision that Product/Video each carry a single
`category_id` FK (see docs/decisions.md, "Business has one category_id
(single FK), not a many-to-many") — a product/video can genuinely belong in
more than one category, so this replaces `products.category_id` and
`videos.category_id` with `product_categories`/`video_categories` join
tables, matching the existing `product_related` self-referential M2M style.

Business is deliberately NOT touched here — it keeps its single
`category_id`, unchanged.

Data migration: each row's existing single `category_id` value is copied
into the new join table as that product/video's first category before the
old column is dropped, so no existing category assignment is lost (notably
the PM's own real "Ramco Group" business's video/products in the live dev
DB).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "7f3a9c1d2b4e"
down_revision: Union[str, None] = "335e25eb5bab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_categories",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_table(
        "video_categories",
        sa.Column(
            "video_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # Migrate existing data: each product/video's current single category_id
    # becomes its first (only) row in the new join table. Must run before
    # the old columns are dropped below.
    op.execute(
        """
        INSERT INTO product_categories (product_id, category_id)
        SELECT id, category_id FROM products WHERE category_id IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO video_categories (video_id, category_id)
        SELECT id, category_id FROM videos WHERE category_id IS NOT NULL
        """
    )

    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_column("products", "category_id")

    op.drop_index("ix_videos_category_id", table_name="videos")
    op.drop_column("videos", "category_id")


def downgrade() -> None:
    op.add_column("products", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "products_category_id_fkey",
        "products",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])

    op.add_column("videos", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "videos_category_id_fkey",
        "videos",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_videos_category_id", "videos", ["category_id"])

    # Best-effort reverse data migration: pick one (arbitrary but
    # deterministic — lowest category_id) category per product/video from the
    # join table so downgrading doesn't leave every row's category_id NULL.
    # Any 2nd+ category a row had is dropped, same as the M2M -> single-FK
    # direction losing information generally.
    op.execute(
        """
        UPDATE products
        SET category_id = sub.category_id
        FROM (
            SELECT DISTINCT ON (product_id) product_id, category_id
            FROM product_categories
            ORDER BY product_id, category_id
        ) AS sub
        WHERE products.id = sub.product_id
        """
    )
    op.execute(
        """
        UPDATE videos
        SET category_id = sub.category_id
        FROM (
            SELECT DISTINCT ON (video_id) video_id, category_id
            FROM video_categories
            ORDER BY video_id, category_id
        ) AS sub
        WHERE videos.id = sub.video_id
        """
    )

    op.drop_table("video_categories")
    op.drop_table("product_categories")
