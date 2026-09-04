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
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models.business import Business
from app.models.category import Category
from app.models.product import ModerationStatus, Product, product_categories
from app.models.user import User, UserRole
from app.schemas.common import ImpressionBatchRequest, ImpressionBatchResult, Page
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate, ProductViewResult
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


def _related_products_fallback(db: Session, product: Product) -> list[Product]:
    """Fallback used by GET /products/{id} when a product has no curated
    `related_products` (see Product model docstring). Fallback order, tried
    in sequence, first non-empty tier wins (tiers are not merged/topped-up
    from each other — see docs/decisions.md for the judgment call):

    1. Same-category — any other approved+active product sharing at least
       one category via `product_categories`, ranked by number of shared
       categories (desc) then recency, limited to 3. This replaces the old
       "always same-business" fallback, since two products in the same
       business are not necessarily related (a hardware store's cement and
       paintbrushes), while two products sharing a category genuinely are.
    2. Same-business — other approved+active products from the same
       business, limited to 3 (the original fallback, kept as the next
       tier since "same seller" is still a reasonable weak signal when
       category data doesn't help, e.g. the product has zero categories or
       is the only one in its category).
    3. Nothing — an empty list; the frontend already handles a product with
       no related items.
    """
    category_ids = [c.id for c in product.categories]
    if category_ids:
        shared_count = func.count(product_categories.c.category_id).label("shared_count")
        # Select bare ids (not full Product entities) for the grouped/ranked
        # query — Product.business relationship is lazy="joined", and mixing
        # that eager-load JOIN with GROUP BY on the entity trips Postgres's
        # "column must appear in GROUP BY" rule. A second, ungrouped
        # `select(Product)` below fetches the full rows (with their normal
        # eager loads intact) in the same ranked order.
        ranked_ids_stmt = (
            select(Product.id, shared_count)
            .join(product_categories, product_categories.c.product_id == Product.id)
            .where(
                product_categories.c.category_id.in_(category_ids),
                Product.id != product.id,
                Product.moderation_status == ModerationStatus.APPROVED,
                Product.is_active.is_(True),
            )
            .group_by(Product.id)
            .order_by(shared_count.desc(), Product.created_at.desc())
            .limit(3)
        )
        ranked_ids = [row[0] for row in db.execute(ranked_ids_stmt).all()]
        if ranked_ids:
            by_id = {
                p.id: p
                for p in db.scalars(select(Product).where(Product.id.in_(ranked_ids))).all()
            }
            return [by_id[pid] for pid in ranked_ids if pid in by_id]

    return list(
        db.scalars(
            select(Product)
            .where(
                Product.business_id == product.business_id,
                Product.id != product.id,
                Product.moderation_status == ModerationStatus.APPROVED,
                Product.is_active.is_(True),
            )
            .order_by(Product.created_at.desc())
            .limit(3)
        ).all()
    )


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
    is_featured: bool | None = None,
    include_unapproved: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> Page[ProductRead]:
    """Public browse/search. `include_unapproved=true` only takes effect for
    the authenticated owner of `business_id` (or a platform admin) — it lets
    a business dashboard reuse this same endpoint to show its own pending/
    rejected listings without a second, near-duplicate endpoint.

    `is_featured=true` scopes to platform-curated featured products (see
    admin's feature/unfeature endpoints) — e.g. for a Home/Search "Featured
    Products" rail."""
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
    if is_featured is not None:
        stmt = stmt.where(Product.is_featured.is_(is_featured))
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
        # No curated related products — fall back to same-category, then
        # same-business, then nothing. See _related_products_fallback's
        # docstring for the exact order and reasoning.
        product.related_products = _related_products_fallback(db, product)
    return product


@router.get("/products/slug/{slug}", response_model=ProductRead, tags=["products"])
def get_product_by_slug(slug: str, db: Session = Depends(get_db)) -> Product:
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return get_product(product.id, db)


@router.post("/products/{product_id}/view", response_model=ProductViewResult, tags=["products"])
def record_product_view(product_id: uuid.UUID, db: Session = Depends(get_db)) -> ProductViewResult:
    """Increment view_count by 1 — a dedicated POST endpoint mirroring
    app/api/v1/endpoints/videos.py's `record_video_view` exactly (same
    reasoning: GET stays side-effect-free so prefetching/bots/the owner's
    own dashboard don't inflate the count; no per-viewer de-duplication,
    that's an analytics-hardening concern, not launch-blocking). Only
    increments for a product that's currently public (approved + active);
    a pending/rejected/removed product 404s instead, same as an unapproved
    video."""
    product = _get_product_or_404(db, product_id)
    if not product.is_active or product.moderation_status != ModerationStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    product.view_count += 1
    db.commit()
    return ProductViewResult(view_count=product.view_count)


@router.post("/products/impressions", response_model=ImpressionBatchResult, tags=["products"])
def record_product_impressions(
    payload: ImpressionBatchRequest, db: Session = Depends(get_db)
) -> ImpressionBatchResult:
    """Search-appearance signal — see app/api/v1/endpoints/businesses.py's
    `record_business_impressions` (identical shape/reasoning) and
    docs/decisions.md. The frontend calls this once per search-results/
    browse render with the ids of products currently visible; each id that
    resolves to a real, currently-public (approved + active) product gets
    `impression_count += 1`. Unknown/non-public ids are silently skipped."""
    result = db.execute(
        update(Product)
        .where(
            Product.id.in_(payload.ids),
            Product.is_active.is_(True),
            Product.moderation_status == ModerationStatus.APPROVED,
        )
        .values(impression_count=Product.impression_count + 1)
    )
    db.commit()
    return ImpressionBatchResult(updated=result.rowcount or 0)


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
