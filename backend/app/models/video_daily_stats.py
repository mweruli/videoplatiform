"""VideoDailyStats — the video-level counterpart to
app/models/business_daily_stats.py. See that module's docstring for the full
design reasoning (identical, not repeated here). Written to inside the same
request that already increments `Video.view_count`
(`POST /videos/{id}/view`), via app/services/daily_stats.py.

**No `impression_count` column here** — `Video` has no impression counter at
all (see docs/decisions.md's 2026-09-04 "core analytics" entry: search
results in this platform are business/product-centric, videos surface via
their own feed/browse rather than the keyword-search results page, so there
is no "appeared in search results" moment to hook for a video). This table
mirrors that: it tracks only what the lifetime counter it piggybacks on
actually tracks.
"""

from __future__ import annotations

import uuid
from datetime import date as date_

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VideoDailyStats(Base):
    __tablename__ = "video_daily_stats"

    video_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("videos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    stat_date: Mapped[date_] = mapped_column(Date, primary_key=True)

    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
