"""Managed video API abstraction (upload + playback asset resolution).

Why this exists: no managed video API account (Cloudflare Stream or Bunny
Stream — see docs/SETUP.md) is provisioned yet. Rather than bake "write to
local disk" into the video upload endpoint directly, all calling code
depends only on the `VideoBackend` interface below and asks
`get_video_backend()` for an instance — exactly the same shape as
app/services/storage.py's `StorageBackend` / `get_storage_backend()` and
app/services/otp.py's `OtpSender` / `get_otp_sender()`.

`LocalFileVideoBackend` is the working dev default: it writes the uploaded
video file to the same local-disk media mechanism images already use
(`app/services/storage.py`'s `LocalDiskStorage`, mounted at
`settings.LOCAL_MEDIA_URL_PREFIX`) and returns that plain file URL as the
playback URL — good enough for a basic HTML5 `<video src=...>` tag, no
transcoding/adaptive bitrate/thumbnail generation. That's exactly the work a
real managed video API adds later.

`CloudflareStreamBackend` / `BunnyStreamBackend` are scaffolds — they raise a
clear "not configured" error until an account exists, mirroring
`AfricasTalkingOtpSender`'s scaffold in app/services/otp.py. Swapping to a
real provider later is: provision the account, fill in
`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_STREAM_API_TOKEN` (or the Bunny
equivalents), implement the body of that class's `upload()`/`delete()`, and
set `VIDEO_API_PROVIDER` — no endpoint code changes, since
`app/api/v1/endpoints/videos.py` only ever talks to the `VideoBackend`
interface and the `VideoAsset` it returns.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings


@dataclass
class VideoAsset:
    """What a VideoBackend hands back after a successful upload.

    `asset_id` is backend-specific (a local storage key today; a Cloudflare
    Stream UID or Bunny Stream video GUID once a real provider is wired in)
    and is what `delete()` needs — callers should treat it as opaque.
    `playback_url` is always a directly-fetchable URL suitable for an HTML5
    `<video>` tag's `src` (a plain file URL locally; an HLS manifest or
    provider-hosted iframe/mp4 URL once a real provider exists).
    `thumbnail_url`/`duration_seconds` are best-effort — the local backend
    can't generate either without ffmpeg, so both are `None` there.
    `status` is `"ready"` (playable now) or `"processing"` (provider is
    still transcoding; the local backend is always immediately "ready").
    """

    asset_id: str
    playback_url: str
    thumbnail_url: str | None
    duration_seconds: int | None
    status: str


class VideoBackend(ABC):
    @abstractmethod
    def upload(
        self, *, content: bytes, filename: str, content_type: str, folder: str
    ) -> VideoAsset:
        """Store `content` and return a VideoAsset describing it."""

    @abstractmethod
    def delete(self, asset_id: str) -> None:
        """Best-effort delete of a previously-uploaded video, given its asset_id."""


class LocalFileVideoBackend(VideoBackend):
    """Dev-only fallback: stores the raw video file via the same local-disk
    mechanism images use (see app/services/storage.py's LocalDiskStorage),
    served back out as a plain file URL for basic HTML5 <video> playback.
    No transcoding, no adaptive bitrate, no thumbnail/duration extraction
    (that needs ffmpeg, which isn't a dependency here) — this is a fallback
    for local dev, not a production video pipeline.
    """

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.LOCAL_MEDIA_ROOT)

    def upload(
        self, *, content: bytes, filename: str, content_type: str, folder: str
    ) -> VideoAsset:
        suffix = Path(filename).suffix.lower() or ".mp4"
        key = f"{uuid.uuid4().hex}{suffix}"
        target_dir = self.root / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / key).write_bytes(content)

        base = settings.PUBLIC_BASE_URL.rstrip("/")
        url = f"{base}{settings.LOCAL_MEDIA_URL_PREFIX}/{folder}/{key}"
        asset_id = f"{folder}/{key}"
        return VideoAsset(
            asset_id=asset_id,
            playback_url=url,
            thumbnail_url=None,
            duration_seconds=None,
            status="ready",
        )

    def delete(self, asset_id: str) -> None:
        path = self.root / asset_id
        path.unlink(missing_ok=True)


class CloudflareStreamBackend(VideoBackend):
    """Cloudflare Stream — no account provisioned yet (see docs/SETUP.md).

    Scaffolded so wiring it up later is "fill in CLOUDFLARE_ACCOUNT_ID /
    CLOUDFLARE_STREAM_API_TOKEN and implement these two methods", not a
    redesign of the upload endpoint. Cloudflare Stream's real upload flow is
    typically: POST the file (or a TUS resumable upload) to
    `https://api.cloudflare.com/client/v4/accounts/{account_id}/stream`,
    get back a video `uid`, then poll (or handle a webhook — see
    PROJECT_BRIEF.md's video pipeline scope) for `status.state == "ready"`
    before treating it as playable. `playback_url` would be Cloudflare's
    HLS/dash manifest or the `https://customer-<code>.cloudflarestream.com/
    <uid>/watch` iframe URL; `thumbnail_url` comes free from Cloudflare
    (`.../thumbnails/thumbnail.jpg`).
    """

    def __init__(self) -> None:
        if not settings.CLOUDFLARE_ACCOUNT_ID or not settings.CLOUDFLARE_STREAM_API_TOKEN:
            raise RuntimeError(
                "CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_STREAM_API_TOKEN are not configured — "
                "see docs/SETUP.md. Set VIDEO_API_PROVIDER unset (or to a provider you "
                "have configured) for local dev, which falls back to local-disk storage."
            )

    def upload(
        self, *, content: bytes, filename: str, content_type: str, folder: str
    ) -> VideoAsset:
        # Real implementation goes here once the account exists, e.g.:
        #   resp = httpx.post(
        #       f"https://api.cloudflare.com/client/v4/accounts/"
        #       f"{settings.CLOUDFLARE_ACCOUNT_ID}/stream",
        #       headers={"Authorization": f"Bearer {settings.CLOUDFLARE_STREAM_API_TOKEN}"},
        #       files={"file": (filename, content, content_type)},
        #   )
        #   result = resp.json()["result"]
        #   return VideoAsset(
        #       asset_id=result["uid"],
        #       playback_url=result["playback"]["hls"],
        #       thumbnail_url=result.get("thumbnail"),
        #       duration_seconds=result.get("duration"),
        #       status="ready" if result["status"]["state"] == "ready" else "processing",
        #   )
        raise NotImplementedError(
            "Cloudflare Stream upload is not implemented yet — no account provisioned. "
            "See docs/SETUP.md and app/services/video.py."
        )

    def delete(self, asset_id: str) -> None:
        raise NotImplementedError(
            "Cloudflare Stream delete is not implemented yet — no account provisioned. "
            "See docs/SETUP.md and app/services/video.py."
        )


class BunnyStreamBackend(VideoBackend):
    """Bunny Stream — no account provisioned yet (see docs/SETUP.md).

    Scaffolded the same way as CloudflareStreamBackend. Bunny's real upload
    flow: `POST /library/{library_id}/videos` to create a video object (get
    back a `guid`), then `PUT /library/{library_id}/videos/{guid}` with the
    raw file bytes, authenticated via the `AccessKey` header
    (`BUNNY_STREAM_API_KEY`). `playback_url` would be Bunny's HLS playlist
    or direct-play iframe URL; thumbnails are auto-generated by Bunny too.
    """

    def __init__(self) -> None:
        if not settings.BUNNY_STREAM_LIBRARY_ID or not settings.BUNNY_STREAM_API_KEY:
            raise RuntimeError(
                "BUNNY_STREAM_LIBRARY_ID/BUNNY_STREAM_API_KEY are not configured — "
                "see docs/SETUP.md. Set VIDEO_API_PROVIDER unset (or to a provider you "
                "have configured) for local dev, which falls back to local-disk storage."
            )

    def upload(
        self, *, content: bytes, filename: str, content_type: str, folder: str
    ) -> VideoAsset:
        raise NotImplementedError(
            "Bunny Stream upload is not implemented yet — no account provisioned. "
            "See docs/SETUP.md and app/services/video.py."
        )

    def delete(self, asset_id: str) -> None:
        raise NotImplementedError(
            "Bunny Stream delete is not implemented yet — no account provisioned. "
            "See docs/SETUP.md and app/services/video.py."
        )


def get_video_backend() -> VideoBackend:
    """Picks a backend by `settings.VIDEO_API_PROVIDER`, but only actually
    uses it once its credentials are configured — otherwise falls back to
    the local-disk dev default, same "degrade gracefully, never 500 a dev
    setup for a missing third-party account" pattern as get_otp_sender()."""
    provider = settings.VIDEO_API_PROVIDER.lower()
    cloudflare_configured = settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_STREAM_API_TOKEN
    bunny_configured = settings.BUNNY_STREAM_LIBRARY_ID and settings.BUNNY_STREAM_API_KEY
    if provider == "cloudflare_stream" and cloudflare_configured:
        return CloudflareStreamBackend()
    if provider == "bunny_stream" and bunny_configured:
        return BunnyStreamBackend()
    return LocalFileVideoBackend()
