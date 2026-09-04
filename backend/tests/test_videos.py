"""End-to-end tests for the video upload/moderation/browse endpoints —
mirrors tests/test_businesses_products.py's coverage shape for the video
equivalent (ownership CRUD, moderation state machine, admin queue,
is_active-always-enforced regression, view counting).

Runs against the isolated test database (see tests/conftest.py), via
TestClient + the app's normal DB session.
"""

from __future__ import annotations

import io
import uuid

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.category import Category

client = TestClient(app)

# A tiny (46-byte) but syntactically valid MP4 header (ftyp box only) — good
# enough to exercise upload/validation/storage plumbing without needing a
# real playable video fixture in the test suite itself (the seed_demo.py
# assets under app/db/seed_assets are for live-stack/demo verification, not
# unit/integration tests).
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
        "name": _unique("Video Test Biz"),
        "description": "A business for video tests.",
        "county": "Nairobi",
        "city": "Nairobi",
        "phone": "+254711224560",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/businesses", json=payload, headers=_auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _video_file():
    return {"file": ("clip.mp4", io.BytesIO(_TINY_MP4_BYTES), "video/mp4")}


def _upload_video(
    token: str, business_id: str, category_ids: list[int] | None = None, **form_overrides
) -> dict:
    form = {"title": _unique("Demo Video")}
    form.update(form_overrides)
    # httpx repeats a form field for each item of a list value, which is how
    # FastAPI's `list[int] = Form(...)` parses multiple category_ids.
    data: dict = dict(form)
    if category_ids is not None:
        data["category_ids"] = [str(c) for c in category_ids]
    resp = client.post(
        f"/api/v1/businesses/{business_id}/videos",
        data=data,
        files=_video_file(),
        headers=_auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_video_upload_requires_auth() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/videos",
        data={"title": "No Auth Video"},
        files=_video_file(),
    )
    assert resp.status_code == 401


def test_video_upload_rejects_wrong_content_type() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/videos",
        data={"title": "Bad Type"},
        files={"file": ("clip.txt", io.BytesIO(b"not a video"), "text/plain")},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 415


def test_video_upload_rejects_other_owners_business() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    other_token, _ = _dev_token()
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/videos",
        data={"title": "Hijack Attempt"},
        files=_video_file(),
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403


