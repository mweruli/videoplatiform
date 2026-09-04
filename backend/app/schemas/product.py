from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.product import AvailabilityStatus, ModerationStatus
from app.schemas.business import BusinessSummary
from app.schemas.category import CategoryRead


def _reject_platform_controlled_fields(data: object) -> object:
    """`is_featured` is platform-controlled (see Product.is_featured's model
    docstring) — see app/schemas/business.py's identical helper for the full
    rationale (explicit rejection, not reliance on schema omission)."""
    if isinstance(data, dict) and "is_featured" in data:
        raise ValueError(
            "'is_featured' is platform-controlled and cannot be set here; "
            "use POST /admin/products/{id}/feature or /unfeature."
        )
    return data


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category_ids: list[int] = Field(default_factory=list)
    specs: dict[str, str] = Field(default_factory=dict)
    currency: str = Field(default="KES", min_length=3, max_length=3)
    price_min: Decimal | None = Field(default=None, ge=0)
    price_max: Decimal | None = Field(default=None, ge=0)
    warranty_terms: str | None = Field(default=None, max_length=255)
    availability_status: AvailabilityStatus = AvailabilityStatus.IN_STOCK
    availability_note: str | None = Field(default=None, max_length=255)
    county: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    related_product_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_price_range(self) -> ProductBase:
        if self.price_min is not None and self.price_max is not None:
            if self.price_max < self.price_min:
                raise ValueError("price_max cannot be less than price_min.")
        return self

    @field_validator("related_product_ids")
    @classmethod
    def _cap_related(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) > 10:
            raise ValueError("A product can have at most 10 curated related products.")
        return value

    @field_validator("category_ids")
    @classmethod
    def _dedupe_categories(cls, value: list[int]) -> list[int]:
        if len(value) > 10:
            raise ValueError("A product can have at most 10 categories.")
        # Preserve order, drop duplicates.
        return list(dict.fromkeys(value))

    @model_validator(mode="before")
    @classmethod
    def _reject_is_featured(cls, data: object) -> object:
        return _reject_platform_controlled_fields(data)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    """All fields optional — PATCH semantics. moderation_status is absent:
    it only changes via the admin moderation endpoints."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category_ids: list[int] | None = Field(default=None, max_length=10)
    specs: dict[str, str] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    price_min: Decimal | None = Field(default=None, ge=0)
    price_max: Decimal | None = Field(default=None, ge=0)
    warranty_terms: str | None = Field(default=None, max_length=255)
    availability_status: AvailabilityStatus | None = None
    availability_note: str | None = Field(default=None, max_length=255)
    county: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    related_product_ids: list[uuid.UUID] | None = Field(default=None, max_length=10)

    @model_validator(mode="before")
    @classmethod
    def _reject_is_featured(cls, data: object) -> object:
        return _reject_platform_controlled_fields(data)


class ProductSummary(BaseModel):
    """Slim shape for embedding in related-products lists."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    price_min: Decimal | None
    price_max: Decimal | None
    currency: str
    primary_image_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _derive_primary_image(cls, obj):
        images = getattr(obj, "images", None) or []
        try:
            obj.primary_image_url = images[0] if images else None
        except AttributeError:
            pass
        return obj


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID
    business: BusinessSummary
    categories: list[CategoryRead] = Field(default_factory=list)
    name: str
    slug: str
    description: str | None
    specs: dict
    currency: str
    price_min: Decimal | None
    price_max: Decimal | None
    images: list[str]
    primary_image_url: str | None = None
    warranty_terms: str | None
    availability_status: AvailabilityStatus
    availability_note: str | None
    county: str | None
    city: str | None
    moderation_status: ModerationStatus
    moderation_note: str | None
    is_active: bool
    is_featured: bool
    # See BusinessRead.featured_until's comment — same gap, same fix.
    featured_until: datetime | None
    view_count: int
    impression_count: int
    created_at: datetime
    updated_at: datetime
    related_products: list[ProductSummary] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _set_primary_image(cls, obj):
        images = getattr(obj, "images", None) or []
        try:
            obj.primary_image_url = images[0] if images else None
        except AttributeError:
            pass
        return obj


class ProductModerationAction(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class ProductRejectAction(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class ProductViewResult(BaseModel):
    view_count: int
