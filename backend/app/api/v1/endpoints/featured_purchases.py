"""Owner/admin-facing endpoints for Phase 1b's M-Pesa self-serve featured
placement: pricing lookup, purchase initiation, purchase status, purchase
history. Mirrors app/api/v1/endpoints/videos.py's structure (owner/admin
`_can_manage` gate, `_get_business_or_404` helper).

The Safaricom-facing callback (`POST /payments/mpesa/callback`) deliberately
lives in a separate file, app/api/v1/endpoints/payments.py — it's
unauthenticated and not part of the owner-facing API surface, same reasoning
as admin.py being split out by audience rather than resource. See
docs/decisions.md's "Phase 1b design pass" entry for the full design.
"""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.business import Business
from app.models.featured_pricing_tier import FeaturedPricingTier
from app.models.featured_purchase import FeaturedPurchase, FeaturedPurchaseStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.common import Page
from app.schemas.featured_pricing_tier import FeaturedPricingTierRead
from app.schemas.featured_purchase import FeaturedPurchaseCreate, FeaturedPurchaseRead
from app.services.mpesa import MpesaError, get_payment_backend

router = APIRouter()


def _can_manage(business: Business, user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN or business.owner_id == user.id


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


def _get_purchase_or_404(db: Session, purchase_id: uuid.UUID) -> FeaturedPurchase:
    purchase = db.get(FeaturedPurchase, purchase_id)
    if purchase is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Featured purchase not found."
        )
    return purchase


def _resolve_target_product(
    db: Session, business_id: uuid.UUID, product_id: uuid.UUID | None
) -> Product | None:
    """Same convention as videos.py's `_resolve_product`: `product_id`, if
    given, must belong to `business_id` — enforced here, not by a DB
    constraint (see app/models/featured_purchase.py's module docstring)."""
    if product_id is None:
        return None
    product = db.get(Product, product_id)
    if product is None or product.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must reference a product owned by this business.",
        )
    return product


def _resolve_active_tier(db: Session, tier_id: int) -> FeaturedPricingTier:
    """`tier_id` must reference a currently-active `FeaturedPricingTier` row
    — an admin shouldn't be able to sell a tier they've deactivated. 400 for
    both "doesn't exist" and "exists but inactive," same convention as
    campaigns.py's `_resolve_category`/this file's own
    `_resolve_target_product`."""
    tier = db.get(FeaturedPricingTier, tier_id)
    if tier is None or not tier.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tier_id must reference a currently active pricing tier.",
        )
    return tier


@router.get(
    "/featured/pricing", response_model=list[FeaturedPricingTierRead], tags=["featured-purchases"]
)
def list_featured_pricing(db: Session = Depends(get_db)) -> list[FeaturedPricingTier]:
    """Public — so the frontend never hardcodes amounts/durations. Reads
    currently-active tiers from the DB (app/models/featured_pricing_tier.py)
    — see docs/decisions.md's "Admin-editable pricing" entry for why this
    replaced the old hardcoded `FEATURED_PRICING` dict. Each tier's `id` is
    included so the frontend can pass it straight back as `tier_id` on
    purchase."""
    return list(
        db.scalars(
            select(FeaturedPricingTier)
            .where(FeaturedPricingTier.is_active.is_(True))
            .order_by(FeaturedPricingTier.duration_days)
        ).all()
    )


@router.post(
    "/businesses/{business_id}/featured-purchases",
    response_model=FeaturedPurchaseRead,
    status_code=status.HTTP_201_CREATED,
    tags=["featured-purchases"],
)
def create_featured_purchase(
    business_id: uuid.UUID,
    payload: FeaturedPurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeaturedPurchase:
    """Owner/admin only. Validates `product_id` (if given) belongs to this
    business, then calls the PaymentBackend to initiate an STK Push.

    Deliberately only creates the `FeaturedPurchase` row *after* Daraja's STK
    Push call itself succeeds (i.e. once a real `checkout_request_id`
    exists) — a synchronous Daraja failure (bad credentials, network error,
    rejected request) has nothing a callback could ever correlate to, so a
    row with no `checkout_request_id` would just be dead data. A synchronous
    failure is surfaced as 502, and nothing is created."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    product = _resolve_target_product(db, business.id, payload.product_id)
    tier = _resolve_active_tier(db, payload.tier_id)

    target_label = product.name if product is not None else business.name
    account_reference = target_label[:12] or "Featured"
    transaction_desc = f"Featured placement ({tier.label})"[:100]

    try:
        stk_result = get_payment_backend().initiate_stk_push(
            phone=payload.phone,
            amount=int(tier.amount_kes),
            account_reference=account_reference,
            transaction_desc=transaction_desc,
        )
    except MpesaError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not initiate M-Pesa payment: {exc}",
        ) from exc

    purchase = FeaturedPurchase(
        business_id=business.id,
        product_id=product.id if product is not None else None,
        initiated_by_user_id=current_user.id,
        tier_label=tier.label,
        amount_kes=tier.amount_kes,
        duration_days=tier.duration_days,
        status=FeaturedPurchaseStatus.PENDING,
        checkout_request_id=stk_result.checkout_request_id,
        merchant_request_id=stk_result.merchant_request_id,
        payer_phone=payload.phone,
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return purchase


@router.get(
    "/featured-purchases/{purchase_id}",
    response_model=FeaturedPurchaseRead,
    tags=["featured-purchases"],
)
def get_featured_purchase(
    purchase_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FeaturedPurchase:
    """Owner/admin only. What the frontend polls (every 2-3s is reasonable)
    to move the UI through "waiting for you to approve on your phone" ->
    success/failed without a hard reload — see docs/decisions.md."""
    purchase = _get_purchase_or_404(db, purchase_id)
    if not _can_manage(purchase.business, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your featured purchase."
        )
    return purchase


@router.get(
    "/businesses/{business_id}/featured-purchases",
    response_model=Page[FeaturedPurchaseRead],
    tags=["featured-purchases"],
)
def list_business_featured_purchases(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = 20,
) -> Page[FeaturedPurchaseRead]:
    """Owner/admin only. Paginated purchase history for a business."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(FeaturedPurchase).where(FeaturedPurchase.business_id == business_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(FeaturedPurchase.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(db.scalars(stmt).all())

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )
