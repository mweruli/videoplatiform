"""Owner/admin-facing endpoints for Phase 1b's self-serve advertiser
campaign manager: pricing lookup, campaign CRUD + lifecycle transitions,
funding initiation/history, and the public impression/click batch endpoints.
Mirrors app/api/v1/endpoints/featured_purchases.py's structure (owner/admin
`_can_manage` gate, `_get_business_or_404` helper, "only create the funding
row after Daraja accepts" rule).

The Safaricom-facing callback (`POST /payments/mpesa/callback`) is extended
in app/api/v1/endpoints/payments.py, not duplicated here — see that file and
app/models/campaign_funding.py's module docstring for why.

Admin moderation (`GET /admin/campaigns`, approve/reject) lives in
app/api/v1/endpoints/admin.py, same audience-split convention as every other
moderated content type in this codebase.

See docs/decisions.md's "Phase 1b design pass: self-serve advertiser
campaign manager" entry for the full design this implements — the lifecycle
state machine, the funding/moderation-independence rules, and the exact
transition table are documented there and on `CampaignStatus`
(app/models/campaign.py) itself; this module doesn't re-derive any of it.
"""

from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.campaign_pricing import CPM_KES, MIN_FUNDING_KES
from app.db.session import get_db
from app.models.business import Business
from app.models.campaign import (
    COMPLETABLE_STATUSES,
    FUNDABLE_STATUSES,
    Campaign,
    CampaignStatus,
)
from app.models.campaign_funding import CampaignFunding, CampaignFundingStatus
from app.models.category import Category
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.campaign import (
    CampaignCreate,
    CampaignFundingCreate,
    CampaignFundingRead,
    CampaignPricingRead,
    CampaignRead,
    CampaignUpdate,
)
from app.schemas.common import ImpressionBatchRequest, ImpressionBatchResult, Page
from app.services.campaign_billing import record_campaign_clicks, record_campaign_impressions
from app.services.mpesa import MpesaError, get_payment_backend

router = APIRouter()


def _can_manage(business: Business, user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN or business.owner_id == user.id


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


def _get_campaign_or_404(db: Session, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    return campaign


def _get_funding_or_404(db: Session, funding_id: uuid.UUID) -> CampaignFunding:
    funding = db.get(CampaignFunding, funding_id)
    if funding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Campaign funding not found."
        )
    return funding


def _resolve_target_product(
    db: Session, business_id: uuid.UUID, product_id: uuid.UUID | None
) -> Product | None:
    """Same convention as featured_purchases.py's/videos.py's equivalents:
    `product_id`, if given, must belong to `business_id` — enforced here, not
    by a DB constraint (see app/models/campaign.py's module docstring)."""
    if product_id is None:
        return None
    product = db.get(Product, product_id)
    if product is None or product.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must reference a product owned by this business.",
        )
    return product


def _resolve_category(db: Session, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="category_id not found."
        )
    return category


@router.get("/campaigns/pricing", response_model=CampaignPricingRead, tags=["campaigns"])
def get_campaign_pricing() -> CampaignPricingRead:
    """Public — so the frontend never hardcodes the CPM rate/minimum top-up.
    See app/core/campaign_pricing.py, the single source of truth."""
    return CampaignPricingRead(
        cpm_kes=CPM_KES,
        cost_per_impression_kes=CPM_KES / 1000,
        min_funding_kes=MIN_FUNDING_KES,
    )