def test_video_lifecycle_and_moderation() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)

    video = _upload_video(owner_token, business["id"], description="A test clip.")
    assert video["moderation_status"] == "pending"
    assert video["business"]["id"] == business["id"]
    assert video["video_url"].startswith("http")
    assert video["view_count"] == 0

    # Not visible in public listing yet (pending).
    resp = client.get("/api/v1/videos", params={"business_id": business["id"]})
    assert resp.json()["total"] == 0

    # Owner can see it via include_unapproved.
    resp = client.get(
        "/api/v1/videos",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 1

    # A stranger cannot use include_unapproved to see it.
    other_token, _ = _dev_token()
    resp = client.get(
        "/api/v1/videos",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(other_token),
    )
    assert resp.json()["total"] == 0

    # Approve it.
    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/videos/{video['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "approved"

    # Now public.
    resp = client.get("/api/v1/videos", params={"business_id": business["id"]})
    assert resp.json()["total"] == 1

    # Recording a view increments the counter.
    resp = client.post(f"/api/v1/videos/{video['id']}/view")
    assert resp.status_code == 200
    assert resp.json()["view_count"] == 1
    resp = client.post(f"/api/v1/videos/{video['id']}/view")
    assert resp.json()["view_count"] == 2

    resp = client.get(f"/api/v1/videos/{video['id']}")
    assert resp.json()["view_count"] == 2

    # Owner editing resets moderation to pending (same policy as products).
    resp = client.patch(
        f"/api/v1/videos/{video['id']}",
        json={"description": "Updated copy."},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "pending"

    resp = client.get("/api/v1/videos", params={"business_id": business["id"]})
    assert resp.json()["total"] == 0


def test_video_reject_and_permissions() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    video = _upload_video(owner_token, business["id"])

    other_token, _ = _dev_token()
    resp = client.patch(
        f"/api/v1/videos/{video['id']}",
        json={"title": "Hijacked"},
        headers=_auth_headers(other_token),
    )
    assert resp.status_code == 403

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/videos/{video['id']}/reject",
        json={"reason": "Low quality footage."},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["moderation_status"] == "rejected"

    # Can't approve/reject again from a non-pending state.
    resp = client.post(
        f"/api/v1/admin/videos/{video['id']}/reject",
        json={"reason": "Again"},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 409


def test_removed_video_stays_gone_from_owner_view() -> None:
    """Regression guard matching
    test_removed_product_stays_gone_from_owner_view: is_active must always be
    enforced regardless of include_unapproved."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    video = _upload_video(owner_token, business["id"])

    resp = client.get(
        "/api/v1/videos",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 1

    resp = client.delete(f"/api/v1/videos/{video['id']}", headers=_auth_headers(owner_token))
    assert resp.status_code == 204

    resp = client.get(
        "/api/v1/videos",
        params={"business_id": business["id"], "include_unapproved": True},
        headers=_auth_headers(owner_token),
    )
    assert resp.json()["total"] == 0


def test_view_count_not_incremented_for_pending_video() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    video = _upload_video(owner_token, business["id"])

    resp = client.post(f"/api/v1/videos/{video['id']}/view")
    assert resp.status_code == 404


def test_video_can_be_associated_with_a_product() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    resp = client.post(
        f"/api/v1/businesses/{business['id']}/products",
        json={"name": _unique("Widget")},
        headers=_auth_headers(owner_token),
    )
    product = resp.json()

    video = _upload_video(owner_token, business["id"], product_id=product["id"])
    assert video["product_id"] == product["id"]
    assert video["product"]["id"] == product["id"]

    # A product from a different business is rejected.
    other_owner_token, _ = _dev_token()
    other_business = _create_business(other_owner_token)
    resp = client.post(
        f"/api/v1/businesses/{other_business['id']}/products",
        json={"name": _unique("Other Widget")},
        headers=_auth_headers(other_owner_token),
    )
    other_product = resp.json()

    resp = client.post(
        f"/api/v1/businesses/{business['id']}/videos",
        data={"title": _unique("Cross-business"), "product_id": other_product["id"]},
        files=_video_file(),
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400


def _two_category_ids() -> tuple[int, int]:
    """Get-or-create two fixed categories directly — same helper/reasoning as
    tests/test_businesses_products.py's `_two_category_ids`."""
    db = SessionLocal()
    try:
        ids = []
        for slug, name in (("test-cat-a", "Test Category A"), ("test-cat-b", "Test Category B")):
            category = db.query(Category).filter(Category.slug == slug).one_or_none()
            if category is None:
                category = Category(name=name, slug=slug)
                db.add(category)
                db.flush()
            ids.append(category.id)
        db.commit()
        return ids[0], ids[1]
    finally:
        db.close()


def test_video_can_have_multiple_categories() -> None:
    """A video must be able to carry 2+ categories (many-to-many), and be
    returned when filtering by *either* one — mirrors
    test_product_can_have_multiple_categories in
    tests/test_businesses_products.py."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    cat_a, cat_b = _two_category_ids()

    video = _upload_video(owner_token, business["id"], category_ids=[cat_a, cat_b])
    returned_ids = {c["id"] for c in video["categories"]}
    assert returned_ids == {cat_a, cat_b}

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.post(
        f"/api/v1/admin/videos/{video['id']}/approve",
        json={},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200

    for cat_id in (cat_a, cat_b):
        resp = client.get(
            "/api/v1/videos",
            params={"business_id": business["id"], "category_id": cat_id},
        )
        assert resp.json()["total"] == 1, f"expected video under category {cat_id}"

    # Updating category_ids replaces the set (PATCH semantics).
    resp = client.patch(
        f"/api/v1/videos/{video['id']}",
        json={"category_ids": [cat_a]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 200
    assert {c["id"] for c in resp.json()["categories"]} == {cat_a}

    # Rejects unknown category ids.
    resp = client.patch(
        f"/api/v1/videos/{video['id']}",
        json={"category_ids": [999999]},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 400


def test_trending_sort_orders_by_view_count_not_recency() -> None:
    """`sort=trending` (Home's real "trending videos" signal — see
    docs/decisions.md) must actually reorder results, not just be accepted
    as a no-op param — proven here by making the view-count leader the
    *earlier*-uploaded video, so recency and view-count disagree on the
    winner."""
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    admin_token, _ = _dev_token(role="platform_admin")

    video_early = _upload_video(owner_token, business["id"])
    video_late = _upload_video(owner_token, business["id"])

    for video in (video_early, video_late):
        resp = client.post(
            f"/api/v1/admin/videos/{video['id']}/approve",
            json={},
            headers=_auth_headers(admin_token),
        )
        assert resp.status_code == 200

    for _ in range(5):
        client.post(f"/api/v1/videos/{video_early['id']}/view")

    # Default sort is unchanged: most-recently-uploaded first, regardless of
    # views — video_late wins.
    resp = client.get("/api/v1/videos", params={"business_id": business["id"]})
    ids = [v["id"] for v in resp.json()["items"]]
    assert ids.index(video_late["id"]) < ids.index(video_early["id"])

    # sort=trending: most-viewed first — video_early (5 views) now wins.
    resp = client.get(
        "/api/v1/videos", params={"business_id": business["id"], "sort": "trending"}
    )
    ids = [v["id"] for v in resp.json()["items"]]
    assert ids.index(video_early["id"]) < ids.index(video_late["id"])


def test_admin_video_queue_filters_by_status() -> None:
    owner_token, _ = _dev_token()
    business = _create_business(owner_token)
    _upload_video(owner_token, business["id"])

    admin_token, _ = _dev_token(role="platform_admin")
    resp = client.get(
        "/api/v1/admin/videos",
        params={"status": "pending", "business_id": business["id"]},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    # Non-admin/moderator is forbidden from the queue at all.
    resp = client.get(
        "/api/v1/admin/videos",
        params={"status": "pending"},
        headers=_auth_headers(owner_token),
    )
    assert resp.status_code == 403
