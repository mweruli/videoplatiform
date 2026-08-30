"""SQLAlchemy models package.

Import every model module here so Alembic's autogenerate (which inspects
Base.metadata) can see all tables.
"""

from app.models.business import Business  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.otp import OtpCode  # noqa: F401
from app.models.product import Product, product_related  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.video import Video  # noqa: F401
