"""otp codes table

Revision ID: 5d46fc0016b7
Revises: 2ee372c6ee4b
Create Date: 2026-08-29

Sprint 2 auth follow-up — see docs/decisions.md and app/models/otp.py. Only
adds `otp_codes`; the autogenerate diff also flagged pre-existing
unique-constraint-vs-unique-index drift on businesses/categories/products/
users (unrelated to this change, predates it) which is intentionally left
alone here rather than folded into an unrelated migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "5d46fc0016b7"
down_revision: Union[str, None] = "2ee372c6ee4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "otp_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "purpose",
            sa.Enum(
                "REGISTRATION",
                "LOGIN",
                "PASSWORD_RESET",
                name="otp_purpose",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "channel",
            sa.Enum("EMAIL", "PHONE", name="otp_channel", native_enum=False, length=10),
            nullable=False,
        ),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_otp_codes_user_id", "otp_codes", ["user_id"])
    op.create_index(
        "ix_otp_codes_lookup", "otp_codes", ["user_id", "purpose", "destination", "consumed_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_otp_codes_lookup", table_name="otp_codes")
    op.drop_index("ix_otp_codes_user_id", table_name="otp_codes")
    op.drop_table("otp_codes")
