"""One-time-passcode (OTP) storage for registration verification, login (fast-
follow), and password reset.

Only the hash of the code is ever persisted (same philosophy as passwords) so
a DB read alone can't leak a usable code. Delivery is decoupled entirely via
app/services/otp.py's `OtpSender` interface — this model only tracks
issuance/consumption/attempts, never how the code reached the user.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class OtpPurpose(str, enum.Enum):
    """What the code is proving. REGISTRATION verifies contact ownership at
    signup; PASSWORD_RESET gates a password change. LOGIN is scaffolded for
    a future passwordless-login fast-follow (see docs/decisions.md) but no
    endpoint issues LOGIN-purpose codes yet."""

    REGISTRATION = "registration"
    LOGIN = "login"
    PASSWORD_RESET = "password_reset"


class OtpChannel(str, enum.Enum):
    EMAIL = "email"
    PHONE = "phone"


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[OtpPurpose] = mapped_column(
        Enum(OtpPurpose, name="otp_purpose", native_enum=False, length=20), nullable=False
    )
    channel: Mapped[OtpChannel] = mapped_column(
        Enum(OtpChannel, name="otp_channel", native_enum=False, length=10), nullable=False
    )
    # Denormalised destination (the exact email/phone the code was sent to) —
    # kept even if the user later changes their contact details, since the
    # code was only ever valid for the value it was sent to.
    destination: Mapped[str] = mapped_column(String(255), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    user: Mapped[User] = relationship("User")

    @property
    def is_expired(self) -> bool:
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        return datetime.now(UTC) >= expires_at

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None
