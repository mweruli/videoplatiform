"""Declarative base for all SQLAlchemy models.

Import this Base in every model module. app/models/__init__.py imports every
model so Alembic autogenerate can discover them via Base.metadata.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
