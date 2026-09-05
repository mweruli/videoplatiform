"""Business (company profile) CRUD + public browse.

Ownership model: any authenticated user can register a business (they become
its `owner`); managing that business (edit profile, add products, upload
media) is gated to the owner or a platform admin. Moving a business from
unverified -> pending -> verified/rejected is admin/moderator-only — see
app/api/v1/endpoints/admin.py.
"""

from __future__ import annotations

import math
import uuid
from datetime import date as date_
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.business import Business, VerificationStatus
from app.models.business_daily_stats import BusinessDailyStats
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_daily_stats import CampaignDailyStats
from app.models.product import ModerationStatus as ProductModerationStatus
from app.models.product import Product
from app.models.product_daily_stats import ProductDailyStats
from app.models.user import User, UserRole
from app.models.video import Video
from app.models.video_daily_stats import VideoDailyStats
from app.schemas.business import (
    BusinessCreate,
    BusinessRead,
    BusinessStats,
    BusinessStatsTimeseriesDay,
    BusinessUpdate,
    BusinessViewResult,
    ModerationStatusCounts,
    TopProductEntry,
    TopVideoEntry,
)
from app.schemas.campaign_targeting import CampaignTargetingRead
from app.schemas.common import ImpressionBatchRequest, ImpressionBatchResult, Page
from app.services.daily_stats import (
    record_business_impressions_daily,
    record_business_view_daily,
)
from app.services.featured_expiry import sweep_expired_featured_businesses
from app.services.storage import get_storage_backend
from app.services.uploads import read_and_validate_image
from app.utils.slug import unique_slug

router = APIRouter()


def _attach_active_campaigns(db: Session, businesses: list[Business]) -> None:
    """Bulk-loads `active_campaign` onto each Business in one indexed query
    (not N+1) — see docs/decisions.md's "Bulk-loading `active_campaign`
    without N+1" section. Only ever a *business-scoped* campaign
    (`product_id IS NULL`) — a product-scoped campaign must never leak onto
    its parent business's `active_campaign`.

    Sets the transient (non-persisted) `active_campaign` attribute directly
    on each ORM instance before it's returned from the endpoint — same
    "stash a computed value the schema layer has no session to compute
    itself" trick as `ProductSummary`/`ProductRead`'s `primary_image_url`
    validators, applied here at the endpoint layer instead since this one
    needs a DB query."""
    ids = [b.id for b in businesses]
    if not ids:
        return
    campaigns = db.scalars(
        select(Campaign).where(
            Campaign.status == CampaignStatus.ACTIVE,
            Campaign.product_id.is_(None),
            Campaign.business_id.in_(ids),
        )
    ).all()
    by_business_id = {c.business_id: c for c in campaigns}
    for business in businesses:
        campaign = by_business_id.get(business.id)
        business.active_campaign = (
            CampaignTargetingRead(
                campaign_id=campaign.id,
                category_id=campaign.category_id,
                county=campaign.county,
            )
            if campaign is not None
            else None
        )


def _can_manage(business: Business, user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN or business.owner_id == user.id


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


@router.post(
    "/businesses",
    response_model=BusinessRead,
    status_code=status.HTTP_201_CREATED,
    tags=["businesses"],
)
def create_business(
    payload: BusinessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Business:
    def _slug_taken(candidate: str) -> bool:
        return db.scalar(select(Business).where(Business.slug == candidate)) is not None

    slug = unique_slug(payload.name, _slug_taken)
    business = Business(
        owner_id=current_user.id,
        slug=slug,
        verification_status=VerificationStatus.UNVERIFIED,
        **payload.model_dump(),
    )
    db.add(business)
    db.commit()
    db.refresh(business)
    return business


@router.get("/businesses", response_model=Page[BusinessRead], tags=["businesses"])
def list_businesses(
    db: Session = Depends(get_db),
    category_id: int | None = None,
    county: str | None = None,
    city: str | None = None,
    q: str | None = None,
    is_featured: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Page[BusinessRead]:
    """Public directory listing — verified, active businesses only. Pending/
    unverified/rejected businesses are only visible to their owner (via
    GET /businesses/mine) or admins/moderators (via GET /admin/businesses).

    `is_featured=true` scopes to platform-curated featured businesses (see
    admin's feature/unfeature endpoints) — e.g. for a Home "Featured
    Businesses" rail — instead of the frontend having to fetch everything
    and guess via recency."""
    sweep_expired_featured_businesses(db)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(Business).where(
        Business.verification_status == VerificationStatus.VERIFIED,
        Business.is_active.is_(True),
    )
    if category_id is not None:
        stmt = stmt.where(Business.category_id == category_id)
    if is_featured is not None:
        stmt = stmt.where(Business.is_featured.is_(is_featured))
    if county:
        stmt = stmt.where(func.lower(Business.county) == county.lower())
    if city:
        stmt = stmt.where(func.lower(Business.city) == city.lower())
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Business.name).like(like), func.lower(Business.description).like(like))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Business.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())
    _attach_active_campaigns(db, items)

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/businesses/mine", response_model=list[BusinessRead], tags=["businesses"])
def list_my_businesses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Business]:
    stmt = select(Business).where(Business.owner_id == current_user.id).order_by(
        Business.created_at.desc()
    )
    return list(db.scalars(stmt).all())


