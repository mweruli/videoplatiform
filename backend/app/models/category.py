"""Category model.

Minimal on purpose: this exists in Sprint 1 mainly to prove the
SQLAlchemy -> Alembic -> Postgres pipeline works end to end, and to seed the
18 launch categories from docs/PROJECT_BRIEF.md. The Backend Engineer will
extend this (parent/child hierarchy, icon, sort order, etc.) as Sprint 2+
listing work needs it.
"""

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
