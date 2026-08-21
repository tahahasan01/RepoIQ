"""
Single-use OAuth `state` nonces.

The GitHub authorize URL previously carried no `state`, and POST
/auth/github/callback accepted any `code` it was given. That is textbook login
CSRF: an attacker who obtains an authorization code for their own GitHub account
can cause a victim's browser to submit it, silently binding the victim's session
to the attacker's identity (or the reverse, depending on the flow).

Nonces live in Redis with a short TTL and are consumed on first use, so a
captured state cannot be replayed.
"""
import secrets
from typing import Optional

from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)

_KEY_TEMPLATE = "oauth:state:{state}"

# GitHub authorization codes expire in 10 minutes; the state should not outlive
# the code it protects.
STATE_TTL_SECONDS = 600


def _key(state: str) -> str:
    return _KEY_TEMPLATE.format(state=state)


def issue_state() -> str:
    """Generate and persist a single-use state nonce."""
    state = secrets.token_urlsafe(32)

    redis = get_redis_service()
    if not redis.available:
        # Returning a nonce we cannot verify would be security theatre. Say so
        # loudly; consume_state() will reject it and the flow will fail closed.
        logger.error("Cannot issue OAuth state: Redis unavailable")
        return state

    try:
        redis.client.setex(_key(state), STATE_TTL_SECONDS, b"1")
    except Exception as e:
        logger.error(f"Failed to persist OAuth state: {type(e).__name__}: {e}")

    return state


def consume_state(state: Optional[str]) -> bool:
    """
    Verify and burn a state nonce. True only if it was issued by us, has not
    expired, and has not already been used.

    Fails CLOSED. Unlike session revocation, there is no availability argument for
    letting an unverifiable OAuth callback through: the whole point of the nonce
    is that the request is otherwise unauthenticated.
    """
    if not state:
        return False

    redis = get_redis_service()
    if not redis.available:
        logger.error("Cannot verify OAuth state: Redis unavailable - rejecting callback")
        return False

    try:
        # DELETE returns the number of keys removed, so this is an atomic
        # test-and-burn: two concurrent replays cannot both succeed.
        return bool(redis.client.delete(_key(state)))
    except Exception as e:
        logger.error(f"OAuth state verification failed: {type(e).__name__}: {e}")
        return False
