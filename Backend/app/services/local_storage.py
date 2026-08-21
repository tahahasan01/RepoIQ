"""
Avatar storage, replacing Supabase Storage.

One call site (avatar upload) used Supabase's object store. With Supabase gone,
files go to a local directory served as static content.

SCOPE: this is correct for a single instance and for development. Running more
than one API instance means each holds its own disk, so an avatar uploaded to
one is a 404 on the others. Point AVATAR_BASE_URL at a CDN and swap the two
functions here for S3/R2 before scaling out - the interface is deliberately
narrow so that is a contained change.
"""
import re
import uuid
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Only formats a browser will render as an image. Rendering an uploaded SVG
# from the app's own origin is stored XSS - SVG can carry <script>.
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

ALLOWED_CONTENT_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp",
}


class StorageError(RuntimeError):
    """The file could not be stored."""


def _avatar_dir() -> Path:
    path = Path(settings.UPLOAD_DIR) / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_extension(filename: str) -> str:
    """
    Pick a safe extension from a user-supplied filename.

    The filename comes from the client and is never used to build the stored
    path - only to choose an extension from a fixed allowlist. That closes the
    traversal and double-extension tricks ("avatar.png.html", "../../x") in one
    step, because the stored name is generated, not derived.
    """
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise StorageError(
            f"Unsupported image type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    return suffix


def store_avatar(user_id: str, data: bytes, filename: str, content_type: Optional[str] = None) -> str:
    """
    Save an avatar and return the URL to serve it from.

    Returns a URL, not a path, so callers keep working unchanged - the Supabase
    version returned a public URL too.
    """
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise StorageError("Unsupported image type")

    if not data:
        raise StorageError("Empty file")

    if len(data) > settings.MAX_UPLOAD_SIZE:
        raise StorageError("File is too large")

    if not re.fullmatch(r"[0-9a-fA-F-]{36}", str(user_id)):
        # user_id builds part of the stored name, so it must be a UUID and
        # nothing else.
        raise StorageError("Invalid user id")

    extension = _safe_extension(filename)

    # Generated name: unguessable, collision-free, and a new upload does not
    # overwrite the old one mid-request for anyone still loading it.
    stored_name = f"{user_id}-{uuid.uuid4().hex}{extension}"
    destination = _avatar_dir() / stored_name

    try:
        destination.write_bytes(data)
    except OSError as e:
        logger.error(f"Could not write avatar: {type(e).__name__}: {e}")
        raise StorageError("Could not save the image")

    logger.info(f"Stored avatar for {str(user_id)[:8]}... ({len(data)} bytes)")
    return f"{settings.AVATAR_BASE_URL.rstrip('/')}/{stored_name}"


def delete_avatar(url: Optional[str]) -> None:
    """Remove a previously stored avatar. Best effort; never raises."""
    if not url:
        return
    try:
        name = Path(url).name
        if not name or "/" in name or "\\" in name:
            return
        target = _avatar_dir() / name
        if target.is_file():
            target.unlink()
    except Exception as e:
        logger.debug(f"Could not delete avatar: {type(e).__name__}: {e}")
