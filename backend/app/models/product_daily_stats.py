"""ProductDailyStats — the product-level counterpart to
app/models/business_daily_stats.py. See that module's docstring for the full
design reasoning (why this exists alongside `Product.view_count`/
`impression_count` rather than instead of them, why a composite PK, why
Postgres upsert, why UTC dates, why no retention policy yet) — identical
reasoning, not repeated here. Written to inside the same request that
already increments `Product.view_count` (`POST /products/{id}/view`) or
`Product.impression_count` (`POST /products/impressions`), via
app/services/daily_stats.py.
"""

from __future__ import annotations

import uuid
from datetime import date as date_

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductDailyStats(Base):
    __tablename__ = "product_daily_stats"

    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    stat_date: Mapped[date_] = mapped_column(Date, primary_key=True)

    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    impression_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
