"""Shared response envelope for paginated list endpoints.

Every list endpoint in the API returns this exact shape so the frontend
writes one pagination component, not one per resource.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
