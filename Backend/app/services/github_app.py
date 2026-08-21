"""
GitHub App authentication.

The alternative to the OAuth App path in auth_service. An OAuth App has no
read-only private-repository scope, so it must request `repo` - read AND write to
every repository the user can reach - and store the resulting long-lived token.
A GitHub App instead grants:

  - per-permission access (Contents: read, Pull requests: write)
  - per-repository access, chosen by the user at install time
  - installation tokens that expire after one hour, so a leaked token is a
    one-hour problem rather than an indefinite one
  - 5,000 API requests/hour PER INSTALLATION rather than per user, so throughput
    grows with the number of customers instead of competing with them

Nothing is stored at rest here: installation tokens are minted on demand from the
app's private key and cached only until shortly before they expire.

Disabled unless GITHUB_AUTH_MODE=app. See GITHUB_APP_MIGRATION.md.
"""
import time
from typing import Any, Dict, Optional

import httpx
from jose import jwt

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)
settings = get_settings()

GITHUB_API = "https://api.github.com"

# Installation tokens last an hour. Refresh with a margin so a token cannot
# expire mid-analysis.
_TOKEN_TTL_SECONDS = 3300  # 55 minutes
_INSTALLATION_TOKEN_KEY = "github:app:token:{installation_id}"


class GitHubAppNotConfigured(RuntimeError):
    """GITHUB_AUTH_MODE is 'app' but the app credentials are missing."""


class GitHubAppError(RuntimeError):
    """A GitHub App API call failed."""


def is_enabled() -> bool:
    """Whether the GitHub App path is active for this deployment."""
    return (settings.GITHUB_AUTH_MODE or "oauth").lower() == "app"


def _private_key() -> str:
    """
    The app's PEM private key.

    Accepts a literal PEM or one with escaped newlines, because most secret
    stores (Railway, Vercel, Docker env) cannot hold real newlines in a value -
    a PEM pasted into them arrives as a single line with \\n sequences and fails
    to parse with an unhelpful error.
    """
    raw = settings.GITHUB_APP_PRIVATE_KEY
    if not raw:
        raise GitHubAppNotConfigured("GITHUB_APP_PRIVATE_KEY is not set")

    key = raw.replace("\\n", "\n").strip()
    if "BEGIN" not in key:
        raise GitHubAppNotConfigured(
            "GITHUB_APP_PRIVATE_KEY does not look like a PEM private key"
        )
    return key


def create_app_jwt() -> str:
    """
    Mint a short-lived JWT signed with the app's private key.

    This identifies the APP, not an installation, and is only used to exchange
    for installation tokens. GitHub rejects anything over 10 minutes; 9 leaves
    room for clock skew, and `iat` is backdated 60s for the same reason.
    """
    if not settings.GITHUB_APP_ID:
        raise GitHubAppNotConfigured("GITHUB_APP_ID is not set")

    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + 9 * 60,
        "iss": str(settings.GITHUB_APP_ID),
    }
    return jwt.encode(payload, _private_key(), algorithm="RS256")


async def get_installation_token(installation_id: str) -> str:
    """
    An access token for one installation, minted on demand and cached.

    Unlike the OAuth path there is nothing to store: the token is derived from
    the private key whenever it is needed, so there is no long-lived per-user
    credential in the database to leak.
    """
    if not installation_id:
        raise GitHubAppError("No installation id")

    redis = get_redis_service()
    cache_key = _INSTALLATION_TOKEN_KEY.format(installation_id=installation_id)

    if redis.available:
        try:
            cached = redis.client.get(cache_key)
            if cached:
                return cached.decode("utf-8") if isinstance(cached, bytes) else cached
        except Exception as e:
            logger.debug(f"Installation token cache read failed: {type(e).__name__}: {e}")

    app_jwt = create_app_jwt()

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
        response = await client.post(
            f"{GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    if response.status_code != 201:
        # Never log the body - it can echo request details. The status is enough
        # to distinguish "installation revoked" (404) from "bad key" (401).
        logger.error(
            f"Installation token exchange failed for {installation_id}: "
            f"HTTP {response.status_code}"
        )
        raise GitHubAppError(
            "Could not obtain GitHub access. The app may have been uninstalled."
        )

    token = response.json().get("token")
    if not token:
        raise GitHubAppError("GitHub returned no installation token")

    if redis.available:
        try:
            redis.client.setex(cache_key, _TOKEN_TTL_SECONDS, token)
        except Exception as e:
            logger.debug(f"Installation token cache write failed: {type(e).__name__}: {e}")

    return token


async def list_installation_repositories(installation_id: str) -> list:
    """
    Repositories this installation was actually granted.

    The OAuth path lists everything the user can see; a GitHub App only ever sees
    what was selected at install time, so repository sync must ask the
    installation rather than the user.
    """
    token = await get_installation_token(installation_id)

    repositories = []
    page = 1

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=5.0)) as client:
        while True:
            response = await client.get(
                f"{GITHUB_API}/installation/repositories",
                params={"per_page": 100, "page": page},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
            if response.status_code != 200:
                raise GitHubAppError(
                    f"Could not list installation repositories (HTTP {response.status_code})"
                )

            body = response.json()
            batch = body.get("repositories", [])
            repositories.extend(batch)

            if len(batch) < 100:
                break
            page += 1

            # Bound the walk: a pathological installation must not spin forever.
            if page > 50:
                logger.warning(
                    f"Installation {installation_id} has more than 5000 repositories; truncating"
                )
                break

    return repositories


def install_url(state: str) -> str:
    """
    Where to send a user to install the app.

    Carries the same single-use `state` nonce as the OAuth flow, so the callback
    is protected against login-CSRF identically.
    """
    if not settings.GITHUB_APP_SLUG:
        raise GitHubAppNotConfigured("GITHUB_APP_SLUG is not set")

    from urllib.parse import urlencode

    return (
        f"https://github.com/apps/{settings.GITHUB_APP_SLUG}/installations/new"
        f"?{urlencode({'state': state})}"
    )


async def exchange_user_code(code: str) -> Dict[str, Any]:
    """
    Exchange the user-authorization code for user identity.

    A GitHub App with "Request user authorization during installation" enabled
    returns a code exactly like the OAuth flow. The resulting user token is used
    ONLY to identify who is signing in - repository access comes from the
    installation token, never from this.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )

    body = response.json()
    if "error" in body:
        raise GitHubAppError(body.get("error_description") or body["error"])

    return body


async def get_user_installation_id(user_token: str) -> Optional[str]:
    """
    The installation id for the signing-in user, if the app is installed.

    Returns None when the user authorised the app but did not complete
    installation - the caller should send them back to the install URL rather
    than failing with an opaque error.
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
        response = await client.get(
            f"{GITHUB_API}/user/installations",
            headers={
                "Authorization": f"Bearer {user_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

    if response.status_code != 200:
        logger.warning(f"Could not list user installations: HTTP {response.status_code}")
        return None

    installations = response.json().get("installations", [])
    if not installations:
        return None

    # Match our app id when we know it; otherwise take the only installation.
    for installation in installations:
        if str(installation.get("app_id")) == str(settings.GITHUB_APP_ID):
            return str(installation["id"])

    return str(installations[0]["id"])
