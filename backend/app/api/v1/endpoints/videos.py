"""Video CRUD, scoped to the owning business, plus public browse — the
video-upload/moderation counterpart to app/api/v1/endpoints/products.py.

Phase 1a scope: videos are business-uploaded (an authenticated business
owner uploads a video for their own business), not creator-uploaded — see
app/models/video.py's module docstring. Upload goes straight to `pending`
moderation, same state machine as Product (docs/decisions.md).

Editing an already-approved video resets it back to `pending`, mirroring
products.py's policy exactly (all UGC/commercial content is reviewed before
publication, per PROJECT_BRIEF.md's Content Moderation section) — admin
edits are exempt, same as products.

`include_unapproved` on the public list endpoint only takes effect for the
authenticated owner of `business_id` (or a platform admin), same pattern as
products.py — and `is_active` is enforced unconditionally regardless of
`include_unapproved`, per the regression fixed on products
(test_removed_product_stays_gone_from_owner_view) — don't repeat that bug
here.
"""

from __future__ import annotations

import math
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models.business import Business
from app.models.category import Category
from app.models.product import ModerationStatus, Product
from app.models.user import User, UserRole
from app.models.video import Video, video_categories
from app.schemas.common import Page
from app.schemas.video import VideoRead, VideoUpdate, VideoViewResult
from app.services.uploads import read_and_validate_video
from app.services.video import get_video_backend

router = APIRouter()


def _can_manage(business: Business, user: User) -> bool:
    return user.role == UserRole.PLATFORM_ADMIN or business.owner_id == user.id


def _get_business_or_404(db: Session, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


def _get_video_or_404(db: Session, video_id: uuid.UUID) -> Video:
    video = db.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    return video


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


def _resolve_product(
    db: Session, business_id: uuid.UUID, product_id: uuid.UUID | None
) -> Product | None:
    if product_id is None:
        return None
    product = db.get(Product, product_id)
    if product is None or product.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="product_id must reference a product owned by this business.",
        )
    return product


