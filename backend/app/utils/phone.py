"""Phone number normalisation for auth (registration/login/OTP).

Users authenticate by phone or email; phone is used as a lookup key (unique
index on `users.phone`), so "+254 711 224560", "+254-711-224560" and
"+254711224560" must all resolve to the same stored value or the same
person could accidentally register/login-fail as "different" users depending
on formatting. This does not attempt full E.164/libphonenumber validation
(out of scope for Sprint 2) — just strips separators and checks a loose
shape, consistent with app/schemas/business.py's existing phone regex for
business contact numbers (which is display-only and intentionally left
as-is here; this module is specifically for identity-bearing auth phones).
"""

from __future__ import annotations

import re

_ALLOWED_CHARS_RE = re.compile(r"^\+?[0-9 \-()]{7,20}$")
_STRIP_RE = re.compile(r"[ \-()]")


def normalize_phone(value: str) -> str:
    """Strip spaces/dashes/parens, keep a leading '+' if present."""
    return _STRIP_RE.sub("", value.strip())


def is_valid_phone(value: str) -> bool:
    return bool(_ALLOWED_CHARS_RE.match(value))
