"""video model

Revision ID: 335e25eb5bab
Revises: e59f6429725c
Create Date: 2026-08-30 05:36:37.242600

Sprint 3 — see docs/PROJECT_BRIEF.md's "Video and Shorts Platform" and
"Content Moderation" sections. Videos are business-uploaded (see
app/models/video.py's module docstring); moderation_status reuses the exact
same pending/approved/rejected values as Product's ModerationStatus.

Note: `alembic revision --autogenerate` also flagged a handful of unrelated
unique-constraint/index representation diffs on businesses/categories/
products/users/otp_codes (pre-existing drift between the ORM models and
earlier hand-written migrations, e.g. a separate UniqueConstraint vs. a
unique index for the same column) — those are left untouched here since
they're out of scope for this change; only the new `videos` table is added.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '335e25eb5bab'
down_revision: Union[str, None] = 'e59f6429725c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "videos",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("video_url", sa.String(length=1000), nullable=False),
        sa.Column("video_asset_id", sa.String(length=500), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "moderation_status",
            sa.Enum(
                "pending",
                "approved",
                "rejected",
                name="video_moderation_status",
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
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_videos_business_id", "videos", ["business_id"])
    op.create_index("ix_videos_category_id", "videos", ["category_id"])
    op.create_index("ix_videos_product_id", "videos", ["product_id"])
    op.create_index("ix_videos_moderation_status", "videos", ["moderation_status"])


def downgrade() -> None:
    op.drop_index("ix_videos_moderation_status", table_name="videos")
    op.drop_index("ix_videos_product_id", table_name="videos")
    op.drop_index("ix_videos_category_id", table_name="videos")
    op.drop_index("ix_videos_business_id", table_name="videos")
    op.drop_table("videos")
