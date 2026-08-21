"""
Where an analysis actually runs.

Analyses were dispatched with FastAPI's BackgroundTasks, i.e. inside the API
process. For a job that can take ten minutes that is the wrong place:

  - it occupies an API worker for the duration, so with WORKERS=4 four
    concurrent analyses leave the whole instance unable to serve requests;
  - any deploy, restart or crash silently orphans in-flight work, leaving rows
    stuck in `in_progress` forever;
  - it cannot scale independently of the API tier, which is the whole reason a
    queue exists.

Celery was already configured and `analyze_repository_task` already defined - the
route just wasn't using them. This module routes to the queue when a broker is
reachable and falls back to in-process execution when it is not, so local
development without a worker still works.
"""
from typing import Any, Callable, Optional

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class DispatchMode:
    QUEUE = "queue"
    INLINE = "inline"


def _broker_reachable() -> bool:
    """
    Whether a Celery worker could pick this up.

    Checks that the broker answers AND that at least one worker is listening -
    a reachable broker with no consumers means the analysis is queued into a void
    and the user watches a spinner forever, which is worse than running inline.
    """
    try:
        from app.core.celery_app import celery_app

        replies = celery_app.control.ping(timeout=0.75)
        return bool(replies)
    except Exception as e:
        logger.debug(f"Celery not reachable: {type(e).__name__}: {e}")
        return False


def resolve_mode() -> str:
    """
    Decide how to run an analysis.

    ANALYSIS_EXECUTION_MODE:
      "queue"  - always Celery. Fail loudly if no worker; correct for production.
      "inline" - always in-process. For local development.
      "auto"   - queue when a worker is listening, otherwise inline (default).
    """
    configured = (settings.ANALYSIS_EXECUTION_MODE or "auto").lower()

    if configured == DispatchMode.QUEUE:
        return DispatchMode.QUEUE
    if configured == DispatchMode.INLINE:
        return DispatchMode.INLINE

    return DispatchMode.QUEUE if _broker_reachable() else DispatchMode.INLINE


def dispatch_analysis(
    repo_id: str,
    user_id: str,
    analysis_id: str,
    github_token: str,
    add_background_task: Optional[Callable[..., Any]] = None,
) -> str:
    """
    Start an analysis. Returns the mode actually used.

    github_token is only used by the inline path, which runs in this process.
    The queued path deliberately does NOT carry it: Celery serialises kwargs into
    the Redis broker in plaintext, so the worker re-resolves and decrypts the
    token itself from user_id.

    Raises RuntimeError when queue mode is required but nothing can run the task.
    """
    mode = resolve_mode()

    if mode == DispatchMode.QUEUE:
        from app.tasks.analysis_tasks import analyze_repository_task

        analyze_repository_task.delay(
            repo_id=repo_id,
            user_id=user_id,
            analysis_id=analysis_id,
        )
        logger.info(f"Analysis {analysis_id} queued to Celery")
        return DispatchMode.QUEUE

    if add_background_task is None:
        raise RuntimeError(
            "No Celery worker is available and no in-process fallback was provided"
        )

    from app.tasks.analysis_tasks import run_analysis_sync

    logger.warning(
        f"Analysis {analysis_id} running IN-PROCESS - no Celery worker reachable. "
        "This occupies an API worker for the duration and will not survive a "
        "restart. Start a worker: celery -A app.core.celery_app worker"
    )
    add_background_task(
        run_analysis_sync,
        repo_id=repo_id,
        user_id=user_id,
        github_token=github_token,
        analysis_id=analysis_id,
    )
    return DispatchMode.INLINE
