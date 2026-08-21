"""
Background tasks for checking and sending alerts.
"""
from typing import List, Dict, Any
from app.services.alert_service import AlertService
from app.core.logging import get_logger

logger = get_logger(__name__)


async def check_organization_alerts(organization_id: str) -> List[Dict[str, Any]]:
    """Check all alert conditions for an organization."""
    try:
        alert_service = AlertService()
        all_alerts = []
        
        # Check critical issues
        critical_alerts = await alert_service.check_critical_issues_alerts(organization_id)
        all_alerts.extend(critical_alerts)
        
        # Check quality thresholds
        quality_alerts = await alert_service.check_quality_threshold_alerts(organization_id)
        all_alerts.extend(quality_alerts)
        
        # Check security vulnerabilities
        security_alerts = await alert_service.check_security_vulnerability_alerts(organization_id)
        all_alerts.extend(security_alerts)
        
        # Create alert records
        from app.db.supabase import get_service_db
        db = get_service_db()
        org_result = db.table("organizations").select("owner_id").eq("id", organization_id).single().execute()
        owner_id = org_result.data["owner_id"] if org_result.data else None
        
        if owner_id:
            for alert in all_alerts:
                await alert_service.create_alert(
                    organization_id=organization_id,
                    user_id=owner_id,
                    alert_type=alert["type"],
                    severity=alert["severity"],
                    message=alert["message"],
                    details=alert
                )
        
        logger.info(f"Checked alerts for organization {organization_id}: {len(all_alerts)} alerts found")
        return all_alerts
    except Exception as e:
        logger.error(f"Error checking organization alerts: {e}")
        return []


async def check_all_organizations_alerts():
    """Check alerts for all organizations."""
    try:
        from app.db.supabase import get_service_db
        db = get_service_db()
        
        # Get all organizations
        orgs_result = db.table("organizations").select("id").execute()
        org_ids = [org["id"] for org in (orgs_result.data or [])]
        
        total_alerts = 0
        for org_id in org_ids:
            alerts = await check_organization_alerts(org_id)
            total_alerts += len(alerts)
        
        logger.info(f"Checked alerts for {len(org_ids)} organizations: {total_alerts} total alerts")
        return total_alerts
    except Exception as e:
        logger.error(f"Error checking all organizations alerts: {e}")
        return 0