@router.get("/businesses/{business_id}", response_model=BusinessRead, tags=["businesses"])
def get_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Business:
    """Public detail endpoint. Non-verified businesses are still resolvable
    by id (so an owner can preview their own pending profile via the same
    URL the public will eventually see) — the frontend is responsible for
    only linking to verified businesses from public browse/search surfaces."""
    sweep_expired_featured_businesses(db)
    business = _get_business_or_404(db, business_id)
    _attach_active_campaigns(db, [business])
    return business


@router.get(
    "/businesses/slug/{slug}", response_model=BusinessRead, tags=["businesses"]
)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)) -> Business:
    sweep_expired_featured_businesses(db)
    business = db.scalar(select(Business).where(Business.slug == slug))
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    _attach_active_campaigns(db, [business])
    return business


@router.post(
    "/businesses/{business_id}/view", response_model=BusinessViewResult, tags=["businesses"]
)
def record_business_view(
    business_id: uuid.UUID, db: Session = Depends(get_db)
) -> BusinessViewResult:
    """Increment view_count by 1 — a dedicated POST endpoint mirroring
    videos.py's `record_video_view` exactly (same reasoning: GET stays
    side-effect-free, no per-viewer de-duplication, not launch-blocking to
    add later — see that endpoint's docstring). Only increments for a
    business that's currently public (verified + active); a pending/
    rejected/unverified/deactivated business 404s instead, same as an
    unapproved video."""
    business = _get_business_or_404(db, business_id)
    if not business.is_active or business.verification_status != VerificationStatus.VERIFIED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    business.view_count += 1
    record_business_view_daily(db, business.id)
    db.commit()
    return BusinessViewResult(view_count=business.view_count)


@router.post(
    "/businesses/impressions", response_model=ImpressionBatchResult, tags=["businesses"]
)
def record_business_impressions(
    payload: ImpressionBatchRequest, db: Session = Depends(get_db)
) -> ImpressionBatchResult:
    """Search-appearance signal — see docs/decisions.md for why this batch
    shape was chosen over a fabricated "search appearances" number (search
    ranking/matching happens client-side, see frontend/src/lib/
    searchCatalog.ts, so the server never sees a query's result set unless
    the client reports it). The frontend calls this once per search-results/
    browse render with the ids of businesses currently visible; each id that
    resolves to a real, currently-public (verified + active) business gets
    `impression_count += 1`. Unknown/non-public ids are silently skipped,
    not an error — a stale id in the batch shouldn't fail the whole render's
    reporting call. No auth required, same as the view/impression endpoints
    generally being anonymous-friendly (a logged-out visitor's search
    results are just as real a signal as a logged-in one's).

    Also upserts the same day's row in `business_daily_stats` for exactly
    the ids this call actually matched (via `RETURNING`, not the full
    `payload.ids` list) — a stale/non-public id gets no daily bump either,
    matching the lifetime counter's own skip behavior exactly."""
    result = db.execute(
        update(Business)
        .where(
            Business.id.in_(payload.ids),
            Business.is_active.is_(True),
            Business.verification_status == VerificationStatus.VERIFIED,
        )
        .values(impression_count=Business.impression_count + 1)
        .returning(Business.id)
    )
    updated_ids = list(result.scalars().all())
    record_business_impressions_daily(db, updated_ids)
    db.commit()
    return ImpressionBatchResult(updated=len(updated_ids))


