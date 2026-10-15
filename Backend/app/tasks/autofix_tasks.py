"""
Celery entry point for auto-fix. The work itself is app/services/autofix.py.
"""
import asyncio

from app.core.celery_app import celery_app
from app.core.logging import get_logger

logger = get_logger(__name__)


@celery_app.task(name="autofix")
def autofix_task(run_id: str):
    """
    SECURITY: takes the run id only, never a GitHub token - Celery serialises
    arguments into the Redis broker in plaintext. The worker resolves the
    token for the run's owner itself.
    """
    return asyncio.run(_run_for_owner(run_id))


async def _run_for_owner(run_id: str):
    from app.core.concurrency import run_blocking
    from app.db.postgres import get_service_db
    from app.services.autofix import run_autofix
    from app.services.github_token import resolve_github_token_for_user

    rows = (await run_blocking(
        get_service_db().table("autofix_runs").select("user_id").eq("id", run_id).execute
    )).data
    if not rows:
        logger.error(f"Auto-fix run {run_id} not found")
        return None
    token = await resolve_github_token_for_user(rows[0]["user_id"])
    return await run_autofix(run_id, token)


async def run_autofix_inline(run_id: str, github_token: str) -> None:
    """In-process fallback. The run records its own failure; nothing to re-raise to."""
    from app.services.autofix import run_autofix

    try:
        await run_autofix(run_id, github_token)
    except Exception:
        pass
