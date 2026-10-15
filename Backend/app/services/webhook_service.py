"""
Webhook service for sending notifications to external services.

Features:
- Event emission to every webhook subscribed to an event (emit_event)
- Delivery retried by Celery, never by sleeping (app/tasks/webhook_tasks.py)
- Support for multiple webhook endpoints per user
- Signature verification for security
- Per-attempt delivery history (webhook_deliveries)

What was broken:
  - Nothing ever emitted an event. trigger_event and trigger_analysis_completed
    existed and no code path called them, so a registered webhook only ever
    received the manual test ping.
  - Delivery retried inline with asyncio.sleep(5 / 30 / 300): one failing
    endpoint held whatever called it for over five minutes. Retries are now
    Celery countdowns - the worker slot is free between attempts.
  - webhook_deliveries was written and never read, though the routes promised a
    delivery history. GET /webhooks/{id}/deliveries reads it now.

Delivery request (what a receiver gets):

    POST <webhook url>
    Content-Type: application/json
    User-Agent: RepoIQ-Webhook/1.0
    X-RepoIQ-Event: analysis.completed
    X-RepoIQ-Delivery: <uuid, the same on every retry of one event delivery>
    X-RepoIQ-Timestamp: <ISO-8601, also in the body>
    X-RepoIQ-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed by the webhook secret>

    {"event": "analysis.completed", "timestamp": "...", "data": {...}}

`data` per event:
    analysis.completed: repository_id, analysis_id, overall_score,
        security_score, quality_score, total_issues, critical_issues,
        high_issues (see trigger_analysis_completed)
    analysis.failed: repository_id, analysis_id, error
    test.ping: message, webhook_id, user_id

A 2xx/3xx answer is success. A timeout, connection failure, 5xx, 408, 425 or 429
is retried after 5s, 30s and 300s (four attempts). Any other 4xx is final: the
receiver has rejected the request and sending it again will not change that.
"""
import hashlib
import hmac
import json
import asyncio
import uuid
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
from datetime import datetime
import httpx
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.core.config import get_settings
from app.db.postgres import get_service_db

logger = get_logger(__name__)
settings = get_settings()

# Delay before each retry. Celery countdowns between attempts, not sleeps.
RETRY_DELAYS_SECONDS = (5, 30, 300)

# Status codes that mean "try again later" rather than "no".
_RETRYABLE_STATUS = {408, 425, 429}


@dataclass
class DeliveryOutcome:
    """The result of one delivery attempt."""
    ok: bool
    status: str             # success | blocked | failed | retrying
    response_code: int
    retryable: bool
    error: Optional[str] = None


