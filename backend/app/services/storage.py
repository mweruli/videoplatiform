"""Object storage abstraction for uploaded images (logos, covers, product photos).

Why this exists: the managed object storage account (Cloudflare R2 or DO
Spaces — see docs/SETUP.md) doesn't exist yet. Rather than hardcode local-
disk assumptions into every upload endpoint, all calling code depends only
on the `StorageBackend` interface below and asks `get_storage_backend()` for
an instance. Swapping local-disk for the real R2/Spaces account later is a
matter of setting `OBJECT_STORAGE_ACCESS_KEY` etc. in the environment — no
endpoint code changes.

Both backends store objects under a `folder/filename` key and return a
publicly-fetchable URL for the stored object; callers never see the key
scheme directly. For S3CompatibleStorage specifically, that "publicly-
fetchable URL" is NOT always the same as the upload endpoint — see its
docstring for why (`OBJECT_STORAGE_PUBLIC_URL` vs `OBJECT_STORAGE_ENDPOINT`).
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    def upload(self, *, content: bytes, filename: str, content_type: str, folder: str) -> str:
        """Store `content` and return a public URL for it."""

    @abstractmethod
    def delete(self, url: str) -> None:
        """Best-effort delete of a previously-uploaded object, given its URL."""

    @staticmethod
    def unique_filename(original_filename: str) -> str:
        suffix = Path(original_filename).suffix.lower() or ""
        return f"{uuid.uuid4().hex}{suffix}"


class LocalDiskStorage(StorageBackend):
    """Dev-only fallback: writes under backend/<LOCAL_MEDIA_ROOT>/<folder>/.

    Served back out via a StaticFiles mount at LOCAL_MEDIA_URL_PREFIX (see
    app/main.py). Never intended for production use — object storage cost/
    durability/CDN characteristics are exactly why the real integration is
    R2/Spaces, not "keep using local disk."
    """

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.LOCAL_MEDIA_ROOT)

    def upload(self, *, content: bytes, filename: str, content_type: str, folder: str) -> str:
        key = self.unique_filename(filename)
        target_dir = self.root / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / key).write_bytes(content)
        base = settings.PUBLIC_BASE_URL.rstrip("/")
        return f"{base}{settings.LOCAL_MEDIA_URL_PREFIX}/{folder}/{key}"

    def delete(self, url: str) -> None:
        prefix = f"{settings.PUBLIC_BASE_URL.rstrip('/')}{settings.LOCAL_MEDIA_URL_PREFIX}/"
        if not url.startswith(prefix):
            return
        relative = url[len(prefix) :]
        path = self.root / relative
        path.unlink(missing_ok=True)


class S3CompatibleStorage(StorageBackend):
    """Cloudflare R2 / DigitalOcean Spaces — both speak the S3 API.

    Selected automatically once OBJECT_STORAGE_ACCESS_KEY is set in the
    environment; see get_storage_backend() below. boto3 is imported lazily so
    it's not a hard runtime dependency for dev setups that never touch this
    path (it's still listed in requirements.txt so it's available when
    needed).

    Two provider differences this class has to paper over:

    1. Public URL != upload endpoint (R2 only). `OBJECT_STORAGE_ENDPOINT`
       (`https://<account>.r2.cloudflarestorage.com`) is R2's S3 *API*
       endpoint — it requires signed requests for every operation including
       reads, so it is never a browser-fetchable URL. R2's actual
       public-serving URL is a separate `pub-<hash>.r2.dev` domain (or a
       connected custom domain) that has to be explicitly enabled per-bucket.
       So: build served URLs from `OBJECT_STORAGE_PUBLIC_URL` when it's set,
       falling back to `OBJECT_STORAGE_ENDPOINT` otherwise — which keeps DO
       Spaces working unchanged, since a Spaces endpoint typically *is*
       directly public.

    2. Per-object ACLs (R2 only). R2's S3-compatibility layer does not
       support object-level ACLs at all — `PutObject` with an `x-amz-acl`
       header returns a hard `501 NotImplemented` ("Header 'x-amz-acl' with
       value 'public-read' not implemented"), confirmed against Cloudflare's
       own docs/community reports, not guessed. Public read access on R2 is
       a bucket-level Cloudflare setting instead (see docs/SETUP.md item 3).
       DO Spaces, by contrast, documents `x-amz-acl: public-read` as
       supported and it's how Spaces objects are made public via the S3 API.
       So: only pass `ACL="public-read"` when the endpoint isn't R2's.
    """

    _R2_ENDPOINT_MARKER = "r2.cloudflarestorage.com"

    def __init__(self) -> None:
        import boto3

        self._bucket = settings.OBJECT_STORAGE_BUCKET
        self._endpoint = settings.OBJECT_STORAGE_ENDPOINT
        self._is_r2 = self._R2_ENDPOINT_MARKER in self._endpoint.lower()
        self._client = boto3.client(
            "s3",
            endpoint_url=self._endpoint,
            region_name=settings.OBJECT_STORAGE_REGION,
            aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        )

    def upload(self, *, content: bytes, filename: str, content_type: str, folder: str) -> str:
        key = f"{folder}/{self.unique_filename(filename)}"
        put_kwargs: dict = dict(
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        if not self._is_r2:
            # R2 rejects this with 501 NotImplemented — see class docstring.
            put_kwargs["ACL"] = "public-read"
        self._client.put_object(**put_kwargs)
        return self._public_url(key)

    def delete(self, url: str) -> None:
        key = self._key_from_url(url)
        if key is None:
            return
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def _public_url(self, key: str) -> str:
        if settings.OBJECT_STORAGE_PUBLIC_URL:
            # R2's pub-*.r2.dev / custom-domain URLs are already scoped to a
            # single bucket, so no bucket segment belongs in the path.
            return f"{settings.OBJECT_STORAGE_PUBLIC_URL.rstrip('/')}/{key}"
        return f"{self._endpoint.rstrip('/')}/{self._bucket}/{key}"

    def _key_from_url(self, url: str) -> str | None:
        if settings.OBJECT_STORAGE_PUBLIC_URL:
            prefix = f"{settings.OBJECT_STORAGE_PUBLIC_URL.rstrip('/')}/"
            if url.startswith(prefix):
                return url[len(prefix) :]
        # Falls back to the endpoint+bucket form too, so URLs stored before
        # OBJECT_STORAGE_PUBLIC_URL was configured can still be deleted.
        prefix = f"{self._endpoint.rstrip('/')}/{self._bucket}/"
        if url.startswith(prefix):
            return url[len(prefix) :]
        return None


def get_storage_backend() -> StorageBackend:
    if settings.OBJECT_STORAGE_ACCESS_KEY:
        return S3CompatibleStorage()
    return LocalDiskStorage()
