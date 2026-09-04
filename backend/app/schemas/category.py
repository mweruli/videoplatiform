from pydantic import BaseModel, ConfigDict, Field


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    is_active: bool


class CategoryCreate(BaseModel):
    """Admin-only. Slug is auto-generated from `name` (see
    app/utils/slug.py's `unique_slug`) — never taken as input, same
    philosophy as Business/Product slugs."""

    name: str = Field(min_length=2, max_length=100)


class CategoryUpdate(BaseModel):
    """Admin-only, PATCH semantics — all fields optional.

    Renaming does NOT regenerate the slug: the slug is a stable public
    identifier (used in URLs/filters), and silently changing it out from
    under existing links/bookmarks on a simple rename would be a worse
    surprise than a category whose slug no longer matches its current name.
    """

    name: str | None = Field(default=None, min_length=2, max_length=100)
    is_active: bool | None = None
