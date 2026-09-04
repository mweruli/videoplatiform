"""Shared response envelope for paginated list endpoints, plus the shared
impression-batch request/response shape used by both
app/api/v1/endpoints/businesses.py and app/api/v1/endpoints/products.py.

Every list endpoint in the API returns the `Page` shape so the frontend
writes one pagination component, not one per resource.
"""

import uuid
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class ImpressionBatchRequest(BaseModel):
    """Body for `POST /businesses/impressions` / `POST /products/impressions`
    — the frontend calls this once per search-results render with the ids
    currently visible on screen (see docs/decisions.md for why this is the
    chosen "search appearances" signal). Capped at 100 ids per call — a
    single render showing more than that on one page is not a realistic
    case at this platform's scale, and the cap keeps a malformed/malicious
    client from turning this into an unbounded write."""

    ids: list[uuid.UUID] = Field(min_length=1, max_length=100)


class ImpressionBatchResult(BaseModel):
    """`updated` is how many of the submitted ids actually matched a
    currently-public (active + approved/verified) row and got incremented —
    ids that don't exist, are inactive, or aren't public are silently
    skipped rather than erroring the whole batch (see the endpoint
    docstrings)."""

    updated: int
