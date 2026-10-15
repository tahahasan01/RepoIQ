"""
Organisation alerts.

Alert object (every endpoint below returns this shape):

    {
      "id": "uuid",
      "organization_id": "uuid",
      "repository_id": "uuid",
      "alert_type": "critical_issues" | "security_vulnerability" | "quality_threshold",
      "severity": "critical" | "high" | "medium",
      "message": "3 critical issues in the latest analysis of api",
      "details": {
        "repository_name": "api", "repository_full_name": "acme/api",
        "analysis_id": "uuid", "analysis_completed_at": "ISO-8601",
        # by type:
        "critical_issues": 3,                              # critical_issues
        "vulnerability_count": 2, "security_score": 41,    # security_vulnerability
        "score": 62, "threshold": 70                       # quality_threshold
      },
      "acknowledged": false,
      "acknowledged_at": "ISO-8601" | null,
      "acknowledged_by": "user uuid" | null,
      "created_at": "ISO-8601"
    }

Alerts are raised by the scheduled check (Celery beat, hourly by default) and by
POST /alerts/organizations/{org_id}/check. Each describes one repository's
latest completed analysis and is raised once per analysis.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger

from app.api.dependencies import get_current_user
from app.api.errors import safe_detail
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/organizations/{org_id}", response_model=List[Dict[str, Any]])
async def get_organization_alerts(
    org_id: str,
    days: int = Query(7, ge=1, le=90),
    include_acknowledged: bool = Query(True),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Alerts raised in the last `days` days, newest first.

    Query: days (1-90, default 7), include_acknowledged (default true; false
    returns only open alerts).
    Response 200: [Alert, ...]. 404 when the caller is not a member of the
    organisation.
    """
    try:
        alerts = await AlertService().get_organization_alerts(
            org_id, current_user["id"], days, include_acknowledged
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to load alerts", context="alerts.list"),
        )
    if alerts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return alerts


@router.post("/organizations/{org_id}/check")
async def check_alerts(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Run the alert checks for an organisation now, instead of waiting for the
    schedule.

    Response 200:
        {
          "success": true,
          "organization_id": "uuid",
          "alerts_found": 4,     # conditions currently true
          "alerts_created": 1,   # of those, newly raised by this check
          "alerts": [Alert, ...] # the newly raised ones
        }
    404 when the caller is not a member of the organisation.
    """
    from app.services.organization_service import OrganizationService
    from app.tasks.alert_tasks import check_organization_alerts

    org = await OrganizationService().get_organization(org_id, current_user["id"])
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    try:
        result = await check_organization_alerts(org_id)
    except Exception as e:
        logger.error(f"Error checking alerts: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to check alerts", context="alerts.check"),
        )

    # The check runs over the whole organization; the answer only describes
    # repositories this caller may see (see AlertService.visible_repository_ids).
    if org.get("owner_id") != current_user["id"]:
        visible = set(await AlertService().visible_repository_ids(org_id, current_user["id"]))
        alerts = [a for a in result.get("alerts", []) if a.get("repository_id") in visible]
        result = {"alerts_created": len(alerts), "alerts": alerts}

    return {"success": True, "organization_id": org_id, **result}


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Acknowledge an alert. Any member of the alert's organisation may.

    Idempotent: a second call returns the alert unchanged, keeping the first
    acknowledged_at / acknowledged_by.
    Response 200: Alert (with acknowledged = true). 404 when the alert does not
    exist or the caller is not a member of its organisation.
    """
    try:
        alert = await AlertService().acknowledge_alert(alert_id, current_user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to acknowledge alert", context="alerts.acknowledge"),
        )
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert
