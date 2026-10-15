"""
Scheduled alert checks.

These were plain async functions that nothing called: no Celery task wrapped
them, the Celery app did not include this module, and no beat schedule existed.
Alerts were therefore never checked unless someone pressed the manual button -
and even then never stored (see alert_service).

check_all_organizations_alerts is now a Celery task, scheduled by beat every
ALERT_CHECK_INTERVAL_SECONDS (app/core/celery_app.py). Running it needs both a
worker and a `celery -A app.core.celery_app beat` process.
"""
import asyncio
from typing import Any, Dict

from app.core.celery_app import celery_app
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.services.alert_service import AlertService

logger = get_logger(__name__)


async def check_organization_alerts(organization_id: str) -> Dict[str, Any]:
    """Evaluate and store alerts for one organisation. See AlertService.check_organization."""
    return await AlertService().check_organization(organization_id)


async def _check_all_organizations() -> Dict[str, int]:
    from app.db.postgres import get_service_db

    db = get_service_db()
    orgs = (await run_blocking(db.table("organizations").select("id").order("created_at").execute)).data or []

    created = 0
    failed = 0
    for org in orgs:
        # One organisation's failure (a deleted repository mid-check, a query
        # error) must not stop every organisation after it being checked.
        try:
            created += (await check_organization_alerts(org["id"]))["alerts_created"]
        except Exception as e:
            failed += 1
            logger.error(f"Alert check failed for organization {org['id']}: {type(e).__name__}: {e}")

    logger.info(
        f"Alert check: {len(orgs)} organizations, {created} new alerts, {failed} failed"
    )
    return {"organizations": len(orgs), "alerts_created": created, "failed": failed}


@celery_app.task(name="check_all_organizations_alerts")
def check_all_organizations_alerts() -> Dict[str, int]:
    """Check every organisation. Scheduled by beat; safe to run concurrently (alerts dedupe)."""
    return asyncio.run(_check_all_organizations())
