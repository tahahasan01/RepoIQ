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
    Produce a usable GitHub token for a user.

    This is the ONLY place a token is produced, which is what keeps the GitHub
    App migration contained: in "app" mode it mints a fresh one-hour installation
    token from the app's private key; in "oauth" mode it decrypts the long-lived
    token stored at signup. Every caller - routes, Celery workers, agents - goes
    through here and is unaffected by which mode is active.

    Raises GitHubTokenUnavailable if no token can be produced.
    """
    from app.services.auth_service import AuthService
    from app.services import github_app

    user = await AuthService().get_user(user_id)
    if not user:
        raise GitHubTokenUnavailable("User not found")

    if github_app.is_enabled():
        installation_id = user.get("github_installation_id")
        if not installation_id:
            raise GitHubTokenUnavailable(
                "GitHub App is not installed for this account. Please install it "
                "and choose which repositories to grant access to."
            )
        try:
            return await github_app.get_installation_token(str(installation_id))
        except github_app.GitHubAppError as e:
            raise GitHubTokenUnavailable(str(e))

    try:
        return decrypt_stored_token(user.get("github_access_token"))
    except GitHubTokenUnavailable:
        raise
    except Exception as e:
        logger.error(f"Failed to decrypt GitHub token: {type(e).__name__}")
        raise GitHubTokenUnavailable("Stored GitHub token could not be decrypted")
