"""SQLAlchemy models package.

Import every model module here so Alembic's autogenerate (which inspects
Base.metadata) can see all tables. Add new models to this list as they're
created — Sprint 1 only needs the Category model to prove the pipeline works;
Sprint 2+ adds Business/Product/User/etc.
"""

from app.models.category import Category  # noqa: F401
