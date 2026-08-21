from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.db.postgres import get_service_db
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)


class AlertService:
    def __init__(self):
        self.db = get_service_db()

    async def check_critical_issues_alerts(
        self,
        organization_id: str
    ) -> List[Dict[str, Any]]:
        """Check for critical issues that need alerts."""
        try:
            # Get all repositories in organization
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            
            # Get organization owner
            org_result = (await run_blocking(self.db.table("organizations").select("owner_id").eq("id", organization_id).single().execute))
            if not org_result.data:
                return []
            
            owner_id = org_result.data["owner_id"]
            repos = await org_service.get_organization_repositories(organization_id, owner_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return []
            
            # Get latest analyses
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute))
            analyses = analyses_result.data or []
            
            # Get latest per repo
            latest_analyses = {}
            for analysis in analyses:
                repo_id = analysis["repository_id"]
                if repo_id not in latest_analyses:
                    latest_analyses[repo_id] = analysis
            
            # Check for critical issues introduced in last 24 hours
            alerts = []
            twenty_four_hours_ago = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            
            for repo_id, analysis in latest_analyses.items():
                if analysis.get("critical_issues", 0) > 0:
                    # Check if analysis was recent
                    completed_at = analysis.get("completed_at")
                    if completed_at and completed_at >= twenty_four_hours_ago:
                        # Get repository info
                        repo = next((r for r in repos if r["id"] == repo_id), None)
                        if repo:
                            alerts.append({
                                "type": "critical_issues",
                                "severity": "critical",
                                "organization_id": organization_id,
                                "repository_id": repo_id,
                                "repository_name": repo.get("name"),
                                "message": f"Critical issues detected in {repo.get('name')}",
                                "count": analysis.get("critical_issues", 0),
                                "analysis_id": analysis["id"]
                            })
            
            return alerts
        except Exception as e:
            logger.error(f"Error checking critical issues alerts: {e}")
            return []

    async def check_quality_threshold_alerts(
        self,
        organization_id: str,
        threshold: int = 70
    ) -> List[Dict[str, Any]]:
        """Check for repositories with quality scores below threshold."""
        try:
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            
            org_result = (await run_blocking(self.db.table("organizations").select("owner_id").eq("id", organization_id).single().execute))
            if not org_result.data:
                return []
            
            owner_id = org_result.data["owner_id"]
            repos = await org_service.get_organization_repositories(organization_id, owner_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return []
            
            # Get latest analyses
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute))
            analyses = analyses_result.data or []
            
            alerts = []
            for analysis in analyses:
                overall_score = analysis.get("overall_score", 100)
                if overall_score < threshold:
                    repo = next((r for r in repos if r["id"] == analysis["repository_id"]), None)
                    if repo:
                        alerts.append({
                            "type": "quality_threshold",
                            "severity": "high" if overall_score < 50 else "medium",
                            "organization_id": organization_id,
                            "repository_id": analysis["repository_id"],
                            "repository_name": repo.get("name"),
                            "message": f"Quality score ({overall_score}) below threshold ({threshold}) in {repo.get('name')}",
                            "score": overall_score,
                            "threshold": threshold
                        })
            
            return alerts
        except Exception as e:
            logger.error(f"Error checking quality threshold alerts: {e}")
            return []

    async def check_security_vulnerability_alerts(
        self,
        organization_id: str
    ) -> List[Dict[str, Any]]:
        """Check for new security vulnerabilities."""
        try:
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            
            org_result = (await run_blocking(self.db.table("organizations").select("owner_id").eq("id", organization_id).single().execute))
            if not org_result.data:
                return []
            
            owner_id = org_result.data["owner_id"]
            repos = await org_service.get_organization_repositories(organization_id, owner_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return []
            
            # Get latest analyses
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute))
            analyses = analyses_result.data or []
            
            alerts = []
            # Check for security issues
            for analysis in analyses:
                security_score = analysis.get("security_score", 100)
                critical_security = analysis.get("critical_issues", 0)
                
                if security_score < 60 or critical_security > 0:
                    repo = next((r for r in repos if r["id"] == analysis["repository_id"]), None)
                    if repo:
                        # Get security issues
                        issues_result = (await run_blocking(self.db.table("issues").select("*").eq("analysis_id", analysis["id"]).eq("agent_type", "security").eq("severity", "critical").execute))
                        security_issues = issues_result.data or []
                        
                        if security_issues:
                            alerts.append({
                                "type": "security_vulnerability",
                                "severity": "critical",
                                "organization_id": organization_id,
                                "repository_id": analysis["repository_id"],
                                "repository_name": repo.get("name"),
                                "message": f"Security vulnerabilities detected in {repo.get('name')}",
                                "security_score": security_score,
                                "vulnerability_count": len(security_issues)
                            })
            
            return alerts
        except Exception as e:
            logger.error(f"Error checking security vulnerability alerts: {e}")
            return []

    async def create_alert(
        self,
        organization_id: str,
        user_id: str,
        alert_type: str,
        severity: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Create an alert record."""
        try:
            # Store alert (could be in a separate alerts table, for now using audit_logs)
            await (await run_blocking(self.db.table("audit_logs").insert({
                "organization_id": organization_id,
                "user_id": user_id,
                "action": f"alert:{alert_type}",
                "details_jsonb": {
                    "alert_type": alert_type,
                    "severity": severity,
                    "message": message,
                    **{**(details or {})}
                }
            }).execute))
            
            logger.info(f"Created alert: {alert_type} for organization {organization_id}")
            return True
        except Exception as e:
            logger.error(f"Error creating alert: {e}")
            return False

    async def get_organization_alerts(
        self,
        organization_id: str,
        user_id: str,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        """Get recent alerts for an organization."""
        try:
            # Verify access
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, user_id)
            if not org:
                return []
            
            # Get alert logs
            start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
            result = (await run_blocking(self.db.table("audit_logs").select("*").eq("organization_id", organization_id).like("action", "alert:%").gte("created_at", start_date).order("created_at", desc=True).execute))
            
            alerts = []
            for log in (result.data or []):
                details = log.get("details_jsonb", {})
                alerts.append({
                    "id": log["id"],
                    "type": details.get("alert_type", "unknown"),
                    "severity": details.get("severity", "medium"),
                    "message": details.get("message", ""),
                    "created_at": log["created_at"],
                    "details": details
                })
            
            return alerts
        except Exception as e:
            logger.error(f"Error getting organization alerts: {e}")
            return []
