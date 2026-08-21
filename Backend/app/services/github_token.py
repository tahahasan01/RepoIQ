"""
Resolution of a user's GitHub OAuth token from storage.

Background jobs must call resolve_github_token_for_user() rather than receiving a
token as a task argument. Celery serialises task kwargs into the broker - which
here is the same Redis instance used for caching - so passing the decrypted token
persisted a live GitHub credential in plaintext, visible to anything that can read
the queue (including the unauthenticated Flower dashboard in docker-compose).
"""
from typing import Optional

from app.core.logging import get_logger
from app.services.encryption_service import decrypt_token, get_encryption_service

logger = get_logger(__name__)


class GitHubTokenUnavailable(Exception):
    """The user has no usable GitHub token."""


def decrypt_stored_token(stored: Optional[str]) -> str:
    """
    Decrypt a token as held in the users table.

    Tolerates legacy plaintext rows written before encryption-at-rest existed.
    """
    if not stored:
        raise GitHubTokenUnavailable("No GitHub token on record")

    encryption_service = get_encryption_service()

    if encryption_service.is_encrypted(stored):
        return decrypt_token(stored)

    logger.warning("Stored GitHub token is not encrypted - user should re-authenticate")
    return stored


async def resolve_github_token_for_user(user_id: str) -> str:
    """
    Look up and decrypt the GitHub token for a user id.

    Raises GitHubTokenUnavailable if there is no token or it cannot be decrypted.
    """
    from app.services.auth_service import AuthService

    user = await AuthService().get_user(user_id)
    if not user:
        raise GitHubTokenUnavailable("User not found")

    try:
        return decrypt_stored_token(user.get("github_access_token"))
    except GitHubTokenUnavailable:
        raise
    except Exception as e:
        logger.error(f"Failed to decrypt GitHub token: {type(e).__name__}")
        raise GitHubTokenUnavailable("Stored GitHub token could not be decrypted")