@router.post(
    "/businesses/{business_id}/videos",
    response_model=VideoRead,
    status_code=status.HTTP_201_CREATED,
    tags=["videos"],
)
async def upload_video(
    business_id: uuid.UUID,
    title: str = Form(..., min_length=2, max_length=200),
    description: str | None = Form(default=None, max_length=5000),
    category_ids: list[int] = Form(default_factory=list),
    product_id: uuid.UUID | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Video:
    business = _get_business_or_404(db, business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your business.")

    if len(category_ids) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A video can have at most 10 categories.",
        )
    categories = _resolve_categories(db, category_ids)
    _resolve_product(db, business.id, product_id)

    content = await read_and_validate_video(file)
    asset = get_video_backend().upload(
        content=content,
        filename=file.filename or "video",
        content_type=file.content_type or "application/octet-stream",
        folder=f"businesses/{business.id}/videos",
    )

    video = Video(
        business_id=business.id,
        categories=categories,
        product_id=product_id,
        title=title,
        description=description,
        video_url=asset.playback_url,
        video_asset_id=asset.asset_id,
        thumbnail_url=asset.thumbnail_url,
        duration_seconds=asset.duration_seconds,
        moderation_status=ModerationStatus.PENDING,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video


@router.get("/videos", response_model=Page[VideoRead], tags=["videos"])
def list_videos(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    business_id: uuid.UUID | None = None,
    category_id: int | None = None,
    product_id: uuid.UUID | None = None,
    include_unapproved: bool = False,
    sort: Literal["recent", "trending"] = "recent",
    page: int = 1,
    page_size: int = 20,
) -> Page[VideoRead]:
    """Public browse. `include_unapproved=true` only takes effect for the
    authenticated owner of `business_id` (or a platform admin) — same
    pattern as GET /products, so a business dashboard can reuse this one
    endpoint for its own pending/rejected videos too.

    `sort` defaults to `"recent"` (created_at desc, unchanged behavior — see
    docs/decisions.md for why the default wasn't touched). `sort=trending`
    orders by `view_count` desc (then created_at desc as a tiebreaker for
    videos with equal views) — this is Home's "trending videos" real signal,
    replacing the "just most-recent" placeholder that
    frontend/src/components/home/TrendingVideos.tsx's own code comment
    already flagged as a stand-in. Raw all-time view_count, not a
    time-decayed score — a defensible MVP choice given Phase 1a's view
    volume; revisit if/when videos accumulate enough views that a months-old
    viral clip permanently crowding out newer ones becomes a real problem."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    stmt = select(Video).join(Business, Video.business_id == Business.id)

    show_all_statuses = False
    if include_unapproved and current_user is not None and business_id is not None:
        business = db.get(Business, business_id)
        if business is not None and _can_manage(business, current_user):
            show_all_statuses = True

    # is_active always applies, even for the owner/admin view — see module
    # docstring; this is the exact bug already fixed on products, not
    # repeating it here.
    stmt = stmt.where(Video.is_active.is_(True), Business.is_active.is_(True))
    if not show_all_statuses:
        stmt = stmt.where(Video.moderation_status == ModerationStatus.APPROVED)

    if business_id is not None:
        stmt = stmt.where(Video.business_id == business_id)
    if category_id is not None:
        stmt = stmt.where(
            Video.id.in_(
                select(video_categories.c.video_id).where(
                    video_categories.c.category_id == category_id
                )
            )
        )
    if product_id is not None:
        stmt = stmt.where(Video.product_id == product_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    if sort == "trending":
        stmt = stmt.order_by(Video.view_count.desc(), Video.created_at.desc())
    else:
        stmt = stmt.order_by(Video.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/videos/{video_id}", response_model=VideoRead, tags=["videos"])
def get_video(video_id: uuid.UUID, db: Session = Depends(get_db)) -> Video:
    return _get_video_or_404(db, video_id)


@router.post("/videos/{video_id}/view", response_model=VideoViewResult, tags=["videos"])
def record_video_view(video_id: uuid.UUID, db: Session = Depends(get_db)) -> VideoViewResult:
    """Increment view_count by 1. A dedicated POST endpoint rather than
    incrementing on every GET /videos/{id} — a GET being side-effect-free
    means prefetching/link-preview bots and the owner's own dashboard
    re-fetching the record don't silently inflate the count. Doesn't need to
    be more sophisticated than this for Phase 1a (no de-duplication by
    viewer/session — that's an analytics-hardening concern, not launch-
    blocking)."""
    video = _get_video_or_404(db, video_id)
    if not video.is_active or video.moderation_status != ModerationStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    video.view_count += 1
    db.commit()
    return VideoViewResult(view_count=video.view_count)


@router.patch("/videos/{video_id}", response_model=VideoRead, tags=["videos"])
def update_video(
    video_id: uuid.UUID,
    payload: VideoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Video:
    video = _get_video_or_404(db, video_id)
    business = _get_business_or_404(db, video.business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your video.")

    update_data = payload.model_dump(exclude_unset=True, exclude={"category_ids"})
    if "product_id" in update_data:
        _resolve_product(db, business.id, update_data["product_id"])

    for field, value in update_data.items():
        setattr(video, field, value)

    if payload.category_ids is not None:
        video.categories = _resolve_categories(db, payload.category_ids)
        update_data["category_ids"] = payload.category_ids

    # Re-review on edit unless it's an admin making the change — same policy
    # as products.py.
    if current_user.role != UserRole.PLATFORM_ADMIN and update_data:
        video.moderation_status = ModerationStatus.PENDING
        video.moderation_note = None

    db.commit()
    db.refresh(video)
    return video


@router.delete(
    "/videos/{video_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    tags=["videos"],
)
def deactivate_video(
    video_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    video = _get_video_or_404(db, video_id)
    business = _get_business_or_404(db, video.business_id)
    if not _can_manage(business, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your video.")
    video.is_active = False
    db.commit()
