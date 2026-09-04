"""Admin moderation endpoints — backs the moderation queue / admin dashboard.

All routes here require platform_admin or content_moderator (see
app.api.deps.require_moderator). Business verification approve/reject is
admin/moderator-only per PROJECT_BRIEF.md's roles table; product approve/
reject uses the same gate since both are "review UGC/commercial content
before publication" per the Content Moderation section.

State machine (updated 2026-09-04 — see docs/decisions.md for the full
history): approve/reject are no longer pending-only.
- **Reject** succeeds from `pending` *or* `approved`/`verified` (an admin can
  pull down a previously-approved item, e.g. a policy violation found after
  the fact) but 409s from `rejected` (double-click safety — no silent
  re-reject no-op). A reject always (re-)records the reason in the same
  `moderation_note`/`verification_note` field the owner already sees on
  their own resource.
- **Approve** succeeds from `pending` *or* `rejected` (an admin reversing an
  earlier rejection, e.g. after the owner fixes the flagged issue, or an
  admin who rejected in error) but 409s from `approved` (already approved —
  a no-op, same double-click-safety reasoning as reject-from-rejected).
Rejecting something that was `approved`/`verified` takes it out of public
view immediately, since every public GET already filters on
`moderation_status/verification_status == APPROVED/VERIFIED`.
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
from app.models.campaign import APPROVABLE_STATUSES, REJECTABLE_STATUSES, Campaign, CampaignStatus
from app.models.category import Category
from app.models.featured_pricing_tier import FeaturedPricingTier
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
from app.schemas.campaign import (
    CampaignModerationAction,
    CampaignPricingRead,
    CampaignPricingUpdate,
    CampaignRead,
    CampaignRejectAction,
)
from app.schemas.category import AdminCategoryRead, CategoryCreate, CategoryRead, CategoryUpdate
from app.schemas.common import Page
from app.schemas.featured_pricing_tier import (
    FeaturedPricingTierAdmin,
    FeaturedPricingTierCreate,
    FeaturedPricingTierUpdate,
)
from app.schemas.product import ProductModerationAction, ProductRead, ProductRejectAction
from app.schemas.video import VideoModerationAction, VideoRead, VideoRejectAction
from app.services.campaign_billing import resolve_status_after_approval
from app.services.campaign_pricing import update_campaign_pricing_settings
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

    # is_active always applies, even in the moderation queue — a soft-deleted
    # business shouldn't sit in a moderator's pending/approved/rejected list
    # forever just because it was never hard-removable. Same fix already
    # applied to the public GET /businesses endpoint; this admin-facing list
    # had the identical gap (found live: a soft-deleted business created
    # during R2 verification kept showing as "pending" on the real
    # production Admin Panel).
    stmt = select(Business).where(Business.is_active.is_(True))
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
    allowed = (VerificationStatus.PENDING, VerificationStatus.REJECTED)
    if business.verification_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{business.verification_status.value}'; "
            "business must be 'pending' or 'rejected'.",
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
    allowed = (VerificationStatus.PENDING, VerificationStatus.VERIFIED)
    if business.verification_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{business.verification_status.value}'; "
            "business must be 'pending' or 'verified'.",
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

    # is_active always applies — see admin_list_businesses's comment above,
    # same gap, same fix.
    stmt = select(Product).where(Product.is_active.is_(True))
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
    if product.moderation_status not in (ModerationStatus.PENDING, ModerationStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{product.moderation_status.value}'; "
            "product must be 'pending' or 'rejected'.",
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
    if product.moderation_status not in (ModerationStatus.PENDING, ModerationStatus.APPROVED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{product.moderation_status.value}'; "
            "product must be 'pending' or 'approved'.",
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

    # is_active always applies — see admin_list_businesses's comment above,
    # same gap, same fix.
    stmt = select(Video).where(Video.is_active.is_(True))
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
    if video.moderation_status not in (ModerationStatus.PENDING, ModerationStatus.REJECTED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{video.moderation_status.value}'; "
            "video must be 'pending' or 'rejected'.",
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
    if video.moderation_status not in (ModerationStatus.PENDING, ModerationStatus.APPROVED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{video.moderation_status.value}'; "
            "video must be 'pending' or 'approved'.",
        )
    video.moderation_status = ModerationStatus.REJECTED
    video.moderation_note = payload.reason
    db.commit()
    db.refresh(video)
    return video


# --- Campaigns (Phase 1b: self-serve advertiser campaign manager) --------
# See docs/decisions.md's "Phase 1b design pass: self-serve advertiser
# campaign manager" entry for the full state-machine writeup. Approve/reject
# reuse the exact "pending-or-already-reviewed" relaxation already applied to
# business/product/video above (2026-09-04 "approve/reject can now act on
# already-reviewed content" entry) — `APPROVABLE_STATUSES`/
# `REJECTABLE_STATUSES` on the Campaign model encode this directly rather
# than a hardcoded tuple here, since campaigns have more reachable statuses
# (ACTIVE/PAUSED/EXHAUSTED) than the simple pending/approved/rejected trio
# business/product/video use.


@router.get(
    "/admin/campaigns",
    response_model=Page[CampaignRead],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_campaigns(
    db: Session = Depends(get_db),
    status_filter: CampaignStatus | None = Query(default=None, alias="status"),
    business_id: uuid.UUID | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[CampaignRead]:
    """Campaigns have no soft-delete concept of their own (no `is_active`
    column on `Campaign`), but a campaign's *target* can be soft-deleted
    out from under it — a business or product the owner removed shouldn't
    keep sitting in the moderation queue. Filters on the target's
    `is_active` instead (`Business.is_active` always; `Product.is_active`
    too when the campaign is product-scoped) — this is the campaign-shaped
    equivalent of the exact bug already found and fixed for
    `admin_list_businesses`/`admin_list_products`/`admin_list_videos` above
    (see docs/decisions.md's "admin moderation queues never filtered
    is_active" entry), applied correctly from this endpoint's very first
    version rather than needing a second incident to catch it."""
    page, page_size = _paginate_params(page, page_size)

    stmt = (
        select(Campaign)
        .join(Business, Campaign.business_id == Business.id)
        .outerjoin(Product, Campaign.product_id == Product.id)
        .where(
            Business.is_active.is_(True),
            (Campaign.product_id.is_(None)) | (Product.is_active.is_(True)),
        )
    )
    if status_filter is not None:
        stmt = stmt.where(Campaign.status == status_filter)
    if business_id is not None:
        stmt = stmt.where(Campaign.business_id == business_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Campaign.name).like(like))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Campaign.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items, total=total, page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


def _get_campaign_or_404(db: Session, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.")
    return campaign


@router.post(
    "/admin/campaigns/{campaign_id}/approve",
    response_model=CampaignRead,
    tags=["admin"],
)
def approve_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignModerationAction = CampaignModerationAction(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Campaign:
    """Uses `resolve_status_after_approval()` rather than hardcoding
    `APPROVED` — a campaign that was already funded while pending review
    (funding and moderation are independent, see docs/decisions.md) lands
    straight on ACTIVE instead of an unnecessary intermediate APPROVED hop."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if campaign.status not in APPROVABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve from status '{campaign.status.value}'; "
            "campaign must be 'pending_review' or 'rejected'.",
        )
    campaign.status = resolve_status_after_approval(campaign)
    campaign.moderation_note = payload.note
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post(
    "/admin/campaigns/{campaign_id}/reject",
    response_model=CampaignRead,
    tags=["admin"],
)
def reject_campaign(
    campaign_id: uuid.UUID,
    payload: CampaignRejectAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> Campaign:
    """Rejectable from PENDING_REVIEW/APPROVED/ACTIVE/PAUSED/EXHAUSTED — a
    moderator can pull down a running, spending campaign immediately, same
    as an approved product/video/business. EXHAUSTED is deliberately
    rejectable too, so a naturally-exhausted-but-policy-violating campaign
    can't sit unrejected and later be silently revived by an innocent
    top-up. 409 only from the already-REJECTED double-click case, or from
    COMPLETED (the owner's own terminal choice, not moderation's to
    override)."""
    campaign = _get_campaign_or_404(db, campaign_id)
    if campaign.status not in REJECTABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject from status '{campaign.status.value}'.",
        )
    campaign.status = CampaignStatus.REJECTED
    campaign.moderation_note = payload.reason
    db.commit()
    db.refresh(campaign)
    return campaign


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

    business_counts: dict[int, int] = {
        cat_id: count
        for cat_id, count in db.execute(
            select(Business.category_id, func.count(Business.id))
            .where(Business.is_active.is_(True), Business.category_id.is_not(None))
            .group_by(Business.category_id)
        ).all()
        if cat_id is not None
    }
    product_counts: dict[int, int] = {
        cat_id: count
        for cat_id, count in db.execute(
            select(product_categories.c.category_id, func.count(product_categories.c.product_id))
            .select_from(
                product_categories.join(Product, Product.id == product_categories.c.product_id)
            )
            .where(Product.is_active.is_(True))
            .group_by(product_categories.c.category_id)
        ).all()
    }
    video_counts: dict[int, int] = {
        cat_id: count
        for cat_id, count in db.execute(
            select(video_categories.c.category_id, func.count(video_categories.c.video_id))
            .select_from(video_categories.join(Video, Video.id == video_categories.c.video_id))
            .where(Video.is_active.is_(True))
            .group_by(video_categories.c.category_id)
        ).all()
    }

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