@router.post(
    "/businesses/{business_id}/campaigns",
    response_model=CampaignRead,
    status_code=status.HTTP_201_CREATED,
    tags=["campaigns"],
)
def create_campaign(
    business_id: uuid.UUID,
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only. Always starts PENDING_REVIEW with zero budget —
    funding is a separate step (`POST /campaigns/{id}/funding`) and, per the
    funding/moderation-independence rule, can happen before, during, or
    after moderation in any order."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    product = _resolve_target_product(db, business.id, payload.product_id)
    _resolve_category(db, payload.category_id)

    campaign = Campaign(
        business_id=business.id,
        product_id=product.id if product is not None else None,
        initiated_by_user_id=current_user.id,
        name=payload.name,
        category_id=payload.category_id,
        county=payload.county,
        cpm_kes=CPM_KES,
        budget_kes=0,
        spent_kes=0,
        status=CampaignStatus.PENDING_REVIEW,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.get(
    "/businesses/{business_id}/campaigns",
    response_model=Page[CampaignRead],
    tags=["campaigns"],
)
def list_business_campaigns(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = 20,
) -> Page[CampaignRead]:
    """Owner/admin only. Paginated campaign list for a business."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(Campaign).where(Campaign.business_id == business_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Campaign.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/campaigns/{campaign_id}", response_model=CampaignRead, tags=["campaigns"])
def get_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    return campaign


@router.patch("/campaigns/{campaign_id}", response_model=CampaignRead, tags=["campaigns"])
def update_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only. Target (`business_id`/`product_id`) is immutable —
    not present in `CampaignUpdate` at all. `COMPLETED` is a true terminal
    state and cannot be edited (409) — see app/models/campaign.py's
    `CampaignStatus` docstring.

    Re-review on edit, same policy as products/videos: editing `name`/
    `category_id`/`county` resets APPROVED/ACTIVE/PAUSED/EXHAUSTED back to
    PENDING_REVIEW (admin edits exempt) — this immediately stops the
    campaign from serving (only ACTIVE serves) until re-approved. Editing a
    PENDING_REVIEW or REJECTED campaign does NOT force a reset — it's
    already awaiting/available-for moderator action (REJECTED can be
    re-approved directly per `APPROVABLE_STATUSES`), so there's no
    already-public state to protect by resetting it."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    if campaign.status == CampaignStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completed campaign cannot be edited.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "category_id" in update_data:
        _resolve_category(db, update_data["category_id"])
    for field, value in update_data.items():
        setattr(campaign, field, value)

    reviewed_statuses = (
        CampaignStatus.APPROVED,
        CampaignStatus.ACTIVE,
        CampaignStatus.PAUSED,
        CampaignStatus.EXHAUSTED,
    )
    if (
        current_user.role != UserRole.PLATFORM_ADMIN
        and update_data
        and campaign.status in reviewed_statuses
    ):
        campaign.status = CampaignStatus.PENDING_REVIEW
        campaign.moderation_note = None

    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/pause", response_model=CampaignRead, tags=["campaigns"])
def pause_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only. ACTIVE -> PAUSED only, 409 otherwise — see
    `CampaignStatus`'s transition table."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    if campaign.status != CampaignStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot pause from status '{campaign.status.value}'; "
                "campaign must be 'active'."
            ),
        )
    campaign.status = CampaignStatus.PAUSED
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/resume", response_model=CampaignRead, tags=["campaigns"])
def resume_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only. PAUSED -> ACTIVE only, unconditionally (a paused
    campaign never spends, so its budget headroom can't have changed while
    paused) — 409 otherwise."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    if campaign.status != CampaignStatus.PAUSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot resume from status '{campaign.status.value}'; "
                "campaign must be 'paused'."
            ),
        )
    campaign.status = CampaignStatus.ACTIVE
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/complete", response_model=CampaignRead, tags=["campaigns"])
def complete_campaign(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Campaign:
    """Owner/admin only. Owner's own deliberate "I'm done" — allowed from any
    non-COMPLETED state (`COMPLETABLE_STATUSES`), 409 from COMPLETED itself
    (double-click safety). Truly terminal: see `CampaignStatus`'s docstring
    for why this is NOT the same as EXHAUSTED."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    if campaign.status not in COMPLETABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Campaign is already completed.",
        )
    campaign.status = CampaignStatus.COMPLETED
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post(
    "/campaigns/{campaign_id}/funding",
    response_model=CampaignFundingRead,
    status_code=status.HTTP_201_CREATED,
    tags=["campaigns"],
)
def create_campaign_funding(
    campaign_id: uuid.UUID,
    payload: CampaignFundingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignFunding:
    """Owner/admin only. Mirrors featured_purchases.py's
    `create_featured_purchase` STK-push-initiate pattern exactly: only
    creates the `CampaignFunding` row after Daraja's STK Push call itself
    succeeds (i.e. once a real `checkout_request_id` exists) — a synchronous
    Daraja failure has nothing a callback could ever correlate to, so a row
    with no `checkout_request_id` would just be dead data. Allowed from any
    `FUNDABLE_STATUSES` (everything except COMPLETED) — funding is
    independent of moderation, see docs/decisions.md."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")
    if campaign.status not in FUNDABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot fund a campaign with status '{campaign.status.value}'.",
        )

    account_reference = campaign.name[:12] or "Campaign"
    transaction_desc = f"Ad campaign top-up ({campaign.name})"[:100]

    try:
        stk_result = get_payment_backend().initiate_stk_push(
            phone=payload.phone,
            amount=int(payload.amount_kes),
            account_reference=account_reference,
            transaction_desc=transaction_desc,
        )
    except MpesaError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not initiate M-Pesa payment: {exc}",
        ) from exc

    funding = CampaignFunding(
        campaign_id=campaign.id,
        initiated_by_user_id=current_user.id,
        amount_kes=payload.amount_kes,
        status=CampaignFundingStatus.PENDING,
        checkout_request_id=stk_result.checkout_request_id,
        merchant_request_id=stk_result.merchant_request_id,
        payer_phone=payload.phone,
    )
    db.add(funding)
    db.commit()
    db.refresh(funding)
    return funding


@router.get(
    "/campaign-fundings/{funding_id}",
    response_model=CampaignFundingRead,
    tags=["campaigns"],
)
def get_campaign_funding(
    funding_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignFunding:
    """Owner/admin only. What the frontend polls to move the UI through
    "waiting for you to approve on your phone" -> success/failed, same as
    `GET /featured-purchases/{id}`."""
    funding = _get_funding_or_404(db, funding_id)
    if not _can_manage(funding.campaign.business, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign funding."
        )
    return funding


@router.get(
    "/campaigns/{campaign_id}/fundings",
    response_model=Page[CampaignFundingRead],
    tags=["campaigns"],
)
def list_campaign_fundings(
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = 20,
) -> Page[CampaignFundingRead]:
    """Owner/admin only. Paginated funding/top-up history for a campaign."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if not _can_manage(campaign.business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your campaign.")

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(CampaignFunding).where(CampaignFunding.campaign_id == campaign_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(CampaignFunding.created_at.desc())
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


@router.post(
    "/campaigns/impressions", response_model=ImpressionBatchResult, tags=["campaigns"]
)
def record_campaign_impressions_endpoint(
    payload: ImpressionBatchRequest, db: Session = Depends(get_db)
) -> ImpressionBatchResult:
    """Public batch endpoint, byte-for-byte the same shape as
    `POST /businesses/impressions`/`POST /products/impressions` — the
    frontend calls this once per search-results/browse render with the ids
    of campaigns whose Sponsored tie-break is currently rendered. Delegates
    to app/services/campaign_billing.py's atomic, race-safe deduction — see
    that module for why this must be a single UPDATE, not read-then-write."""
    updated = record_campaign_impressions(db, list(payload.ids))
    return ImpressionBatchResult(updated=updated)


@router.post("/campaigns/clicks", response_model=ImpressionBatchResult, tags=["campaigns"])
def record_campaign_clicks_endpoint(
    payload: ImpressionBatchRequest, db: Session = Depends(get_db)
) -> ImpressionBatchResult:
    """Public batch endpoint, analytics-only — never touches `spent_kes`
    (CPM-only for v1, see app/core/campaign_pricing.py)."""
    updated = record_campaign_clicks(db, list(payload.ids))
    return ImpressionBatchResult(updated=updated)
