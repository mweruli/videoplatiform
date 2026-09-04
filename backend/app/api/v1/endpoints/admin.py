"""Admin moderation endpoints — backs the moderation queue / admin dashboard.

All routes here require platform_admin or content_moderator (see
app.api.deps.require_moderator). Business verification approve/reject is
admin/moderator-only per PROJECT_BRIEF.md's roles table; product approve/
reject uses the same gate since both are "review UGC/commercial content
before publication" per the Content Moderation section.
"""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_moderator
from app.db.session import get_db
from app.models.business import Business, VerificationStatus
from app.models.category import Category
from app.models.product import ModerationStatus, Product, product_categories
from app.models.user import User, UserRole
from app.models.video import Video, video_categories
from app.schemas.auth import AdminUserDetail, AdminUserRead, AdminUserUpdate
from app.schemas.business import (
    BusinessModerationAction,
    BusinessRead,
    BusinessRejectAction,
    BusinessSummary,
)
from app.schemas.category import AdminCategoryRead, CategoryCreate, CategoryRead, CategoryUpdate
from app.schemas.common import Page
from app.schemas.product import ProductModerationAction, ProductRead, ProductRejectAction
from app.schemas.video import VideoModerationAction, VideoRead, VideoRejectAction
from app.utils.slug import unique_slug

router = APIRouter()


def _paginate_params(page: int, page_size: int) -> tuple[int, int]:
    return max(page, 1), min(max(page_size, 1), 100)


# --- Businesses ---------------------------------------------------------


