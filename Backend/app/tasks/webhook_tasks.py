"""
Webhook delivery on Celery.

One task delivers one event to one webhook. A failed attempt that is worth
retrying (timeout, connection error, 5xx, 408/425/429) is re-queued with
Celery's own retry and a countdown from RETRY_DELAYS_SECONDS - the worker is
free between attempts. The ladder used to be asyncio.sleep(5/30/300) inside the
delivery call, holding its caller for over five minutes per failing endpoint.

SECURITY: the task takes the webhook id, not the webhook. The row holds the
signing secret, and Celery task arguments sit in the Redis broker in plaintext.
The worker re-reads the row, scoped to the owner, on every attempt - so a
webhook deleted or deactivated between retries stops receiving them, and the
destination is SSRF-checked again each time (WebhookService.deliver).
"""
import asyncio
from typing import Any, Dict, Optional

from app.core.celery_app import celery_app
from app.core.logging import get_logger
from app.services.webhook_service import RETRY_DELAYS_SECONDS, DeliveryOutcome, WebhookService

logger = get_logger(__name__)


async def _deliver(
    webhook_id: str,
    user_id: str,
    event_type: str,
    payload: Dict[str, Any],
    delivery_id: str,
    attempt: int,
    retries_left: bool,
) -> Optional[DeliveryOutcome]:
    service = WebhookService()
    webhook = await service.get_webhook(webhook_id, user_id)
    if not webhook:
        logger.info(f"Webhook {webhook_id} no longer active; dropping delivery {delivery_id}")
        return None
    return await service.deliver(
        webhook, event_type, payload,
        delivery_id=delivery_id, attempt=attempt, retries_left=retries_left,
    )


@celery_app.task(bind=True, name="deliver_webhook")
def deliver_webhook_task(
    self,
    webhook_id: str,
    user_id: str,
    event_type: str,
    payload: Dict[str, Any],
    delivery_id: str,
) -> Dict[str, Any]:
    retries_done = self.request.retries or 0
    retries_left = retries_done < len(RETRY_DELAYS_SECONDS)

    outcome = asyncio.run(_deliver(
        webhook_id, user_id, event_type, payload, delivery_id,
        attempt=retries_done + 1, retries_left=retries_left,
    ))
    if outcome is None:
        return {"delivery_id": delivery_id, "status": "skipped"}

    if not outcome.ok and outcome.retryable and retries_left:
        # max_retries is passed explicitly: the app-wide task_annotations set
        # max_retries=2 on every task, which would cut this ladder short.
        raise self.retry(
            countdown=RETRY_DELAYS_SECONDS[retries_done],
            max_retries=len(RETRY_DELAYS_SECONDS),
        )

    return {
        "delivery_id": delivery_id,
        "status": outcome.status,
        "response_code": outcome.response_code,
        "attempt": retries_done + 1,
    }
