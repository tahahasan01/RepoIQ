from fastapi import APIRouter, HTTPException, status, Depends, Query
from loguru import logger
from typing import List, Dict, Any
from app.api.dependencies import get_current_user
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/organizations/{org_id}", response_model=List[Dict[str, Any]])
async def get_organization_alerts(
    org_id: str,
    days: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get recent alerts for an organization."""
    try:
        service = AlertService()
        alerts = await service.get_organization_alerts(org_id, current_user["id"], days)
        return alerts
    except Exception as e:
        logger.error(f"Error getting organization alerts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/organizations/{org_id}/check")
async def check_alerts(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Manually trigger alert check for an organization."""
    try:
        from app.tasks.alert_tasks import check_organization_alerts
        
        # Verify access
        from app.services.organization_service import OrganizationService
        org_service = OrganizationService()
        org = await org_service.get_organization(org_id, current_user["id"])
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
        
        alerts = await check_organization_alerts(org_id)
        
        return {
            "success": True,
            "organization_id": org_id,
            "alerts_found": len(alerts),
            "alerts": alerts
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking alerts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