@router.get(
    "/admin/businesses",
    response_model=Page[BusinessRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_businesses(
    db: Session = Depends(get_db),
    status_filter: VerificationStatus | None = Query(default=None, alias="status"),
    category_id: int | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[BusinessRead]:
    page, page_size = _paginate_params(page, page_size)

    stmt = select(Business)
    if status_filter is not None:
        stmt = stmt.where(Business.verification_status == status_filter)
    if category_id is not None:
        stmt = stmt.where(Business.category_id == category_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Business.name).like(like))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Business.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items, total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


@router.post(
    "/admin/businesses/{business_id}/approve",
    response_model=BusinessRead,
    tags=["admin"],
)
def approve_business(
    business_id: uuid.UUID,
    payload: BusinessModerationAction = BusinessModerationAction(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Business:
    business = _get_business_or_404(db, business_id)
    if business.verification_status != VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{business.verification_status.value}'; "
            "business must be 'pending'.",
        )
    business.verification_status = VerificationStatus.VERIFIED
    business.verification_note = payload.note
    db.commit()
    db.refresh(business)
    return business


@router.post(
    "/admin/businesses/{business_id}/reject",
    response_model=BusinessRead,
    tags=["admin"],
)
def reject_business(
    business_id: uuid.UUID,
    payload: BusinessRejectAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Business:
    business = _get_business_or_404(db, business_id)
    if business.verification_status != VerificationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{business.verification_status.value}'; "
            "business must be 'pending'.",
        )
    business.verification_status = VerificationStatus.REJECTED
    business.verification_note = payload.reason
    db.commit()
    db.refresh(business)
    return business


# --- Featured placement (Phase 1a — manual, platform-controlled only; see
# PROJECT_BRIEF.md's Digital Advertising section and Business/Product's
# `is_featured` model docstrings. NOT a self-serve campaign manager — no
# budgets/dates/targeting, that's Phase 1b+.) --------------------------------


@router.post(
    "/admin/businesses/{business_id}/feature",
    response_model=BusinessRead,
    tags=["admin"],
)
def feature_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Business:
    business = _get_business_or_404(db, business_id)
    business.is_featured = True
    db.commit()
    db.refresh(business)
    return business


@router.post(
    "/admin/businesses/{business_id}/unfeature",
    response_model=BusinessRead,
    tags=["admin"],
)
def unfeature_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Business:
    business = _get_business_or_404(db, business_id)
    business.is_featured = False
    db.commit()
    db.refresh(business)
    return business


# --- Products ------------------------------------------------------------


@router.get(
    "/admin/products",
    response_model=Page[ProductRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_products(
    db: Session = Depends(get_db),
    status_filter: ModerationStatus | None = Query(default=None, alias="status"),
    business_id: uuid.UUID | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[ProductRead]:
    page, page_size = _paginate_params(page, page_size)

    stmt = select(Product)
    if status_filter is not None:
        stmt = stmt.where(Product.moderation_status == status_filter)
    if business_id is not None:
        stmt = stmt.where(Product.business_id == business_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Product.name).like(like))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Product.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items, total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _get_product_or_404(db: Session, product_id: uuid.UUID) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    return product


@router.post(
    "/admin/products/{product_id}/approve",
    response_model=ProductRead,
    tags=["admin"],
)
def approve_product(
    product_id: uuid.UUID,
    payload: ProductModerationAction = ProductModerationAction(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Product:
    product = _get_product_or_404(db, product_id)
    if product.moderation_status != ModerationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{product.moderation_status.value}'; "
            "product must be 'pending'.",
        )
    product.moderation_status = ModerationStatus.APPROVED
    product.moderation_note = payload.note
    db.commit()
    db.refresh(product)
    return product


@router.post(
    "/admin/products/{product_id}/reject",
    response_model=ProductRead,
    tags=["admin"],
)
def reject_product(
    product_id: uuid.UUID,
    payload: ProductRejectAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Product:
    product = _get_product_or_404(db, product_id)
    if product.moderation_status != ModerationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{product.moderation_status.value}'; "
            "product must be 'pending'.",
        )
    product.moderation_status = ModerationStatus.REJECTED
    product.moderation_note = payload.reason
    db.commit()
    db.refresh(product)
    return product


@router.post(
    "/admin/products/{product_id}/feature",
    response_model=ProductRead,
    tags=["admin"],
)
def feature_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Product:
    product = _get_product_or_404(db, product_id)
    product.is_featured = True
    db.commit()
    db.refresh(product)
    return product


@router.post(
    "/admin/products/{product_id}/unfeature",
    response_model=ProductRead,
    tags=["admin"],
)
def unfeature_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Product:
    product = _get_product_or_404(db, product_id)
    product.is_featured = False
    db.commit()
    db.refresh(product)
    return product


# --- Videos ---------------------------------------------------------------


@router.get(
    "/admin/videos",
    response_model=Page[VideoRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_videos(
    db: Session = Depends(get_db),
    status_filter: ModerationStatus | None = Query(default=None, alias="status"),
    business_id: uuid.UUID | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[VideoRead]:
    page, page_size = _paginate_params(page, page_size)

    stmt = select(Video)
    if status_filter is not None:
        stmt = stmt.where(Video.moderation_status == status_filter)
    if business_id is not None:
        stmt = stmt.where(Video.business_id == business_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Video.title).like(like))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Video.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items, total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _get_video_or_404(db: Session, video_id: uuid.UUID) -> Video:
    video = db.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    return video


@router.post(
    "/admin/videos/{video_id}/approve",
    response_model=VideoRead,
    tags=["admin"],
)
def approve_video(
    video_id: uuid.UUID,
    payload: VideoModerationAction = VideoModerationAction(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Video:
    video = _get_video_or_404(db, video_id)
    if video.moderation_status != ModerationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{video.moderation_status.value}'; "
            "video must be 'pending'.",
        )
    video.moderation_status = ModerationStatus.APPROVED
    video.moderation_note = payload.note
    db.commit()
    db.refresh(video)
    return video


@router.post(
    "/admin/videos/{video_id}/reject",
    response_model=VideoRead,
    tags=["admin"],
)
def reject_video(
    video_id: uuid.UUID,
    payload: VideoRejectAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Video:
    video = _get_video_or_404(db, video_id)
    if video.moderation_status != ModerationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{video.moderation_status.value}'; "
            "video must be 'pending'.",
        )
    video.moderation_status = ModerationStatus.REJECTED
    video.moderation_note = payload.reason
    db.commit()
    db.refresh(video)
    return video


# --- Categories (Phase 1a: "Category framework ... admin-editable") -------
# Deactivate-only, never hard-delete — products/videos reference categories
# via FK/join tables (product_categories, video_categories) and businesses
# via a direct category_id FK, so a hard-delete would either orphan those
# references or require a cascade that silently strips categorisation from
# existing listings. `is_active=False` hides a category from the public
# `GET /categories` list (and therefore category pickers) while leaving
# every existing reference to it intact — see docs/decisions.md for the full
# reasoning.


@router.get(
    "/admin/categories",
    response_model=list[AdminCategoryRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_categories(db: Session = Depends(get_db)) -> list[AdminCategoryRead]:
    """Unlike the public `GET /categories`, this returns inactive categories
    too — an admin managing the category list needs to see (and be able to
    reactivate) ones they've previously deactivated. Also adds a "used by"
    count per category (active businesses/products/videos referencing it) for
    the Admin Category Management screen — see docs/decisions.md.

    Each count is a single grouped aggregate query (not N+1 per category),
    same pattern as businesses.py's get_business_stats."""
    categories = list(db.scalars(select(Category).order_by(Category.name)).all())

    business_counts: dict[int, int] = dict(
        db.execute(
            select(Business.category_id, func.count(Business.id))
            .where(Business.is_active.is_(True), Business.category_id.is_not(None))
            .group_by(Business.category_id)
        ).all()
    )
    product_counts: dict[int, int] = dict(
        db.execute(
            select(product_categories.c.category_id, func.count(product_categories.c.product_id))
            .select_from(
                product_categories.join(Product, Product.id == product_categories.c.product_id)
            )
            .where(Product.is_active.is_(True))
            .group_by(product_categories.c.category_id)
        ).all()
    )
    video_counts: dict[int, int] = dict(
        db.execute(
            select(video_categories.c.category_id, func.count(video_categories.c.video_id))
            .select_from(video_categories.join(Video, Video.id == video_categories.c.video_id))
            .where(Video.is_active.is_(True))
            .group_by(video_categories.c.category_id)
        ).all()
    )

    return [
        AdminCategoryRead(
            id=category.id,
            name=category.name,
            slug=category.slug,
            is_active=category.is_active,
            business_count=business_counts.get(category.id, 0),
            product_count=product_counts.get(category.id, 0),
            video_count=video_counts.get(category.id, 0),
        )
        for category in categories
    ]


def _get_category_or_404(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
    return category


@router.post(
    "/admin/categories",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
    tags=["admin"],
)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Category:
    existing = db.scalar(select(Category).where(func.lower(Category.name) == payload.name.lower()))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with that name already exists.",
        )
    slug = unique_slug(
        payload.name, lambda s: db.scalar(select(Category).where(Category.slug == s)) is not None
    )
    category = Category(name=payload.name, slug=slug, is_active=True)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.patch(
    "/admin/categories/{category_id}",
    response_model=CategoryRead,
    tags=["admin"],
)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Category:
    category = _get_category_or_404(db, category_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        new_name = update_data["name"]
        clash = db.scalar(
            select(Category).where(
                func.lower(Category.name) == new_name.lower(), Category.id != category_id
            )
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with that name already exists.",
            )

    for field, value in update_data.items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


# --- Users (Phase 1a: "Admin dashboard: users, businesses, listings,
# moderation") -------------------------------------------------------------
# Deactivating a user is a soft-delete (is_active=False), matching the
# soft-delete philosophy used everywhere else (businesses, products, videos)
# in this codebase — it never deletes the account's data. It also does NOT
# cascade to businesses the user owns (they stay exactly as they were,
# verified/active or not) — see docs/decisions.md for the reasoning and the
# self-deactivation / platform_admin guards enforced below.


@router.get(
    "/admin/users",
    response_model=Page[AdminUserRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_users(
    db: Session = Depends(get_db),
    role: UserRole | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[AdminUserRead]:
    page, page_size = _paginate_params(page, page_size)

    stmt = select(User)
    if role is not None:
        stmt = stmt.where(User.role == role)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(User.full_name).like(like)
            | func.lower(User.email).like(like)
            | func.lower(User.phone).like(like)
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items, total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _get_user_or_404(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.get(
    "/admin/users/{user_id}",
    response_model=AdminUserDetail,
    tags=["admin"],
)
def admin_get_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> User:
    user = _get_user_or_404(db, user_id)
    businesses = list(
        db.scalars(select(Business).where(Business.owner_id == user.id).order_by(
            Business.created_at.desc()
        )).all()
    )
    data = AdminUserRead.model_validate(user).model_dump()
    data["businesses"] = [BusinessSummary.model_validate(b) for b in businesses]
    return AdminUserDetail(**data)


@router.patch(
    "/admin/users/{user_id}",
    response_model=AdminUserRead,
    tags=["admin"],
)
def admin_update_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> User:
    user = _get_user_or_404(db, user_id)

    if payload.is_active is False:
        if user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot deactivate your own account.",
            )
        if user.role == UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="platform_admin accounts cannot be deactivated via this endpoint.",
            )

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user
