"""
Webhook management API routes.

Allows users to:
- Register webhook endpoints
- List their webhooks
- Delete webhooks
- View webhook delivery history
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from app.services.webhook_service import get_webhook_service, WebhookEvents
from app.api.dependencies import get_current_user
from app.core.logging import get_logger
from app.api.errors import safe_detail

logger = get_logger(__name__)
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


class WebhookCreateRequest(BaseModel):
    """Request to create a new webhook."""
    url: HttpUrl
    events: List[str] = ["*"]  # Default to all events
    secret: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://your-server.com/webhook",
                "events": ["analysis.completed", "analysis.failed"],
                "secret": "optional-your-secret"
            }
        }


class WebhookResponse(BaseModel):
    """Webhook response model."""
    id: str
    url: str
    events: List[str]
    active: bool
    created_at: str


@router.get("/events")
async def list_available_events():
    """List all available webhook event types."""
    return {
        "events": [
            {
                "type": WebhookEvents.ANALYSIS_STARTED,
                "description": "Triggered when analysis starts"
            },
            {
                "type": WebhookEvents.ANALYSIS_COMPLETED,
                "description": "Triggered when analysis completes successfully"
            },
            {
                "type": WebhookEvents.ANALYSIS_FAILED,
                "description": "Triggered when analysis fails"
            },
            {
                "type": WebhookEvents.REPOSITORY_SYNCED,
                "description": "Triggered when repositories are synced from GitHub"
            },
            {
                "type": WebhookEvents.PR_ANALYSIS_COMPLETED,
                "description": "Triggered when pull request analysis completes"
            }
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_webhook(
    webhook_data: WebhookCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Register a new webhook endpoint.
    
    Webhooks will receive POST requests with event data.
    Each request includes a signature header for verification.
    """
    from app.services.url_guard import UnsafeUrlError

    service = get_webhook_service()

    try:
        webhook = await service.register_webhook(
            user_id=current_user["id"],
            url=str(webhook_data.url),
            events=webhook_data.events,
            secret=webhook_data.secret
        )
    except UnsafeUrlError as e:
        # UnsafeUrlError messages are authored to be shown to the user - they say
        # what is wrong with the URL and nothing about internal topology. This is
        # the one place a raw exception string is intentionally returned.
        logger.warning(f"Rejected webhook registration: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    try:
        # Don't return the secret in response
        webhook_response = {
            "id": webhook.get("id"),
            "url": webhook.get("url"),
            "events": webhook.get("events"),
            "active": webhook.get("active"),
            "created_at": webhook.get("created_at"),
            "message": "Webhook registered successfully"
        }
        
        return webhook_response
    except Exception as e:
        logger.error(f"Failed to create webhook: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create webhook"
        )


@router.get("/")
async def list_webhooks(
    current_user: dict = Depends(get_current_user)
):
    """List all webhooks for the current user."""
    service = get_webhook_service()
    
    webhooks = await service.get_user_webhooks(current_user["id"])
    
    # Remove secrets from response
    safe_webhooks = [
        {
            "id": w.get("id"),
            "url": w.get("url"),
            "events": w.get("events"),
            "active": w.get("active"),
            "created_at": w.get("created_at")
        }
        for w in webhooks
    ]
    
    return {"webhooks": safe_webhooks}


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a webhook."""
    service = get_webhook_service()
    
    success = await service.delete_webhook(webhook_id, current_user["id"])
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    return {"message": "Webhook deleted successfully"}


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Send a test event to a webhook.
    
    Useful for verifying webhook configuration.
    """
    service = get_webhook_service()
    
    # Get user's webhooks
    webhooks = await service.get_user_webhooks(current_user["id"])
    webhook = next((w for w in webhooks if w.get("id") == webhook_id), None)
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    # Send test event
    test_payload = {
        "message": "This is a test webhook from RepoIQ",
        "webhook_id": webhook_id,
        "user_id": current_user["id"]
    }
    
    # max_attempts=1: the default ladder sleeps 5s + 30s + 300s between retries.
    # On a request-path endpoint that holds the connection open for over five
    # minutes per call - a cheap way to exhaust the connection pool. A test
    # delivery should report the first attempt's result and nothing more.
    success = await service.send_webhook(
        webhook, "test.ping", test_payload, max_attempts=1
    )

    if success:
        return {"message": "Test webhook sent successfully"}
    else:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to deliver test webhook"
        )
