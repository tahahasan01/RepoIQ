"""
Webhook service for sending notifications to external services.

Features:
- Send analysis completion notifications
- Retry failed webhook deliveries
- Support for multiple webhook endpoints per user
- Signature verification for security
"""
import hashlib
import hmac
import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
import httpx
from app.core.logging import get_logger
from app.core.config import get_settings
from app.db.supabase import get_service_db

logger = get_logger(__name__)
settings = get_settings()


class WebhookService:
    """
    Service for managing and delivering webhooks.
    """
    
    def __init__(self):
        self.db = get_service_db()
        self.max_retries = 3
        self.retry_delays = [5, 30, 300]  # 5s, 30s, 5min
    
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
            result = self.db.table("webhooks").insert(webhook_data).execute()
            logger.info(f"✅ Webhook registered for user {user_id}: {url}")
            return result.data[0] if result.data else webhook_data
        except Exception as e:
            logger.error(f"Failed to register webhook: {e}")
            raise
    
    async def get_user_webhooks(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all webhooks for a user."""
        try:
            result = self.db.table("webhooks")\
                .select("*")\
                .eq("user_id", user_id)\
                .eq("active", True)\
                .execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to get webhooks: {e}")
            return []
    
    async def delete_webhook(self, webhook_id: str, user_id: str) -> bool:
        """Delete a webhook."""
        try:
            self.db.table("webhooks")\
                .delete()\
                .eq("id", webhook_id)\
                .eq("user_id", user_id)\
                .execute()
            logger.info(f"🗑️ Webhook deleted: {webhook_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete webhook: {e}")
            return False
    
    async def send_webhook(
        self,
        webhook: Dict[str, Any],
        event_type: str,
        payload: Dict[str, Any],
        max_attempts: Optional[int] = None
    ) -> bool:
        """
        Send a webhook notification.

        Args:
            webhook: Webhook configuration
            event_type: Type of event (e.g., 'analysis.completed')
            payload: Event data to send
            max_attempts: Cap on delivery attempts. Pass 1 from request-path
                callers - the default retry ladder sleeps up to 335s in total,
                which holds a connection open for over five minutes.
        """
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        url = webhook.get("url")
        secret = webhook.get("secret", "")

        # SECURITY: re-validate at delivery time, not just at registration.
        # DNS answers change: a hostname that resolved publicly when the webhook
        # was created can resolve to 169.254.169.254 by the time we deliver.
        try:
            resolve_and_validate(url)
        except UnsafeUrlError as e:
            logger.error(f"Refusing webhook delivery to unsafe destination: {e}")
            await self._log_delivery(webhook.get("id"), event_type, "blocked", 0)
            return False
        
        # Build webhook payload
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
            "X-RepoIQ-Signature": f"sha256={signature}",
            "X-RepoIQ-Timestamp": webhook_payload["timestamp"],
            "User-Agent": "RepoIQ-Webhook/1.0"
        }
        
        # Try to deliver with retries
        schedule = [0] + self.retry_delays
        if max_attempts is not None:
            schedule = schedule[:max(1, max_attempts)]

        for attempt, delay in enumerate(schedule):
            if attempt > 0:
                logger.info(f"Retrying webhook delivery (attempt {attempt + 1}/{len(schedule)})")
                await asyncio.sleep(delay)

            try:
                # follow_redirects=False: a 302 to http://169.254.169.254 would
                # walk straight past the validation above.
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                    response = await client.post(
                        url,
                        content=payload_json,
                        headers=headers
                    )
                    
                    if response.status_code < 400:
                        logger.info(f"✅ Webhook delivered successfully: {url} ({response.status_code})")
                        await self._log_delivery(webhook["id"], event_type, "success", response.status_code)
                        return True
                    else:
                        logger.warning(f"⚠️ Webhook returned error: {url} ({response.status_code})")
                        
            except httpx.TimeoutException:
                logger.warning(f"⏱️ Webhook timeout: {url}")
            except httpx.ConnectError:
                logger.warning(f"🔌 Webhook connection failed: {url}")
            except Exception as e:
                logger.error(f"❌ Webhook error: {url} - {e}")
        
        # All retries failed
        logger.error(f"❌ Webhook delivery failed after {len(schedule)} attempts: {url}")
        await self._log_delivery(webhook["id"], event_type, "failed", 0)
        return False
    
    async def _log_delivery(
        self,
        webhook_id: str,
        event_type: str,
        status: str,
        response_code: int
    ):
        """Log webhook delivery attempt."""
        try:
            self.db.table("webhook_deliveries").insert({
                "webhook_id": webhook_id,
                "event_type": event_type,
                "status": status,
                "response_code": response_code,
                "delivered_at": datetime.utcnow().isoformat()
            }).execute()
        except Exception as e:
            logger.debug(f"Failed to log webhook delivery: {e}")
    
    async def trigger_event(
        self,
        user_id: str,
        event_type: str,
        payload: Dict[str, Any]
    ):
        """
        Trigger an event and send to all subscribed webhooks.
        
        Args:
            user_id: User ID
            event_type: Type of event
            payload: Event data
        """
        webhooks = await self.get_user_webhooks(user_id)
        
        # Filter webhooks subscribed to this event
        subscribed = [
            w for w in webhooks
            if event_type in w.get("events", []) or "*" in w.get("events", [])
        ]
        
        if not subscribed:
            logger.debug(f"No webhooks subscribed to event: {event_type}")
            return
        
        logger.info(f"🔔 Triggering {event_type} for {len(subscribed)} webhooks")
        
        # Send webhooks concurrently
        tasks = [
            self.send_webhook(webhook, event_type, payload)
            for webhook in subscribed
        ]
        await asyncio.gather(*tasks, return_exceptions=True)


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


async def trigger_analysis_completed(
    user_id: str,
    repo_id: str,
    analysis_id: str,
    results: Dict[str, Any]
):
    """
    Convenience function to trigger analysis completed event.
    Called from analysis tasks when analysis finishes.
    """
    service = get_webhook_service()
    
    payload = {
        "repository_id": repo_id,
        "analysis_id": analysis_id,
        "overall_score": results.get("overall_score"),
        "security_score": results.get("security_score"),
        "quality_score": results.get("quality_score"),
        "total_issues": results.get("total_issues", 0),
        "critical_issues": results.get("critical_issues", 0),
        "high_issues": results.get("high_issues", 0)
    }
    
    await service.trigger_event(user_id, WebhookEvents.ANALYSIS_COMPLETED, payload)