@router.get("/businesses/{business_id}/stats", response_model=BusinessStats, tags=["businesses"])
def get_business_stats(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BusinessStats:
    """Owner (or platform admin) only — aggregate numbers for a business
    owner's own dashboard (the "Analytics" nav item currently scaffolded as
    a disabled "Soon" pill in frontend/src/components/dashboardshell/
    DashboardShell.tsx will call this once the frontend picks it up).
    Product/video counts-by-status and view sums only include currently-
    active (not soft-deleted) rows — matches Business.product_count's
    existing "active only" convention elsewhere in this codebase.

    2026-09-05 additions (Phase 1b analytics read-endpoints round — see
    docs/decisions.md's dated follow-up to the daily-timeseries design pass):
    `top_products`/`top_videos` and the two `*_conversion_rate` funnel
    fields. Both are pure queries/arithmetic over data that already existed
    (lifetime `view_count`/`impression_count`) — no new tracking, no new
    write path."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    product_counts = ModerationStatusCounts()
    total_product_views = 0
    total_product_impressions = 0
    product_rows = db.execute(
        select(
            Product.moderation_status,
            func.count(Product.id),
            func.coalesce(func.sum(Product.view_count), 0),
            func.coalesce(func.sum(Product.impression_count), 0),
        )
        .where(Product.business_id == business_id, Product.is_active.is_(True))
        .group_by(Product.moderation_status)
    ).all()
    for moderation_status, count, views, impressions in product_rows:
        setattr(product_counts, moderation_status.value, count)
        total_product_views += int(views)
        total_product_impressions += int(impressions)

    video_counts = ModerationStatusCounts()
    total_video_views = 0
    video_rows = db.execute(
        select(
            Video.moderation_status,
            func.count(Video.id),
            func.coalesce(func.sum(Video.view_count), 0),
        )
        .where(Video.business_id == business_id, Video.is_active.is_(True))
        .group_by(Video.moderation_status)
    ).all()
    for moderation_status, count, views in video_rows:
        setattr(video_counts, moderation_status.value, count)
        total_video_views += int(views)

    # Best-performing own products/videos, ranked by lifetime view_count —
    # "performing" means actually publicly visible, so scoped to
    # active + approved only (not every row this business owns, unlike the
    # counts/sums above which deliberately include pending/rejected).
    top_products = [
        TopProductEntry(id=p.id, name=p.name, slug=p.slug, view_count=p.view_count)
        for p in db.scalars(
            select(Product)
            .where(
                Product.business_id == business_id,
                Product.is_active.is_(True),
                Product.moderation_status == ProductModerationStatus.APPROVED,
            )
            .order_by(Product.view_count.desc())
            .limit(5)
        ).all()
    ]
    top_videos = [
        TopVideoEntry(id=v.id, title=v.title, view_count=v.view_count)
        for v in db.scalars(
            select(Video)
            .where(
                Video.business_id == business_id,
                Video.is_active.is_(True),
                Video.moderation_status == ProductModerationStatus.APPROVED,
            )
            .order_by(Video.view_count.desc())
            .limit(5)
        ).all()
    ]

    business_view_conversion_rate = (
        business.view_count / business.impression_count
        if business.impression_count > 0
        else None
    )
    product_view_conversion_rate = (
        total_product_views / total_product_impressions
        if total_product_impressions > 0
        else None
    )

    return BusinessStats(
        business_id=business.id,
        business_view_count=business.view_count,
        business_impression_count=business.impression_count,
        total_product_views=total_product_views,
        total_product_impressions=total_product_impressions,
        total_video_views=total_video_views,
        product_counts=product_counts,
        video_counts=video_counts,
        top_products=top_products,
        top_videos=top_videos,
        business_view_conversion_rate=business_view_conversion_rate,
        product_view_conversion_rate=product_view_conversion_rate,
    )


@router.get(
    "/businesses/{business_id}/stats/timeseries",
    response_model=list[BusinessStatsTimeseriesDay],
    tags=["businesses"],
)
def get_business_stats_timeseries(
    business_id: uuid.UUID,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BusinessStatsTimeseriesDay]:
    """Owner (or platform admin) only, same `_can_manage` gate as
    `GET /businesses/{id}/stats`. Day-by-day trend data for a chart: the
    business's own views/impressions, summed views/impressions across its
    active products, summed views across its active videos, and summed
    impressions/clicks/spend across its own campaigns (regardless of which
    product, if any, a campaign promotes) — one row per calendar day for the
    requested window (`days`, default 30, clamped to [1, 90]).

    **Zero-fill, not omit, is the whole point of this endpoint** — see
    docs/decisions.md's "core analytics: daily timeseries layer" entry: a day
    with no activity at all still appears as a real row with every field 0,
    so a frontend chart never has to guess whether a gap means "no data" or
    "no day". Per that entry's explicit guidance, the date range is generated
    in Python (`[start + timedelta(days=n) for n in range(days)]`) and each
    metric source is left-joined against it in Python via a dict lookup —
    deliberately not a Postgres `generate_series` — this data volume doesn't
    need query-side cleverness, and a Python range is simpler to get right.

    Each metric source is queried independently (not one giant join, which
    would double-count rows the moment a business has more than one product
    or video with activity on the same day) and merged into the zero-filled
    range by `stat_date`."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    days = min(max(days, 1), 90)
    start = date_.today() - timedelta(days=days - 1)

    business_by_date = {
        row.stat_date: row
        for row in db.execute(
            select(BusinessDailyStats).where(
                BusinessDailyStats.business_id == business_id,
                BusinessDailyStats.stat_date >= start,
            )
        )
        .scalars()
        .all()
    }

    product_by_date = {
        r[0]: r
        for r in db.execute(
            select(
                ProductDailyStats.stat_date,
                func.sum(ProductDailyStats.view_count),
                func.sum(ProductDailyStats.impression_count),
            )
            .join(Product, Product.id == ProductDailyStats.product_id)
            .where(
                Product.business_id == business_id,
                Product.is_active.is_(True),
                ProductDailyStats.stat_date >= start,
            )
            .group_by(ProductDailyStats.stat_date)
        ).all()
    }

    video_by_date = {
        r[0]: r
        for r in db.execute(
            select(
                VideoDailyStats.stat_date,
                func.sum(VideoDailyStats.view_count),
            )
            .join(Video, Video.id == VideoDailyStats.video_id)
            .where(
                Video.business_id == business_id,
                Video.is_active.is_(True),
                VideoDailyStats.stat_date >= start,
            )
            .group_by(VideoDailyStats.stat_date)
        ).all()
    }

    campaign_by_date = {
        r[0]: r
        for r in db.execute(
            select(
                CampaignDailyStats.stat_date,
                func.sum(CampaignDailyStats.impression_count),
                func.sum(CampaignDailyStats.click_count),
                func.sum(CampaignDailyStats.spend_kes),
            )
            .join(Campaign, Campaign.id == CampaignDailyStats.campaign_id)
            .where(
                Campaign.business_id == business_id,
                CampaignDailyStats.stat_date >= start,
            )
            .group_by(CampaignDailyStats.stat_date)
        ).all()
    }

    result: list[BusinessStatsTimeseriesDay] = []
    for n in range(days):
        day = start + timedelta(days=n)
        b = business_by_date.get(day)
        p = product_by_date.get(day)
        v = video_by_date.get(day)
        c = campaign_by_date.get(day)
        result.append(
            BusinessStatsTimeseriesDay(
                date=day,
                business_views=b.view_count if b else 0,
                business_impressions=b.impression_count if b else 0,
                total_product_views=int(p[1]) if p else 0,
                total_product_impressions=int(p[2]) if p else 0,
                total_video_views=int(v[1]) if v else 0,
                campaign_impression_count=int(c[1]) if c else 0,
                campaign_click_count=int(c[2]) if c else 0,
                campaign_spend_kes=c[3] if c else 0,
            )
        )
    return result


@router.patch("/businesses/{business_id}", response_model=BusinessRead, tags=["businesses"])
def update_business(
    business_id: uuid.UUID,
    payload: BusinessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Business:
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)
    db.commit()
    db.refresh(business)
    return business


@router.delete(
    "/businesses/{business_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    tags=["businesses"],
)
def deactivate_business(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Soft delete: deactivates the business (and, implicitly, hides its
    products from public listings) rather than hard-deleting, so historical
    references (moderation logs, future orders/analytics) stay intact."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")
    business.is_active = False
    db.commit()


@router.post(
    "/businesses/{business_id}/submit-for-verification",
    response_model=BusinessRead,
    tags=["businesses"],
)
def submit_for_verification(
    business_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Business:
    """Owner action: moves unverified/rejected -> pending, i.e. "please review
    my business now". Admin/moderator then approve or reject — see
    app/api/v1/endpoints/admin.py."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")
    allowed = (VerificationStatus.UNVERIFIED, VerificationStatus.REJECTED)
    if business.verification_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot submit for verification from status "
                f"'{business.verification_status.value}'."
            ),
        )
    business.verification_status = VerificationStatus.PENDING
    business.verification_note = None
    db.commit()
    db.refresh(business)
    return business


@router.post("/businesses/{business_id}/logo", response_model=BusinessRead, tags=["businesses"])
async def upload_business_logo(
    business_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Business:
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    content = await read_and_validate_image(file)
    url = get_storage_backend().upload(
        content=content,
        filename=file.filename or "logo",
        content_type=file.content_type or "application/octet-stream",
        folder=f"businesses/{business.id}/logo",
    )
    business.logo_url = url
    db.commit()
    db.refresh(business)
    return business


@router.post(
    "/businesses/{business_id}/cover-image", response_model=BusinessRead, tags=["businesses"]
)
async def upload_business_cover_image(
    business_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Business:
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    content = await read_and_validate_image(file)
    url = get_storage_backend().upload(
        content=content,
        filename=file.filename or "cover",
        content_type=file.content_type or "application/octet-stream",
        folder=f"businesses/{business.id}/cover",
    )
    business.cover_image_url = url
    db.commit()
    db.refresh(business)
    return business