# --- Pricing (admin-editable Featured Placement tiers + Ad Campaign
# CPM/minimum-funding) -------------------------------------------------------
# Replaces the old hardcoded `app/core/featured_pricing.py` (a 2-member
# `FeaturedPricingTier` enum + `FEATURED_PRICING` dict) and
# `app/core/campaign_pricing.py` (`CPM_KES`/`MIN_FUNDING_KES` constants),
# both deleted — see docs/decisions.md's "Admin-editable pricing" entry for
# the full design writeup (why tiers are deactivate-only rows with a
# snapshotted `tier_label` rather than an FK, why campaign pricing is a
# single-row settings table rather than a tier list).


@router.get(
    "/admin/featured-pricing-tiers",
    response_model=list[FeaturedPricingTierAdmin],
    tags=["admin"],
    dependencies=[Depends(require_moderator)],
)
def admin_list_featured_pricing_tiers(db: Session = Depends(get_db)) -> list[FeaturedPricingTier]:
    """Unlike the public `GET /featured/pricing`, this returns inactive tiers
    too — an admin managing the tier list needs to see (and be able to
    reactivate) ones they've previously deactivated."""
    return list(
        db.scalars(
            select(FeaturedPricingTier).order_by(FeaturedPricingTier.duration_days)
        ).all()
    )


