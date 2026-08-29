"""business & product core: users, businesses, products, product_related

Revision ID: 2ee372c6ee4b
Revises: 6e0b7209a833
Create Date: 2026-08-29

Sprint 2 — see docs/PROJECT_BRIEF.md's Business & Company Management /
Product and Service Management sections, and docs/decisions.md for the note
on why a minimal `users` table was added ahead of the full auth build.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2ee372c6ee4b"
down_revision: Union[str, None] = "6e0b7209a833"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("full_name", sa.String(length=200), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=True),
        sa.Column(
            "role",
            sa.Enum(
                "platform_admin",
                "content_moderator",
                "business_admin",
                "advertiser",
                "content_creator",
                "publisher",
                "general_user",
                name="user_role",
                native_enum=False,
                length=30,
            ),
            nullable=False,
            server_default="general_user",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("phone", name="uq_users_phone"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_phone", "users", ["phone"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "businesses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("cover_image_url", sa.String(length=500), nullable=True),
        sa.Column("cover_video_asset_id", sa.String(length=255), nullable=True),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("address_line", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("website_url", sa.String(length=500), nullable=True),
        sa.Column("facebook_url", sa.String(length=500), nullable=True),
        sa.Column("instagram_url", sa.String(length=500), nullable=True),
        sa.Column("twitter_url", sa.String(length=500), nullable=True),
        sa.Column("tiktok_url", sa.String(length=500), nullable=True),
        sa.Column(
            "verification_status",
            sa.Enum(
                "unverified",
                "pending",
                "verified",
                "rejected",
                name="business_verification_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="unverified",
        ),
        sa.Column("verification_note", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("slug", name="uq_businesses_slug"),
    )
    op.create_index("ix_businesses_owner_id", "businesses", ["owner_id"])
    op.create_index("ix_businesses_category_id", "businesses", ["category_id"])
    op.create_index("ix_businesses_slug", "businesses", ["slug"])
    op.create_index("ix_businesses_county", "businesses", ["county"])
    op.create_index("ix_businesses_city", "businesses", ["city"])
    op.create_index("ix_businesses_verification_status", "businesses", ["verification_status"])

    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("specs", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="KES"),
        sa.Column("price_min", sa.Numeric(12, 2), nullable=True),
        sa.Column("price_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("images", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("warranty_terms", sa.String(length=255), nullable=True),
        sa.Column(
            "availability_status",
            sa.Enum(
                "in_stock",
                "made_to_order",
                "out_of_stock",
                "discontinued",
                name="product_availability_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="in_stock",
        ),
        sa.Column("availability_note", sa.String(length=255), nullable=True),
        sa.Column("county", sa.String(length=100), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column(
            "moderation_status",
            sa.Enum(
                "pending",
                "approved",
                "rejected",
                name="product_moderation_status",
                native_enum=False,
                length=20,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("moderation_note", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("slug", name="uq_products_slug"),
    )
    op.create_index("ix_products_business_id", "products", ["business_id"])
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_slug", "products", ["slug"])
    op.create_index("ix_products_county", "products", ["county"])
    op.create_index("ix_products_city", "products", ["city"])
    op.create_index("ix_products_moderation_status", "products", ["moderation_status"])

    op.create_table(
        "product_related",
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "related_product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.UniqueConstraint("product_id", "related_product_id", name="uq_product_related_pair"),
    )


def downgrade() -> None:
    op.drop_table("product_related")

    op.drop_index("ix_products_moderation_status", table_name="products")
    op.drop_index("ix_products_city", table_name="products")
    op.drop_index("ix_products_county", table_name="products")
    op.drop_index("ix_products_slug", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_index("ix_products_business_id", table_name="products")
    op.drop_table("products")

    op.drop_index("ix_businesses_verification_status", table_name="businesses")
    op.drop_index("ix_businesses_city", table_name="businesses")
    op.drop_index("ix_businesses_county", table_name="businesses")
    op.drop_index("ix_businesses_slug", table_name="businesses")
    op.drop_index("ix_businesses_category_id", table_name="businesses")
    op.drop_index("ix_businesses_owner_id", table_name="businesses")
    op.drop_table("businesses")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_phone", table_name="users")
    op.drop_table("users")
