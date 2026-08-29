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
scheme directly.
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
    """

    def __init__(self) -> None:
        import boto3

        self._bucket = settings.OBJECT_STORAGE_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.OBJECT_STORAGE_ENDPOINT,
            region_name=settings.OBJECT_STORAGE_REGION,
            aws_access_key_id=settings.OBJECT_STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.OBJECT_STORAGE_SECRET_KEY,
        )

    def upload(self, *, content: bytes, filename: str, content_type: str, folder: str) -> str:
        key = f"{folder}/{self.unique_filename(filename)}"
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            ACL="public-read",
        )
        return f"{settings.OBJECT_STORAGE_ENDPOINT.rstrip('/')}/{self._bucket}/{key}"

    def delete(self, url: str) -> None:
        prefix = f"{settings.OBJECT_STORAGE_ENDPOINT.rstrip('/')}/{self._bucket}/"
        if not url.startswith(prefix):
            return
        key = url[len(prefix) :]
        self._client.delete_object(Bucket=self._bucket, Key=key)


def get_storage_backend() -> StorageBackend:
    if settings.OBJECT_STORAGE_ACCESS_KEY:
        return S3CompatibleStorage()
    return LocalDiskStorage()
