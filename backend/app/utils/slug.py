"""Shared slug generation for Business/Product names.

Slugs are used as friendly, SEO-able public identifiers (the design
prototype's URLs/keys are all short ids like `aquatank`, `tank5000`) — routes
still accept a UUID id too, but the slug is what a public detail page link
would use.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    slug = _SLUG_RE.sub("-", text.lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


def unique_slug(text: str, exists: Callable[[str], bool]) -> str:
    """Append a short random suffix until `exists(candidate)` is False."""
    base = slugify(text)
    candidate = base
    while exists(candidate):
        candidate = f"{base}-{uuid.uuid4().hex[:6]}"
    return candidate
