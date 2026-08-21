"""
Cross-process registry for in-flight analyses and cancellation requests.

This state used to live in two module-level containers:

    analysis.py:        _running_analyses: dict[str, str]   # user_id -> analysis_id
    analysis_tasks.py:  _cancelled_analyses: set[str]

Module-level state is per-process. With WORKERS=4, or more than one instance
behind a load balancer, a cancel request only worked if it happened to land on
the same process that was running the analysis - otherwise it silently did
nothing while reporting success. `_running_analyses` was also never pruned on
completion, so it grew for the life of the process.

Redis makes both correct across workers and gives the entries a TTL.
"""
from typing import Optional

from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)

_RUNNING_KEY = "analysis:running:{user_id}"
_CANCEL_KEY = "analysis:cancelled:{analysis_id}"

# Slightly longer than the 10-minute analysis budget, so a crashed worker's
# entry expires on its own rather than blocking the user forever.
_RUNNING_TTL = 15 * 60
_CANCEL_TTL = 15 * 60


def _decode(raw) -> Optional[str]:
    if raw is None:
        return None
    return raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)


def set_running(user_id: str, analysis_id: str) -> None:
    """Record the analysis currently running for a user."""
    redis = get_redis_service()
    if not redis.available:
        return
    try:
        redis.client.setex(_RUNNING_KEY.format(user_id=user_id), _RUNNING_TTL, analysis_id)
    except Exception as e:
        logger.warning(f"Could not record running analysis: {type(e).__name__}: {e}")


def get_running(user_id: str) -> Optional[str]:
    """The analysis currently running for a user, if any."""
    redis = get_redis_service()
    if not redis.available:
        return None
    try:
        return _decode(redis.client.get(_RUNNING_KEY.format(user_id=user_id)))
    except Exception as e:
        logger.warning(f"Could not read running analysis: {type(e).__name__}: {e}")
        return None


def clear_running(user_id: str, analysis_id: Optional[str] = None) -> None:
    """
    Clear the running marker.

    When analysis_id is given, only clears it if it still matches - so a task
    finishing late cannot wipe the marker for an analysis that superseded it.
    """
    redis = get_redis_service()
    if not redis.available:
        return
    try:
        key = _RUNNING_KEY.format(user_id=user_id)
        if analysis_id is not None and _decode(redis.client.get(key)) != analysis_id:
            return
        redis.client.delete(key)
    except Exception as e:
        logger.warning(f"Could not clear running analysis: {type(e).__name__}: {e}")


def request_cancellation(analysis_id: str) -> bool:
    """
    Flag an analysis for cancellation. Visible to whichever worker is running it.

    Returns False if the flag could not be persisted, so the caller can tell the
    user the cancellation may not take effect rather than claiming success.
    """
    redis = get_redis_service()
    if not redis.available:
        logger.error("Cannot request cancellation: Redis unavailable")
        return False
    try:
        redis.client.setex(_CANCEL_KEY.format(analysis_id=analysis_id), _CANCEL_TTL, b"1")
        logger.info(f"Cancellation requested for analysis {analysis_id}")
        return True
    except Exception as e:
        logger.error(f"Could not request cancellation: {type(e).__name__}: {e}")
        return False


def is_cancelled(analysis_id: str) -> bool:
    """Whether cancellation has been requested. Fails open (treats as not cancelled)."""
    redis = get_redis_service()
    if not redis.available:
        return False
    try:
        return bool(redis.client.exists(_CANCEL_KEY.format(analysis_id=analysis_id)))
    except Exception:
        return False


def clear_cancellation(analysis_id: str) -> None:
    """Drop the cancellation flag once it has been acted on."""
    redis = get_redis_service()
    if not redis.available:
        return
    try:
        redis.client.delete(_CANCEL_KEY.format(analysis_id=analysis_id))
    except Exception:
        pass
