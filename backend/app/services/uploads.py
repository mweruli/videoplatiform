"""Server-side validation for user-uploaded image files.

Open registration + UGC means we never trust the client's declared content
type or the frontend's own gating — every constraint here is re-checked
server-side.
"""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


async def read_and_validate_image(file: UploadFile) -> bytes:
    if file.content_type not in settings.allowed_image_content_types_list:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported image type '{file.content_type}'. "
                f"Allowed: {', '.join(settings.allowed_image_content_types_list)}"
            ),
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds the {settings.MAX_UPLOAD_SIZE_MB}MB limit.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file upload.")
    return content


async def read_and_validate_video(file: UploadFile) -> bytes:
    """Same server-side-only validation philosophy as read_and_validate_image
    — the video upload endpoint is business-owner-gated but still open-
    registration UGC, so content-type/size are never trusted from the client."""
    if file.content_type not in settings.allowed_video_content_types_list:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported video type '{file.content_type}'. "
                f"Allowed: {', '.join(settings.allowed_video_content_types_list)}"
            ),
        )

    max_bytes = settings.MAX_VIDEO_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {settings.MAX_VIDEO_UPLOAD_SIZE_MB}MB limit.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file upload.")
    return content