def _get_featured_pricing_tier_or_404(db: Session, tier_id: int) -> FeaturedPricingTier:
    tier = db.get(FeaturedPricingTier, tier_id)
    if tier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pricing tier not found.")
    return tier


@router.post(
    "/admin/featured-pricing-tiers",
    response_model=FeaturedPricingTierAdmin,
    status_code=status.HTTP_201_CREATED,
    tags=["admin"],
)
def create_featured_pricing_tier(
    payload: FeaturedPricingTierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> FeaturedPricingTier:
    """Fully flexible — any positive `duration_days`/`amount_kes` combination
    the admin chooses, not locked to a fixed set (PM decision). No
    duplicate-label rejection: unlike `Category.name`, a tier's `label` is
    display-only and never used as an identifier elsewhere (see
    app/models/featured_pricing_tier.py's module docstring), so two tiers
    coincidentally sharing a label is harmless."""
    tier = FeaturedPricingTier(
        label=payload.label,
        duration_days=payload.duration_days,
        amount_kes=payload.amount_kes,
        is_active=True,
    )
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return tier


@router.patch(
    "/admin/featured-pricing-tiers/{tier_id}",
    response_model=FeaturedPricingTierAdmin,
    tags=["admin"],
)
def update_featured_pricing_tier(
    tier_id: int,
    payload: FeaturedPricingTierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> FeaturedPricingTier:
    """Edit label/duration_days/amount_kes and/or toggle is_active — PATCH
    semantics, only supplied fields change. Never retroactively affects any
    `FeaturedPurchase` already made under this tier: those snapshot
    `tier_label`/`amount_kes`/`duration_days` onto their own row at purchase
    time and never look back at this row (see
    app/models/featured_purchase.py's module docstring). Deactivate-only in
    spirit — there is no delete endpoint at all for this resource, same
    precedent as Category."""
    tier = _get_featured_pricing_tier_or_404(db, tier_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tier, field, value)
    db.commit()
    db.refresh(tier)
    return tier


@router.patch(
    "/admin/campaign-pricing",
    response_model=CampaignPricingRead,
    tags=["admin"],
)
def update_campaign_pricing(
    payload: CampaignPricingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_moderator),
) -> CampaignPricingRead:
    """Updates the single `campaign_pricing_settings` row's CPM rate and/or
    minimum top-up amount — PATCH semantics, only supplied fields change.
    Never retroactively affects an already-created `Campaign`: `cpm_kes` is
    snapshotted onto each `Campaign` row at creation time and never re-read
    from this table afterward (see app/services/campaign_billing.py, which
    already correctly bills each campaign's own snapshot — this endpoint
    changes nothing about that). `min_funding_kes` IS read live on every
    future `POST /campaigns/{id}/funding` call, by design — a top-up has no
    snapshot of its own to protect."""
    settings = update_campaign_pricing_settings(
        db, cpm_kes=payload.cpm_kes, min_funding_kes=payload.min_funding_kes
    )
    db.commit()
    db.refresh(settings)
    return CampaignPricingRead(
        cpm_kes=settings.cpm_kes,
        cost_per_impression_kes=settings.cpm_kes / 1000,
        min_funding_kes=settings.min_funding_kes,
    )


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
