"""Public read-only category listing.

Businesses/products link to a Category id; the frontend needs a simple list
to populate category pickers and browse-by-category screens. Full category
CRUD (admin-editable, per DEVELOPMENT_PLAN.md's "Category framework") is not
in this sprint's scope — this is just the read side Sprint 2 needs now.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.category import Category
from app.schemas.category import CategoryRead

router = APIRouter()


@router.get("/categories", response_model=list[CategoryRead], tags=["categories"])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    stmt = select(Category).where(Category.is_active.is_(True)).order_by(Category.name)
    return list(db.scalars(stmt).all())
