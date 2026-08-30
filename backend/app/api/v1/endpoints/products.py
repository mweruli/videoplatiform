"""Product/Service CRUD, scoped to the owning business, plus public browse.

Editing a product that's already approved resets it back to `pending` — any
change to commercial/UGC content goes through moderation again before it's
publicly visible, per PROJECT_BRIEF.md's Content Moderation section. This is
a judgment call worth the Tech Lead/PM knowing about: it means an owner
fixing a typo temporarily un-publishes their listing until a moderator
looks at it again. The alternative (silently allow edits to already-approved
listings) trades review integrity for owner convenience — flagged in
docs/decisions.md for a decision either way once there's a moderator
workload to reason about.
"""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models.business import Business
from app.models.category import Category
from app.models.product import ModerationStatus, Product, product_categories
from app.models.user import User, UserRole
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.storage import get_storage_backend
from app.services.uploads import read_and_validate_image
from app.utils.slug import unique_slug

router = APIRouter()


def _can_manage(business: Business, user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN or business.owner_id == user.id


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


def _get_product_or_404(db: Session, product_id: uuid.UUID) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


def _resolve_categories(db: Session, category_ids: list[int]) -> list[Category]:
    if not category_ids:
        return []
    ids = set(category_ids)
    found = list(db.scalars(select(Category).where(Category.id.in_(ids))).all())
    missing = ids - {c.id for c in found}
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"category_ids not found: {sorted(missing)}",
        )
    return found


def _resolve_related_products(
    db: Session, product_id: uuid.UUID | None, related_ids: list[uuid.UUID], business_id: uuid.UUID
) -> list[Product]:
    if not related_ids:
        return []
    ids = {rid for rid in related_ids if rid != product_id}
    stmt = select(Product).where(Product.id.in_(ids))
    found = list(db.scalars(stmt).all())
    missing = ids - {p.id for p in found}
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"related_product_ids not found: {sorted(str(m) for m in missing)}",
        )
    return found


