"""
Server-side session revocation for stateless JWTs.

The tokens issued by app.core.security are self-contained: once signed they are
valid until they expire, and nothing about logging out changes that. This module
records a per-user "everything issued before this instant is dead" watermark and
is consulted on every authenticated request.

Prior behaviour: POST /auth/logout wrote a watermark to Redis via
`redis_service.redis_client`, an attribute that does not exist - the resulting
AttributeError was swallowed by a broad except. Nothing read the key either. Both
halves were inert, so access tokens stayed valid for a full hour after logout and
refresh tokens for seven days.
"""
from typing import Optional
import time

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)
settings = get_settings()

_KEY_TEMPLATE = "auth:invalidated:{user_id}"


def _key(user_id: str) -> str:
    return _KEY_TEMPLATE.format(user_id=user_id)


def _watermark_ttl_seconds() -> int:
    """
    Keep the watermark at least as long as the longest-lived token it must
    invalidate, otherwise a refresh token can outlive the record of its
    revocation and come back to life.
    """
    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 + 60


def revoke_user_sessions(user_id: str) -> bool:
    """
    Invalidate every token issued to this user up to now.

    Returns True if the watermark was persisted. A False return means the user is
    still holding usable tokens and the caller should say so rather than
    reporting a clean logout.
    """
    if not user_id:
        return False

    redis = get_redis_service()
    if not redis.available:
        logger.error(
            "Session revocation requested but Redis is unavailable - "
            f"tokens for user {user_id[:8]}... remain valid until they expire"
        )
        return False

    try:
        redis.client.setex(
            _key(user_id),
            _watermark_ttl_seconds(),
            str(int(time.time())),
        )
        logger.info(f"Revoked sessions for user {user_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to persist session revocation: {type(e).__name__}: {e}")
        return False


def is_token_revoked(user_id: str, issued_at: Optional[int]) -> bool:
    """
    True if a token issued at `issued_at` for `user_id` has been revoked.

    Fails OPEN on Redis errors. A revocation store that fails closed would log
    every user out of the product during a cache outage, which is a worse
    outcome than briefly honouring a logged-out token. The trade-off is
    deliberate; if that is ever unacceptable, move the watermark to Postgres.

    A token with no `iat` claim is treated as revoked whenever a watermark
    exists: it predates this mechanism and cannot be proven to be newer.
    """
    if not user_id:
        return False

    redis = get_redis_service()
    if not redis.available:
        return False

    try:
        raw = redis.client.get(_key(user_id))
    except Exception as e:
        logger.warning(f"Revocation check failed, allowing request: {type(e).__name__}: {e}")
        return False

    if not raw:
        return False

    try:
        revoked_at = int(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except (ValueError, AttributeError):
        logger.warning("Malformed revocation watermark; ignoring")
        return False

    if issued_at is None:
        logger.info(f"Rejecting token without iat for user {user_id[:8]}...")
        return True

    # `<=`, not `<`.
    #
    # JWT `iat` has whole-second resolution, so a token issued in the same second
    # as the revocation is indistinguishable from one issued just before it. With
    # `<` those tokens survived - which meant logout did not revoke the session
    # that had just been used to call it, and refresh-token reuse left the
    # attacker's freshly-rotated token working. Both were reproducible by simply
    # doing the two calls quickly, which is exactly what an attacker does.
    #
    # `<=` is safe because a genuine new login deletes the watermark outright
    # (see clear_revocation, called from _issue_session) rather than relying on
    # this comparison to let it through.
    return issued_at <= revoked_at


# ---------------------------------------------------------------------------
# Refresh token rotation with reuse detection
# ---------------------------------------------------------------------------

_REFRESH_KEY_TEMPLATE = "auth:refresh:{user_id}"


def _refresh_key(user_id: str) -> str:
    return _REFRESH_KEY_TEMPLATE.format(user_id=user_id)


def register_refresh_token(user_id: str, jti: str) -> None:
    """
    Record the one refresh token currently valid for this user.

    Rotation alone is not enough: the old token stays cryptographically valid
    until it expires, so an attacker who captured it can keep redeeming it in
    parallel with the legitimate user. Tracking the live jti turns that into a
    detectable event.
    """
    if not (user_id and jti):
        return

    redis = get_redis_service()
    if not redis.available:
        return

    try:
        redis.client.setex(_refresh_key(user_id), _watermark_ttl_seconds(), jti)
    except Exception as e:
        logger.warning(f"Failed to register refresh token: {type(e).__name__}: {e}")


def consume_refresh_token(user_id: str, jti: Optional[str]) -> bool:
    """
    Validate a presented refresh token jti against the stored one.

    Returns True if this token is the current one. On mismatch the token is a
    replay of a already-rotated credential: every session for the user is revoked,
    because either the attacker or the legitimate user is holding a stolen token
    and we cannot tell which.

    Fails OPEN when Redis is unavailable, consistent with is_token_revoked().
    """
    if not user_id:
        return False

    redis = get_redis_service()
    if not redis.available:
        return True

    try:
        stored = redis.client.get(_refresh_key(user_id))
    except Exception as e:
        logger.warning(f"Refresh token check failed, allowing: {type(e).__name__}: {e}")
        return True

    if stored is None:
        # No record yet - a token issued before rotation tracking existed.
        # Accept it once; the caller registers a jti immediately afterwards.
        return True

    stored_jti = stored.decode("utf-8") if isinstance(stored, bytes) else stored

    if jti and stored_jti == jti:
        return True

    logger.error(
        f"Refresh token reuse detected for user {user_id[:8]}... - revoking all sessions"
    )
    revoke_user_sessions(user_id)
    return False


def clear_revocation(user_id: str) -> None:
    """Drop the watermark. Called after a fresh login so the new session is clean."""
    if not user_id:
        return

    redis = get_redis_service()
    if not redis.available:
        return

    try:
        redis.client.delete(_key(user_id))
    except Exception as e:
        logger.warning(f"Failed to clear revocation watermark: {type(e).__name__}: {e}")
