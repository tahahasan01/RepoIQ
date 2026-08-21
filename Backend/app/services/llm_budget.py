"""
Per-user OpenAI spend caps.

Nothing bounded LLM usage. A user could start analyses in a loop, or point the
product at repositories large enough that a single run burned a meaningful amount
of the account's budget, and the first signal would be the OpenAI invoice.

Usage is counted in tokens against a rolling daily window per user. The cap is
advisory in the sense that a run already in flight is allowed to finish - it is
enforced at the start of each model call, not mid-completion.
"""
from typing import Optional
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)
settings = get_settings()

_KEY_TEMPLATE = "llm:spend:{user_id}:{day}"


class LLMBudgetExceeded(Exception):
    """The user has exhausted their token budget for the current window."""


def _key(user_id: str) -> str:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return _KEY_TEMPLATE.format(user_id=user_id, day=day)


def get_spend(user_id: str) -> int:
    """Tokens consumed by this user in the current window."""
    redis = get_redis_service()
    if not redis.available:
        return 0
    try:
        raw = redis.client.get(_key(user_id))
        return int(raw) if raw else 0
    except Exception:
        return 0


def record_spend(user_id: str, tokens: int) -> None:
    """Add to the user's running total. Best effort - never fails a request."""
    if not (user_id and tokens):
        return

    redis = get_redis_service()
    if not redis.available:
        return

    try:
        key = _key(user_id)
        total = redis.client.incrby(key, int(tokens))
        # Expire ~2 days out so the window rolls off on its own.
        if total == tokens:
            redis.client.expire(key, 2 * 24 * 60 * 60)
    except Exception as e:
        logger.warning(f"Could not record LLM spend: {type(e).__name__}: {e}")


async def enforce_spend_budget(user_id: str) -> None:
    """
    Raise LLMBudgetExceeded if the user is over their daily token allowance.

    Fails OPEN when Redis is unavailable: refusing to analyse anything during a
    cache outage is a worse failure than briefly not enforcing a cost ceiling.
    The cap exists to catch runaway usage, not to be a security boundary.
    """
    limit = settings.OPENAI_DAILY_TOKEN_BUDGET_PER_USER
    if limit <= 0:  # 0 disables the cap
        return

    spent = get_spend(user_id)
    if spent >= limit:
        logger.warning(
            f"User {user_id[:8]}... exceeded the daily LLM budget "
            f"({spent}/{limit} tokens)"
        )
        raise LLMBudgetExceeded(
            "You have reached today's analysis limit. It resets at midnight UTC."
        )


def remaining_budget(user_id: str) -> Optional[int]:
    """Tokens left in the window, or None when the cap is disabled."""
    limit = settings.OPENAI_DAILY_TOKEN_BUDGET_PER_USER
    if limit <= 0:
        return None
    return max(0, limit - get_spend(user_id))