class WebhookService:
    """
    Service for managing and delivering webhooks.
    """

    def __init__(self):
        self.db = get_service_db()
        self.max_retries = len(RETRY_DELAYS_SECONDS)
        self.retry_delays = list(RETRY_DELAYS_SECONDS)

    def _generate_signature(self, payload: str, secret: str) -> str:
        """
        Generate HMAC-SHA256 signature for webhook payload.

        Used by receivers to verify webhook authenticity.
        """
        return hmac.new(
            secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    async def register_webhook(
        self,
        user_id: str,
        url: str,
        events: List[str],
        secret: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Register a new webhook endpoint for a user.

        Args:
            user_id: User ID
            url: Webhook URL to receive events
            events: List of event types to subscribe to
            secret: Optional secret for signature verification
        """
        import secrets as sec
        from app.services.url_guard import resolve_and_validate

        # SECURITY: reject internal destinations at registration time. Without
        # this, POST /webhooks/{id}/test turns the API server into an SSRF proxy
        # aimed at cloud metadata, localhost admin routes, and the VPC.
        # Raises UnsafeUrlError, which the route maps to a 400.
        resolve_and_validate(url)

        webhook_data = {
            "user_id": user_id,
            "url": url,
            "events": events,
            "secret": secret or sec.token_urlsafe(32),
            "active": True,
            "created_at": datetime.utcnow().isoformat()
        }

        try:
            result = (await run_blocking(self.db.table("webhooks").insert(webhook_data).execute))
            logger.info(f"Webhook registered for user {user_id}: {url}")
            return result.data[0] if result.data else webhook_data
        except Exception as e:
            logger.error(f"Failed to register webhook: {e}")
            raise

    async def get_user_webhooks(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all webhooks for a user."""
        try:
            result = (await run_blocking(self.db.table("webhooks")\
                .select("*")\
                .eq("user_id", user_id)\
                .eq("active", True)\
                .execute))
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to get webhooks: {e}")
            return []

    async def get_webhook(
        self, webhook_id: str, user_id: str, active_only: bool = True
    ) -> Optional[Dict[str, Any]]:
        """One webhook, only if `user_id` owns it. None otherwise (or for a non-UUID id)."""
        try:
            uuid.UUID(str(webhook_id))
        except ValueError:
            return None
        query = self.db.table("webhooks").select("*").eq("id", webhook_id).eq("user_id", user_id)
        if active_only:
            query = query.eq("active", True)
        return (await run_blocking(query.single().execute)).data

    async def subscribed_webhooks(self, user_id: str, event_type: str) -> List[Dict[str, Any]]:
        """The user's active webhooks that subscribe to `event_type` (or to "*")."""
        return [
            w for w in await self.get_user_webhooks(user_id)
            if event_type in (w.get("events") or []) or "*" in (w.get("events") or [])
        ]

    async def delete_webhook(self, webhook_id: str, user_id: str) -> bool:
        """
        Delete a webhook. True only if a row was actually removed.

        This used to return True unconditionally without inspecting the result,
        so DELETE /webhooks/{someone-elses-id} answered "deleted successfully".
        That is both a lie to the caller and a weak existence oracle.
        """
        try:
            result = (await run_blocking(self.db.table("webhooks")\
                .delete()\
                .eq("id", webhook_id)\
                .eq("user_id", user_id)\
                .execute))

            deleted = bool(result.data)
            if deleted:
                logger.info(f"Webhook deleted: {webhook_id}")
            else:
                logger.info(f"No webhook {webhook_id} owned by this user; nothing deleted")
            return deleted
        except Exception as e:
            logger.error(f"Failed to delete webhook: {e}")
            return False

    async def get_deliveries(
        self, webhook_id: str, limit: int, offset: int
    ) -> List[Dict[str, Any]]:
        """
        Delivery attempts for one webhook, newest first. The caller must have
        established ownership (get_webhook) - this is scoped by webhook_id only.
        """
        result = await run_blocking(
            self.db.table("webhook_deliveries")
            .select("id, delivery_id, event_type, status, response_code, attempt, error, delivered_at")
            .eq("webhook_id", webhook_id)
            .order("delivered_at", desc=True)
            .limit(limit)
            .offset(offset)
            .execute
        )
        return result.data or []

    async def deliver(
        self,
        webhook: Dict[str, Any],
        event_type: str,
        payload: Dict[str, Any],
        *,
        delivery_id: Optional[str] = None,
        attempt: int = 1,
        retries_left: bool = False,
    ) -> DeliveryOutcome:
        """
        Make ONE delivery attempt and record it in webhook_deliveries.

        Never sleeps and never loops: a retry is the caller's decision, made from
        `outcome.retryable` (the Celery task schedules it with a countdown).
        `retries_left` only changes how a retryable failure is recorded -
        "retrying" when another attempt will follow, "failed" when it will not.
        """
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        url = webhook.get("url")
        secret = webhook.get("secret", "")
        delivery_id = delivery_id or str(uuid.uuid4())

        async def record(outcome: DeliveryOutcome) -> DeliveryOutcome:
            await self._log_delivery(
                webhook.get("id"), event_type, outcome.status, outcome.response_code,
                attempt=attempt, delivery_id=delivery_id, error=outcome.error,
            )
            return outcome

        # SECURITY: re-validate at delivery time, not just at registration.
        # DNS answers change: a hostname that resolved publicly when the webhook
        # was created can resolve to 169.254.169.254 by the time we deliver.
        # Checked on every attempt, retries included. Not retried: the answer
        # will not become safe by waiting.
        try:
            resolve_and_validate(url)
        except UnsafeUrlError as e:
            logger.error(f"Refusing webhook delivery to unsafe destination: {e}")
            return await record(DeliveryOutcome(False, "blocked", 0, False, "unsafe_destination"))

        webhook_payload = {
            "event": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": payload
        }

        payload_json = json.dumps(webhook_payload, sort_keys=True)
        signature = self._generate_signature(payload_json, secret)

        headers = {
            "Content-Type": "application/json",
            "X-RepoIQ-Event": event_type,
            "X-RepoIQ-Delivery": delivery_id,
            "X-RepoIQ-Signature": f"sha256={signature}",
            "X-RepoIQ-Timestamp": webhook_payload["timestamp"],
            "User-Agent": "RepoIQ-Webhook/1.0"
        }

        response_code = 0
        try:
            # follow_redirects=False: a 302 to http://169.254.169.254 would
            # walk straight past the validation above.
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                response = await client.post(url, content=payload_json, headers=headers)
            response_code = response.status_code
            if response_code < 400:
                logger.info(f"Webhook delivered: {url} ({response_code}, attempt {attempt})")
                return await record(DeliveryOutcome(True, "success", response_code, False))
            retryable = response_code >= 500 or response_code in _RETRYABLE_STATUS
            error = f"http_{response_code}"
        except httpx.TimeoutException:
            retryable, error = True, "timeout"
        except httpx.ConnectError:
            retryable, error = True, "connection_error"
        except httpx.HTTPError as e:
            retryable, error = True, "request_error"
            logger.warning(f"Webhook request error: {url} - {type(e).__name__}")
        except Exception as e:
            # Not a transport failure (e.g. a URL httpx cannot use). Waiting
            # will not fix it; record it instead of failing the task unlogged.
            retryable, error = False, "request_error"
            logger.error(f"Webhook error: {url} - {type(e).__name__}: {e}")

        status = "retrying" if (retryable and retries_left) else "failed"
        logger.warning(f"Webhook delivery {status}: {url} ({error}, attempt {attempt})")
        return await record(DeliveryOutcome(False, status, response_code, retryable, error))

    async def send_webhook(
        self,
        webhook: Dict[str, Any],
        event_type: str,
        payload: Dict[str, Any],
        max_attempts: int = 1,
        *,
        delivery_id: Optional[str] = None,
    ) -> bool:
        """
        Deliver in-process, in a single attempt. True on success.

        For request-path callers (POST /webhooks/{id}/test) and the no-worker
        fallback in emit_event. This used to run a retry ladder that slept 5s,
        30s and 300s inline - over five minutes holding the caller. Retrying is
        now the Celery task's job, so more than one attempt here is refused
        rather than silently ignored.
        """
        if max_attempts != 1:
            raise ValueError(
                "In-process delivery makes exactly one attempt; "
                "retries run on Celery (emit_event)"
            )
        outcome = await self.deliver(webhook, event_type, payload, delivery_id=delivery_id)
        return outcome.ok

    async def _log_delivery(
        self,
        webhook_id: str,
        event_type: str,
        status: str,
        response_code: int,
        *,
        attempt: int = 1,
        delivery_id: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """Log webhook delivery attempt."""
        try:
            (await run_blocking(self.db.table("webhook_deliveries").insert({
                "webhook_id": webhook_id,
                "event_type": event_type,
                "status": status,
                "response_code": response_code,
                "attempt": attempt,
                "delivery_id": delivery_id,
                "error": error,
                "delivered_at": datetime.utcnow().isoformat()
            }).execute))
        except Exception as e:
            logger.warning(f"Failed to log webhook delivery: {type(e).__name__}: {e}")


# Event types
class WebhookEvents:
    """Standard webhook event types."""
    ANALYSIS_STARTED = "analysis.started"
    ANALYSIS_COMPLETED = "analysis.completed"
    ANALYSIS_FAILED = "analysis.failed"
    REPOSITORY_SYNCED = "repository.synced"
    ISSUE_CREATED = "issue.created"
    PR_ANALYSIS_COMPLETED = "pr_analysis.completed"


# Global service instance
_webhook_service: Optional[WebhookService] = None


def get_webhook_service() -> WebhookService:
    """Get or create the global webhook service instance."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService()
    return _webhook_service


# ---------------------------------------------------------------------------
# Emission
# ---------------------------------------------------------------------------

async def _dispatch(
    user_id: str, webhooks: List[Dict[str, Any]], event_type: str, payload: Dict[str, Any]
) -> int:
    """
    One delivery per webhook: a Celery task each when a worker is listening,
    otherwise a single in-process attempt each.

    The task carries the webhook id, never the webhook row: the row holds the
    signing secret, and task arguments sit in the Redis broker in plaintext.
    The worker re-reads the webhook (and so also skips one deleted meanwhile).
    """
    from app.services.analysis_dispatch import DispatchMode, resolve_mode

    # resolve_mode pings the workers, which blocks for up to 0.75s.
    mode = await run_blocking(resolve_mode)

    inline = []
    for webhook in webhooks:
        delivery_id = str(uuid.uuid4())
        if mode == DispatchMode.QUEUE:
            try:
                from app.tasks.webhook_tasks import deliver_webhook_task

                deliver_webhook_task.delay(
                    webhook_id=webhook["id"],
                    user_id=user_id,
                    event_type=event_type,
                    payload=payload,
                    delivery_id=delivery_id,
                )
                continue
            except Exception as e:
                # The broker went away between the ping and the publish. One
                # attempt now beats an event that is never delivered.
                logger.warning(f"Could not enqueue webhook delivery, sending inline: {type(e).__name__}")
        inline.append((webhook, delivery_id))

    if inline:
        service = get_webhook_service()
        await asyncio.gather(
            *(
                service.send_webhook(w, event_type, payload, max_attempts=1, delivery_id=d)
                for w, d in inline
            ),
            return_exceptions=True,
        )

    logger.info(
        f"Event {event_type}: {len(webhooks) - len(inline)} queued, {len(inline)} sent inline"
    )
    return len(webhooks)


async def emit_event(user_id: str, event_type: str, payload: Dict[str, Any]) -> int:
    """
    Send `event_type` to every active webhook of `user_id` subscribed to it.
    Returns how many webhooks the event was dispatched to.
    """
    webhooks = await get_webhook_service().subscribed_webhooks(user_id, event_type)
    if not webhooks:
        return 0
    return await _dispatch(user_id, webhooks, event_type, payload)


def _analysis_completed_payload(repo_id: str, analysis_id: str, results: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "repository_id": repo_id,
        "analysis_id": analysis_id,
        "overall_score": results.get("overall_score"),
        "security_score": results.get("security_score"),
        "quality_score": results.get("quality_score"),
        "total_issues": results.get("total_issues", 0),
        "critical_issues": results.get("critical_issues", 0),
        "high_issues": results.get("high_issues", 0)
    }


async def trigger_analysis_completed(
    user_id: str,
    repo_id: str,
    analysis_id: str,
    results: Dict[str, Any]
) -> int:
    """Emit analysis.completed with the scores and counts in `results`."""
    return await emit_event(
        user_id,
        WebhookEvents.ANALYSIS_COMPLETED,
        _analysis_completed_payload(repo_id, analysis_id, results),
    )


async def emit_analysis_completed(repo: Dict[str, Any], analysis_id: str) -> int:
    """
    Post-analysis step (analysis_tasks._run_followups): emit analysis.completed.

    Reads the scores from the stored analysis row rather than taking them from
    the caller, so the event says exactly what the UI shows. Looks up
    subscribers first: most users have no webhooks, and then nothing is read.
    """
    user_id = repo.get("user_id")
    if not user_id:
        return 0
    webhooks = await get_webhook_service().subscribed_webhooks(user_id, WebhookEvents.ANALYSIS_COMPLETED)
    if not webhooks:
        return 0

    analysis = (await run_blocking(
        get_service_db().table("analysis_results")
        .select("*")
        .eq("id", analysis_id)
        .eq("repository_id", repo["id"])
        .single()
        .execute
    )).data
    if not analysis or analysis.get("status") != "completed":
        return 0

    return await _dispatch(
        user_id, webhooks, WebhookEvents.ANALYSIS_COMPLETED,
        _analysis_completed_payload(repo["id"], analysis_id, analysis),
    )


async def emit_analysis_failed(
    user_id: Optional[str], repo_id: Optional[str], analysis_id: str, error: BaseException
) -> int:
    """
    Emit analysis.failed. Never raises: it is called from failure handlers,
    where an exception would replace the error being handled.

    `error` in the payload is the exception's message only when it was written
    for a person (user_facing, e.g. "configure your API key"). Anything else is
    an internal failure whose text can carry SQL, paths or hostnames, and goes
    out as a generic sentence.
    """
    if not user_id:
        return 0
    try:
        message = str(error) if getattr(error, "user_facing", False) else "Analysis failed"
        return await emit_event(user_id, WebhookEvents.ANALYSIS_FAILED, {
            "repository_id": repo_id,
            "analysis_id": analysis_id,
            "error": message,
        })
    except Exception as e:
        logger.warning(f"Could not emit analysis.failed for {analysis_id}: {type(e).__name__}: {e}")
        return 0