@router.post(
    "/businesses/{business_id}/products",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    tags=["products"],
)
def create_product(
    business_id: uuid.UUID,
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    data = payload.model_dump(exclude={"related_product_ids", "category_ids"})
    related_ids = payload.related_product_ids
    slug = unique_slug(
        payload.name, lambda s: db.scalar(select(Product).where(Product.slug == s)) is not None
    )

    # Location falls back to the owning business's location when the product
    # doesn't specify its own (see module docstring on Product model).
    data["county"] = data.get("county") or business.county
    data["city"] = data.get("city") or business.city

    product = Product(
        business_id=business.id,
        slug=slug,
        moderation_status=ModerationStatus.PENDING,
        **data,
    )
    product.categories = _resolve_categories(db, payload.category_ids)
    product.related_products = _resolve_related_products(db, None, related_ids, business.id)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/products", response_model=Page[ProductRead], tags=["products"])
def list_products(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    business_id: uuid.UUID | None = None,
    category_id: int | None = None,
    county: str | None = None,
    city: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    q: str | None = None,
    include_unapproved: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> Page[ProductRead]:
    """Public browse/search. `include_unapproved=true` only takes effect for
    the authenticated owner of `business_id` (or a platform admin) — it lets
    a business dashboard reuse this same endpoint to show its own pending/
    rejected listings without a second, near-duplicate endpoint."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(Product).join(Business, Product.business_id == Business.id)

    show_all_statuses = False
    if include_unapproved and current_user is not None and business_id is not None:
        business = db.get(Business, business_id)
        if business is not None and _can_manage(business, current_user):
            show_all_statuses = True

    # is_active (soft-delete) always applies, even for the owner/admin view —
    # "show me my pending/rejected listings too" should never resurrect a
    # product the owner already removed. Only the moderation-status filter
    # relaxes for `show_all_statuses`.
    stmt = stmt.where(Product.is_active.is_(True), Business.is_active.is_(True))
    if not show_all_statuses:
        stmt = stmt.where(Product.moderation_status == ModerationStatus.APPROVED)

    if business_id is not None:
        stmt = stmt.where(Product.business_id == business_id)
    if category_id is not None:
        stmt = stmt.where(
            Product.id.in_(
                select(product_categories.c.product_id).where(
                    product_categories.c.category_id == category_id
                )
            )
        )
    if county:
        stmt = stmt.where(func.lower(Product.county) == county.lower())
    if city:
        stmt = stmt.where(func.lower(Product.city) == city.lower())
    if min_price is not None:
        stmt = stmt.where(Product.price_max.is_(None) | (Product.price_max >= min_price))
    if max_price is not None:
        stmt = stmt.where(Product.price_min.is_(None) | (Product.price_min <= max_price))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Product.name).like(like), func.lower(Product.description).like(like))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Product.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/products/{product_id}", response_model=ProductRead, tags=["products"])
def get_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Product:
    product = _get_product_or_404(db, product_id)
    if not product.related_products:
        # Fall back to same-business products so the frontend always has
        # something to render in a "related products" rail (see Product
        # model docstring).
        fallback = list(
            db.scalars(
                select(Product)
                .where(
                    Product.business_id == product.business_id,
                    Product.id != product.id,
                    Product.moderation_status == ModerationStatus.APPROVED,
                    Product.is_active.is_(True),
                )
                .limit(3)
            ).all()
        )
        product.related_products = fallback
    return product


@router.get("/products/slug/{slug}", response_model=ProductRead, tags=["products"])
def get_product_by_slug(slug: str, db: Session = Depends(get_db)) -> Product:
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return get_product(product.id, db)


@router.patch("/products/{product_id}", response_model=ProductRead, tags=["products"])
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = _get_product_or_404(db, product_id)
    business = _get_business_or_404(db, product.business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your product.")

    update_data = payload.model_dump(
        exclude_unset=True, exclude={"related_product_ids", "category_ids"}
    )
    for field, value in update_data.items():
        setattr(product, field, value)

    if payload.related_product_ids is not None:
        product.related_products = _resolve_related_products(
            db, product.id, payload.related_product_ids, business.id
        )

    if payload.category_ids is not None:
        product.categories = _resolve_categories(db, payload.category_ids)
        # category_id was a plain (non-excluded) field on the old single-FK
        # ProductUpdate, so changing it always counted toward the re-review
        # trigger below — category_ids preserves that, unlike
        # related_product_ids (curation, not reviewed content) which
        # deliberately doesn't.
        update_data["category_ids"] = payload.category_ids

    # Re-review on edit unless it's an admin making the change — see module
    # docstring for the reasoning/flag.
    if current_user.role != UserRole.PLATFORM_ADMIN and update_data:
        product.moderation_status = ModerationStatus.PENDING
        product.moderation_note = None

    db.commit()
    db.refresh(product)
    return product


@router.delete(
    "/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    tags=["products"],
)
def deactivate_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    product = _get_product_or_404(db, product_id)
    business = _get_business_or_404(db, product.business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your product.")
    product.is_active = False
    db.commit()


@router.post("/products/{product_id}/images", response_model=ProductRead, tags=["products"])
async def upload_product_images(
    product_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = _get_product_or_404(db, product_id)
    business = _get_business_or_404(db, product.business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your product.")

    if len(product.images) + len(files) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A product can have at most 10 images.",
        )

    backend = get_storage_backend()
    new_urls: list[str] = []
    for file in files:
        content = await read_and_validate_image(file)
        url = backend.upload(
            content=content,
            filename=file.filename or "image",
            content_type=file.content_type or "application/octet-stream",
            folder=f"products/{product.id}/images",
        )
        new_urls.append(url)

    product.images = [*product.images, *new_urls]
    db.commit()
    db.refresh(product)
    return product
