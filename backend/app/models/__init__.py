"""SQLAlchemy models package.

Import every model module here so Alembic's autogenerate (which inspects
Base.metadata) can see all tables.
"""

from app.models.business import Business  # noqa: F401
from app.models.business_daily_stats import BusinessDailyStats  # noqa: F401
from app.models.campaign import Campaign  # noqa: F401
from app.models.campaign_daily_stats import CampaignDailyStats  # noqa: F401
from app.models.campaign_funding import CampaignFunding  # noqa: F401
from app.models.campaign_pricing_settings import CampaignPricingSettings  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.featured_pricing_tier import FeaturedPricingTier  # noqa: F401
from app.models.featured_purchase import FeaturedPurchase  # noqa: F401
from app.models.otp import OtpCode  # noqa: F401
from app.models.product import Product, product_categories, product_related  # noqa: F401
from app.models.product_daily_stats import ProductDailyStats  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.video import Video, video_categories  # noqa: F401
from app.models.video_daily_stats import VideoDailyStats  # noqa: F401
