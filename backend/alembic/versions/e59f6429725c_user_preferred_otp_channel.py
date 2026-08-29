"""user preferred otp channel

Revision ID: e59f6429725c
Revises: 5d46fc0016b7
Create Date: 2026-08-29

Sprint 2 email-OTP follow-up — see docs/decisions.md (2026-08-29, "real email
OTP delivery + per-channel provider split") and app/models/user.py. Adds only
`users.preferred_otp_channel` (nullable, schema-only for now — no endpoint
reads/writes it yet). The autogenerate diff also flagged the same pre-existing
unique-constraint-vs-unique-index drift on businesses/categories/products/
users/otp_codes noted in 5d46fc0016b7 (predates this change, unrelated) —
intentionally left alone here rather than folded into an unrelated migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e59f6429725c"
down_revision: Union[str, None] = "5d46fc0016b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferred_otp_channel",
            sa.Enum("EMAIL", "PHONE", name="otp_channel", native_enum=False, length=10),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "preferred_otp_channel")
