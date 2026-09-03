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
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.business import Business, VerificationStatus
from app.models.user import User, UserRole
from app.schemas.business import BusinessCreate, BusinessRead, BusinessUpdate
from app.schemas.common import Page
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
    return _get_business_or_404(db, business_id)


@router.get(
    "/businesses/slug/{slug}", response_model=BusinessRead, tags=["businesses"]
)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)) -> Business:
    business = db.scalar(select(Business).where(Business.slug == slug))
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found.")
    return business


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
