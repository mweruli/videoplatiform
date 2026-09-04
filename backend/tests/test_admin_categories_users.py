"""Admin-only category CRUD (deactivate-only) and user management endpoints
— the two remaining Phase 1a admin-dashboard gaps (see docs/decisions.md).

Same TestClient + real-DB pattern as test_businesses_products.py.
"""

from __future__ import annotations

import io
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Same tiny-but-valid MP4 fixture as tests/test_videos.py — just enough to
# exercise upload plumbing, not a real playable clip.
_TINY_MP4_BYTES = (
    b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
    b"\x00\x00\x00\x08free"
)


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _dev_token(role: str = "general_user") -> tuple[str, dict]:
    email = f"{_unique('user')}@example.com"
    resp = client.post(
        "/api/v1/dev/token",
        json={"email": email, "full_name": "Test User", "role": role},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return body["access_token"], body["user"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_business(token: str, **overrides) -> dict:
    payload = {
        "name": _unique("Admin Test Biz"),
        "description": "Test business for admin endpoint coverage.",
        "county": "Nairobi",
        "city": "Nairobi",
        "phone": "+254711224560",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/businesses", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- Categories -------------------------------------------------------------


def test_non_admin_cannot_create_or_update_category() -> None:
    token, _ = _dev_token()
    resp = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Sneaky Cat")},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    created = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Real Cat")},
        headers=_auth_headers(admin_token),
    ).json()
    resp = client.patch(
        f"/api/v1/admin/categories/{created['id']}",
        json={"is_active": False},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403


def test_admin_can_create_category_with_auto_slug() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    name = _unique("Marine Equipment")
    resp = client.post(
        "/api/v1/admin/categories", json={"name": name}, headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == name
    assert body["slug"]  # auto-generated, non-empty
    assert body["is_active"] is True

    # Duplicate name is rejected.
    dup = client.post(
        "/api/v1/admin/categories", json={"name": name}, headers=_auth_headers(admin_token)
    )
    assert dup.status_code == 409


def test_admin_can_rename_category() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    created = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Old Name")},
        headers=_auth_headers(admin_token),
    ).json()

    new_name = _unique("New Name")
    resp = client.patch(
        f"/api/v1/admin/categories/{created['id']}",
        json={"name": new_name},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == new_name
    # Renaming does not change the slug (see docs/decisions.md).
    assert body["slug"] == created["slug"]


def test_deactivating_category_hides_it_from_public_list_but_not_admin_list() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    created = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Temporary Category")},
        headers=_auth_headers(admin_token),
    ).json()
    category_id = created["id"]

    # Visible publicly while active.
    public_ids = {c["id"] for c in client.get("/api/v1/categories").json()}
    assert category_id in public_ids

    # Deactivate.
    resp = client.patch(
        f"/api/v1/admin/categories/{category_id}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Hidden from the public list now.
    public_ids = {c["id"] for c in client.get("/api/v1/categories").json()}
    assert category_id not in public_ids

    # Still visible (and manageable) via the admin list.
    admin_resp = client.get("/api/v1/admin/categories", headers=_auth_headers(admin_token))
    assert admin_resp.status_code == 200
    admin_ids = {c["id"] for c in admin_resp.json()}
    assert category_id in admin_ids

    # Reactivate.
    resp = client.patch(
        f"/api/v1/admin/categories/{category_id}",
        json={"is_active": True},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
    public_ids = {c["id"] for c in client.get("/api/v1/categories").json()}
    assert category_id in public_ids


def test_content_moderator_can_manage_categories_too() -> None:
    moderator_token, _ = _dev_token(role="content_moderator")
    resp = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Moderator Cat")},
        headers=_auth_headers(moderator_token),
    )
    assert resp.status_code == 201


def _row_for(category_id: int, admin_token: str) -> dict:
    resp = client.get("/api/v1/admin/categories", headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    return next(c for c in resp.json() if c["id"] == category_id)


def test_admin_category_list_reports_active_usage_counts() -> None:
    """GET /admin/categories reports how many currently-active
    businesses/products/videos reference each category (see
    docs/decisions.md) — a real aggregate, not the fixture-only
    approximation the design prototype originally flagged. Soft-deleted
    rows (is_active=False) must not inflate the count, matching
    Business.product_count's existing "active only" convention."""
    admin_token, _ = _dev_token(role="platform_admin")
    category = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique("Usage Count Category")},
        headers=_auth_headers(admin_token),
    ).json()
    category_id = category["id"]

    row = _row_for(category_id, admin_token)
    assert row["business_count"] == 0
    assert row["product_count"] == 0
    assert row["video_count"] == 0

    # Business references the category via its direct category_id FK.
    owner_token, _ = _dev_token()
    business = _create_business(owner_token, category_id=category_id)

    # Product references it via the product_categories join table.
    product = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Counted Product"), "category_ids": [category_id]},
        headers=_auth_headers(owner_token),
    ).json()

    # A second product that gets soft-deleted afterward -- must NOT count.
    doomed_product = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Soft Deleted Product"), "category_ids": [category_id]},
        headers=_auth_headers(owner_token),
    ).json()
    resp = client.delete(
        f"/api/v1/products/{doomed_product['id']}", headers=_auth_headers(owner_token)
    )
    assert resp.status_code == 204

    # Video references it via the video_categories join table.
    video = client.post(
        f"/api/v1/businesses/{business['id']}/videos",
        data={"title": _unique("Counted Video"), "category_ids": [str(category_id)]},
        files={"file": ("clip.mp4", io.BytesIO(_TINY_MP4_BYTES), "video/mp4")},
        headers=_auth_headers(owner_token),
    ).json()

    row = _row_for(category_id, admin_token)
    assert row["business_count"] == 1
    assert row["product_count"] == 1  # not 2 -- the soft-deleted one is excluded
    assert row["video_count"] == 1

    # Cleanup verifies the count follows the live rows back down too.
    client.delete(f"/api/v1/products/{product['id']}", headers=_auth_headers(owner_token))
    client.delete(f"/api/v1/videos/{video['id']}", headers=_auth_headers(owner_token))
    row = _row_for(category_id, admin_token)
    assert row["product_count"] == 0
    assert row["video_count"] == 0


