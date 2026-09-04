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

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.business import Business, VerificationStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.models.video import Video
from app.schemas.business import (
    BusinessCreate,
    BusinessRead,
    BusinessStats,
    BusinessUpdate,
    BusinessViewResult,
    ModerationStatusCounts,
)
from app.schemas.common import ImpressionBatchRequest, ImpressionBatchResult, Page
from app.services.featured_expiry import sweep_expired_featured_businesses
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
    return _get_business_or_404(db, business_id)


@router.get(
    "/businesses/slug/{slug}", response_model=BusinessRead, tags=["businesses"]
)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)) -> Business:
    sweep_expired_featured_businesses(db)
    business = db.scalar(select(Business).where(Business.slug == slug))
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
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
    results are just as real a signal as a logged-in one's)."""
    result = db.execute(
        update(Business)
        .where(
            Business.id.in_(payload.ids),
            Business.is_active.is_(True),
            Business.verification_status == VerificationStatus.VERIFIED,
        )
        .values(impression_count=Business.impression_count + 1)
    )
    db.commit()
    return ImpressionBatchResult(updated=result.rowcount or 0)


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
    existing "active only" convention elsewhere in this codebase."""
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    product_counts = ModerationStatusCounts()
    total_product_views = 0
    product_rows = db.execute(
        select(
            Product.moderation_status,
            func.count(Product.id),
            func.coalesce(func.sum(Product.view_count), 0),
        )
        .where(Product.business_id == business_id, Product.is_active.is_(True))
        .group_by(Product.moderation_status)
    ).all()
    for moderation_status, count, views in product_rows:
        setattr(product_counts, moderation_status.value, count)
        total_product_views += int(views)

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

    return BusinessStats(
        business_id=business.id,
        business_view_count=business.view_count,
        business_impression_count=business.impression_count,
        total_product_views=total_product_views,
        total_video_views=total_video_views,
        product_counts=product_counts,
        video_counts=video_counts,
    )


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
