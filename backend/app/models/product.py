"""Product/Service model.

Fields follow PROJECT_BRIEF.md's "Product and Service Management" section:
name, description, technical specs, images, price/price range, manufacturer/
supplier (business reference), location, warranty terms, availability,
related products.

Scoping notes (flagged for Tech Lead/PM — see docs/decisions.md):
- `specs` is a flexible JSON object (key/value, matching the prototype's
  `specs: {Capacity: '5,000 Litres', ...}` shape) rather than a fixed
  per-category spec schema — structured per-category spec templates (needed
  for the "Product Comparison" module to line up rows cleanly) are Sprint 4
  work, not this one.
- `related_products` is an explicit curated many-to-many (business picks
  which products are related) rather than an auto-computed list, so a
  business can point a spare-part at its parent equipment across categories.
  When nothing's curated, `GET /products/{id}` falls back first to
  same-category products, then same-business products, then nothing — see
  `_related_products_fallback` in app/api/v1/endpoints/products.py and
  docs/decisions.md for the exact order and why it changed from a
  same-business-only fallback.
- Products carry their own `categories` (many-to-many, zero or more)
  distinct from the owning business's single category (e.g. a hardware
  store's category is "Retail" but an individual product might belong to
  both "Construction" and "DIY") — this also gives search/filter-by-category
  something to key off per listing. This reverses the original Sprint 2
  single-`category_id` decision (see docs/decisions.md) once real usage
  showed a product/video can genuinely belong in more than one category.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.category import Category


class ModerationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AvailabilityStatus(str, enum.Enum):
    IN_STOCK = "in_stock"
    MADE_TO_ORDER = "made_to_order"
    OUT_OF_STOCK = "out_of_stock"
    DISCONTINUED = "discontinued"


# Self-referential, curated "related products" association. Deliberately
# asymmetric (A relates to B does not imply B relates to A) since a business
# may want to point a cheaper accessory at a flagship product without the
# reverse making sense.
product_related = Table(
    "product_related",
    Base.metadata,
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "related_product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    UniqueConstraint("product_id", "related_product_id", name="uq_product_related_pair"),
)


# Product <-> Category, many-to-many. A product can carry zero or more
# categories (see module docstring for why this replaced a single
# `category_id` FK). Matches product_related's style exactly.
product_categories = Table(
    "product_categories",
    Base.metadata,
    Column(
        "product_id",
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)

    # Flexible key/value technical specs — see module docstring.
    specs: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    # Either a single price (price_min == price_max) or a genuine range.
    # KES is the launch-market default currency; not hardcoded past that.
    currency: Mapped[str] = mapped_column(String(3), default="KES", nullable=False)
    price_min: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_max: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    images: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    warranty_terms: Mapped[str | None] = mapped_column(String(255))
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        Enum(AvailabilityStatus, name="product_availability_status", native_enum=False, length=20),
        default=AvailabilityStatus.IN_STOCK,
        nullable=False,
    )
    availability_note: Mapped[str | None] = mapped_column(String(255))

    # Location defaults to the owning business's location in the API layer,
    # but is stored explicitly here so a business with one HQ can still list
    # a product only available at a specific branch/depot.
    county: Mapped[str | None] = mapped_column(String(100), index=True)
    city: Mapped[str | None] = mapped_column(String(100), index=True)

    moderation_status: Mapped[ModerationStatus] = mapped_column(
        Enum(ModerationStatus, name="product_moderation_status", native_enum=False, length=20),
        default=ModerationStatus.PENDING,
        nullable=False,
        index=True,
    )
    moderation_note: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Manual "featured" placement (Phase 1a — see PROJECT_BRIEF.md's Digital
    # Advertising section and DEVELOPMENT_PLAN.md's must-ship list). Same
    # platform-controlled-only contract as Business.is_featured — see that
    # model's docstring comment for the full rationale.
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    # --- Core analytics (Phase 1a) — mirrors Business.view_count/
    # impression_count exactly (see that model's docstring comment for the
    # full reasoning); `view_count` via POST /products/{id}/view (mirrors
    # the already-shipped Video.view_count/`POST /videos/{id}/view` pattern
    # byte-for-byte), `impression_count` via POST /products/impressions.
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    impression_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    business: Mapped[Business] = relationship(back_populates="products", lazy="joined")
    categories: Mapped[list[Category]] = relationship(
        "Category", secondary=product_categories, lazy="selectin"
    )

    related_products: Mapped[list[Product]] = relationship(
        "Product",
        secondary=product_related,
        primaryjoin="Product.id == product_related.c.product_id",
        secondaryjoin="Product.id == product_related.c.related_product_id",
        lazy="selectin",
    )
