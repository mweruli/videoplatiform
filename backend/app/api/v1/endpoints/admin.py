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
from app.models.product import ModerationStatus, Product
from app.models.user import User
from app.schemas.business import BusinessModerationAction, BusinessRead, BusinessRejectAction
from app.schemas.common import Page
from app.schemas.product import ProductModerationAction, ProductRead, ProductRejectAction

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
