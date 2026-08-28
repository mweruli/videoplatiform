"""Synchronous SQLAlchemy 2.0 engine/session setup.

We use a sync engine (psycopg 3 driver) rather than async SQLAlchemy: this is
a 5-person, 3-month build doing mostly straightforward CRUD, and sync
SQLAlchemy + Alembic is the lower-friction, lower-footgun choice for that.
FastAPI still serves these requests concurrently via its threadpool. If a
specific endpoint becomes a proven bottleneck later, it can move to asyncpg
independently — see docs/decisions.md.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
