"""User model.

Minimal on purpose: full registration/OTP/login (email+phone OTP -> JWT) is
Sprint 1 work per docs/DEVELOPMENT_PLAN.md but was not actually built in the
Sprint 1 skeleton (only Category + health check were). Sprint 2's business
and product ownership/RBAC needs *some* User model and auth to exist, so this
model plus a minimal JWT dependency (app/core/security.py, app/api/deps.py)
were added now as the smallest thing that unblocks Sprint 2 — see
docs/decisions.md for the full note. Auth Engineer/Tech Lead should treat
this as the real users table (extend, don't replace), and prioritise wiring
real registration + OTP delivery on top of it.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    """The 7 roles from docs/PROJECT_BRIEF.md's "User roles" table."""

    PLATFORM_ADMIN = "platform_admin"
    CONTENT_MODERATOR = "content_moderator"
    BUSINESS_ADMIN = "business_admin"
    ADVERTISER = "advertiser"
    CONTENT_CREATOR = "content_creator"
    PUBLISHER = "publisher"
    GENERAL_USER = "general_user"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Kenya market is phone-first; email is optional, phone is the primary
    # identifier for OTP once that's wired up. Both nullable at the DB level
    # because a single user may register with only one of the two, but at
    # least one must be present (enforced in the schema/service layer).
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False, length=30),
        default=UserRole.GENERAL_USER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # phone/email OTP verified — not to be confused with business verification
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
