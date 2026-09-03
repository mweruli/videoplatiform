"""Managed video API abstraction (upload + playback asset resolution).

Why this exists: no managed video API account (Cloudflare Stream or Bunny
Stream — see docs/SETUP.md) is provisioned yet. Rather than bake a specific
storage mechanism into the video upload endpoint directly, all calling code
depends only on the `VideoBackend` interface below and asks
`get_video_backend()` for an instance — exactly the same shape as
app/services/storage.py's `StorageBackend` / `get_storage_backend()` and
app/services/otp.py's `OtpSender` / `get_otp_sender()`.

`ObjectStorageVideoBackend` is the working default until a real managed
video API is configured: it delegates the actual byte storage to
`app/services/storage.py`'s `get_storage_backend()` — the exact same object
storage layer (R2/Spaces once configured, local disk otherwise) that image
uploads already use — and wraps the URL it gets back into a `VideoAsset`.
Good enough for a basic HTML5 `<video src=...>` tag, no transcoding/adaptive
bitrate/thumbnail generation. That's exactly the work a real managed video
API adds later. Critically, this means video uploads get the same
persistence guarantees as images: once `OBJECT_STORAGE_ACCESS_KEY` is set,
videos land in R2/Spaces instead of the container's ephemeral local disk
(local disk doesn't survive a container restart — this already caused a
real incident where an uploaded video and a business logo both vanished
after a Render free-tier restart).

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

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings
from app.services.storage import get_storage_backend


@dataclass
class VideoAsset:
    """What a VideoBackend hands back after a successful upload.

    `asset_id` is backend-specific (the object storage URL today — see
    ObjectStorageVideoBackend; a Cloudflare Stream UID or Bunny Stream video
    GUID once a real provider is wired in) and is what `delete()` needs —
    callers should treat it as opaque. `playback_url` is always a
    directly-fetchable URL suitable for an HTML5 `<video>` tag's `src` (a
    plain file/object storage URL today; an HLS manifest or provider-hosted
    iframe/mp4 URL once a real provider exists). `thumbnail_url`/
    `duration_seconds` are best-effort — ObjectStorageVideoBackend can't
    generate either without ffmpeg, so both are `None` there. `status` is
    `"ready"` (playable now) or `"processing"` (provider is still
    transcoding; ObjectStorageVideoBackend is always immediately "ready").
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


class ObjectStorageVideoBackend(VideoBackend):
    """Default until a real managed video API is configured: stores the raw
    video file via the same object storage layer images use (see
    app/services/storage.py's get_storage_backend() — R2/Spaces once
    configured, local disk otherwise), served back out as a plain file URL
    for basic HTML5 <video> playback. No transcoding, no adaptive bitrate,
    no thumbnail/duration extraction (that needs ffmpeg, which isn't a
    dependency here) — this is a stand-in for a real managed video API, not
    a production video pipeline. `asset_id` here is simply the storage URL
    (opaque to callers), since StorageBackend.delete() takes a URL.
    """

    def __init__(self) -> None:
        self._storage = get_storage_backend()

    def upload(
        self, *, content: bytes, filename: str, content_type: str, folder: str
    ) -> VideoAsset:
        url = self._storage.upload(
            content=content, filename=filename, content_type=content_type, folder=folder
        )
        return VideoAsset(
            asset_id=url,
            playback_url=url,
            thumbnail_url=None,
            duration_seconds=None,
            status="ready",
        )

    def delete(self, asset_id: str) -> None:
        self._storage.delete(asset_id)


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
    the object-storage-backed default, same "degrade gracefully, never 500 a
    dev setup for a missing third-party account" pattern as
    get_otp_sender()."""
    provider = settings.VIDEO_API_PROVIDER.lower()
    cloudflare_configured = settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_STREAM_API_TOKEN
    bunny_configured = settings.BUNNY_STREAM_LIBRARY_ID and settings.BUNNY_STREAM_API_KEY
    if provider == "cloudflare_stream" and cloudflare_configured:
        return CloudflareStreamBackend()
    if provider == "bunny_stream" and bunny_configured:
        return BunnyStreamBackend()
    return ObjectStorageVideoBackend()