# --- Users -------------------------------------------------------------


def test_non_admin_cannot_list_or_view_or_update_users() -> None:
    token, user = _dev_token()
    resp = client.get("/api/v1/admin/users", headers=_auth_headers(token))
    assert resp.status_code == 403

    resp = client.get(f"/api/v1/admin/users/{user['id']}", headers=_auth_headers(token))
    assert resp.status_code == 403

    resp = client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_active": False},
        headers=_auth_headers(token),
    )
    assert resp.status_code == 403


def test_admin_can_list_users_filter_by_role_and_search() -> None:
    admin_token, admin_user = _dev_token(role="platform_admin")
    suffix = uuid.uuid4().hex[:10]
    full_name = f"Findable Person {suffix}"
    resp = client.post(
        "/api/v1/dev/token",
        json={"email": f"findable-person-{suffix}@example.com", "full_name": full_name},
    )
    assert resp.status_code == 200, resp.text
    target_user = resp.json()["user"]

    resp = client.get(
        "/api/v1/admin/users", params={"q": full_name}, headers=_auth_headers(admin_token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == target_user["id"]
    # Never leaks sensitive fields.
    assert "hashed_password" not in body["items"][0]

    resp = client.get(
        "/api/v1/admin/users",
        params={"role": "platform_admin"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    ids = {u["id"] for u in resp.json()["items"]}
    assert admin_user["id"] in ids


def test_admin_can_view_user_detail_with_businesses() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, owner_user = _dev_token()
    business = _create_business(owner_token)

    resp = client.get(f"/api/v1/admin/users/{owner_user['id']}", headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == owner_user["id"]
    assert "hashed_password" not in body
    business_ids = {b["id"] for b in body["businesses"]}
    assert business["id"] in business_ids


def test_admin_can_deactivate_and_reactivate_a_user() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    token, user = _dev_token()

    resp = client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Deactivated user can no longer authenticate.
    resp = client.get("/api/v1/auth/me", headers=_auth_headers(token))
    assert resp.status_code == 401

    # Reactivate.
    resp = client.patch(
        f"/api/v1/admin/users/{user['id']}",
        json={"is_active": True},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
    resp = client.get("/api/v1/auth/me", headers=_auth_headers(token))
    assert resp.status_code == 200


def test_admin_cannot_deactivate_own_account() -> None:
    admin_token, admin_user = _dev_token(role="platform_admin")
    resp = client.patch(
        f"/api/v1/admin/users/{admin_user['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 403


def test_admin_cannot_deactivate_another_platform_admin() -> None:
    admin_token, _ = _dev_token(role="platform_admin")
    other_admin_token, other_admin_user = _dev_token(role="platform_admin")
    resp = client.patch(
        f"/api/v1/admin/users/{other_admin_user['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 403


def test_deactivating_a_user_does_not_deactivate_their_business() -> None:
    """Deliberate: deactivating a user account does NOT cascade to the
    businesses they own — see docs/decisions.md."""
    admin_token, _ = _dev_token(role="platform_admin")
    owner_token, owner_user = _dev_token()
    business = _create_business(owner_token)

    resp = client.patch(
        f"/api/v1/admin/users/{owner_user['id']}",
        json={"is_active": False},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    resp = client.get(f"/api/v1/businesses/{business['id']}")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
