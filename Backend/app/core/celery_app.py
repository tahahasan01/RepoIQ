from celery import Celery
from .config import get_settings

settings = get_settings()

celery_app = Celery(
    "coderabbit",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.analysis_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    task_soft_time_limit=3000,

    # SCALE: these tasks are long (minutes) and few, not short and many.
    #
    # prefetch_multiplier was 4, meaning each worker process reserved four
    # analyses up front. With multi-minute tasks that parks three users' work
    # behind one worker while other idle workers have nothing to do - the queue
    # looks busy and latency is terrible. 1 gives true least-loaded dispatch.
    worker_prefetch_multiplier=1,

    # Acknowledge only after completion, so a worker killed mid-analysis (deploy,
    # OOM, spot reclaim) returns the task to the queue instead of losing it. This
    # is what makes analyses survive a restart.
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Bound redelivery: an analysis that reliably kills its worker must not loop
    # forever consuming capacity.
    task_annotations={"*": {"max_retries": 2}},

    worker_max_tasks_per_child=200,
    broker_connection_retry_on_startup=True,
    # Cap how long a result sits in Redis; nothing reads these after the DB row
    # is written.
    result_expires=3600,
)
