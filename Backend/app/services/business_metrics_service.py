from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.db.supabase import get_service_db
from app.core.logging import get_logger

logger = get_logger(__name__)


class BusinessMetricsService:
    def __init__(self):
        self.db = get_service_db()

    async def get_organization_overview(
        self,
        organization_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Get high-level organization overview metrics."""
        try:
            # Verify access
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, user_id)
            if not org:
                return {}
            
            # Get all repositories in organization
            repos = await org_service.get_organization_repositories(organization_id, user_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return {
                    "organization_id": organization_id,
                    "total_repositories": 0,
                    "overall_health_score": 0,
                    "total_issues": 0,
                    "critical_issues": 0,
                    "security_risk_level": "low",
                    "technical_debt_hours": 0
                }
            
            # Get latest analysis results for all repos
            analyses_result = self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute()
            analyses = analyses_result.data or []
            
            # Get latest analysis per repository
            latest_analyses = {}
            for analysis in analyses:
                repo_id = analysis["repository_id"]
                if repo_id not in latest_analyses:
                    latest_analyses[repo_id] = analysis
            
            # Calculate aggregate metrics
            total_repos = len(repos)
            total_issues = sum(a.get("total_issues", 0) for a in latest_analyses.values())
            critical_issues = sum(a.get("critical_issues", 0) for a in latest_analyses.values())
            high_issues = sum(a.get("high_issues", 0) for a in latest_analyses.values())
            
            # Calculate overall health score (weighted average)
            scores = [a.get("overall_score", 0) for a in latest_analyses.values() if a.get("overall_score")]
            overall_health_score = sum(scores) / len(scores) if scores else 0
            
            # Calculate security risk level
            security_scores = [a.get("security_score", 100) for a in latest_analyses.values() if a.get("security_score")]
            avg_security_score = sum(security_scores) / len(security_scores) if security_scores else 100
            
            if avg_security_score < 40 or critical_issues > 10:
                security_risk_level = "critical"
            elif avg_security_score < 60 or critical_issues > 5:
                security_risk_level = "high"
            elif avg_security_score < 80 or high_issues > 20:
                security_risk_level = "medium"
            else:
                security_risk_level = "low"
            
            # Estimate technical debt (simplified: 2 hours per critical, 1 hour per high, 0.5 per medium)
            technical_debt_hours = (
                critical_issues * 2 +
                high_issues * 1 +
                sum(a.get("medium_issues", 0) for a in latest_analyses.values()) * 0.5
            )
            
            return {
                "organization_id": organization_id,
                "total_repositories": total_repos,
                "overall_health_score": round(overall_health_score, 2),
                "total_issues": total_issues,
                "critical_issues": critical_issues,
                "high_issues": high_issues,
                "security_risk_level": security_risk_level,
                "average_security_score": round(avg_security_score, 2),
                "technical_debt_hours": round(technical_debt_hours, 2),
                "analyzed_repositories": len(latest_analyses)
            }
        except Exception as e:
            logger.error(f"Error getting organization overview: {e}")
            return {}

    async def get_business_risk_score(
        self,
        organization_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Calculate business risk score based on technical metrics."""
        try:
            overview = await self.get_organization_overview(organization_id, user_id)
            
            if not overview:
                return {"risk_score": 0, "risk_level": "unknown"}
            
            # Calculate risk score (0-100, higher is riskier)
            risk_score = 0
            
            # Critical issues contribute heavily
            if overview.get("critical_issues", 0) > 0:
                risk_score += min(40, overview["critical_issues"] * 4)
            
            # Security score contributes
            security_score = overview.get("average_security_score", 100)
            risk_score += (100 - security_score) * 0.3
            
            # Overall health score contributes
            health_score = overview.get("overall_health_score", 100)
            risk_score += (100 - health_score) * 0.2
            
            # Technical debt contributes
            debt_hours = overview.get("technical_debt_hours", 0)
            if debt_hours > 100:
                risk_score += 10
            elif debt_hours > 50:
                risk_score += 5
            
            risk_score = min(100, risk_score)
            
            # Determine risk level
            if risk_score >= 70:
                risk_level = "critical"
            elif risk_score >= 50:
                risk_level = "high"
            elif risk_score >= 30:
                risk_level = "medium"
            else:
                risk_level = "low"
            
            return {
                "risk_score": round(risk_score, 2),
                "risk_level": risk_level,
                "factors": {
                    "critical_issues": overview.get("critical_issues", 0),
                    "security_score": overview.get("average_security_score", 100),
                    "health_score": overview.get("overall_health_score", 100),
                    "technical_debt_hours": overview.get("technical_debt_hours", 0)
                }
            }
        except Exception as e:
            logger.error(f"Error calculating business risk score: {e}")
            return {"risk_score": 0, "risk_level": "unknown"}

    async def get_top_risk_areas(
        self,
        organization_id: str,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get repositories/files with most critical issues."""
        try:
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            repos = await org_service.get_organization_repositories(organization_id, user_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return []
            
            # Get latest analyses
            analyses_result = self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute()
            analyses = analyses_result.data or []
            
            # Get latest per repo
            latest_analyses = {}
            for analysis in analyses:
                repo_id = analysis["repository_id"]
                if repo_id not in latest_analyses:
                    latest_analyses[repo_id] = analysis
            
            # Get critical issues for these analyses
            analysis_ids = [a["id"] for a in latest_analyses.values()]
            
            if not analysis_ids:
                return []
            
            issues_result = self.db.table("issues").select("*, analysis_results(repository_id)").in_("analysis_id", analysis_ids).eq("severity", "critical").order("created_at", desc=True).limit(limit * 5).execute()
            issues = issues_result.data or []
            
            # Group by repository and file
            risk_areas = {}
            
            for issue in issues:
                repo_id = issue.get("analysis_results", {}).get("repository_id")
                file_path = issue.get("file_path", "unknown")
                
                key = f"{repo_id}:{file_path}"
                if key not in risk_areas:
                    risk_areas[key] = {
                        "repository_id": repo_id,
                        "file_path": file_path,
                        "critical_issues": 0,
                        "high_issues": 0,
                        "total_issues": 0
                    }
                
                if issue["severity"] == "critical":
                    risk_areas[key]["critical_issues"] += 1
                elif issue["severity"] == "high":
                    risk_areas[key]["high_issues"] += 1
                risk_areas[key]["total_issues"] += 1
            
            # Sort by critical issues, then high issues
            sorted_areas = sorted(
                risk_areas.values(),
                key=lambda x: (x["critical_issues"], x["high_issues"]),
                reverse=True
            )[:limit]
            
            # Add repository names
            repo_map = {r["id"]: r for r in repos}
            for area in sorted_areas:
                repo = repo_map.get(area["repository_id"], {})
                area["repository_name"] = repo.get("name", "Unknown")
                area["repository_full_name"] = repo.get("full_name", "Unknown")
            
            return sorted_areas
        except Exception as e:
            logger.error(f"Error getting top risk areas: {e}")
            return []

    async def get_compliance_status(
        self,
        organization_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Get compliance status checklist."""
        try:
            overview = await self.get_organization_overview(organization_id, user_id)
            
            if not overview:
                return {}
            
            # Simple compliance checks based on security and quality scores
            security_score = overview.get("average_security_score", 100)
            health_score = overview.get("overall_health_score", 100)
            critical_issues = overview.get("critical_issues", 0)
            
            compliance = {
                "security_compliant": security_score >= 70 and critical_issues == 0,
                "code_quality_compliant": health_score >= 70,
                "no_critical_vulnerabilities": critical_issues == 0,
                "overall_compliant": security_score >= 70 and health_score >= 70 and critical_issues == 0,
                "checks": {
                    "security_score_above_threshold": security_score >= 70,
                    "health_score_above_threshold": health_score >= 70,
                    "no_critical_issues": critical_issues == 0,
                    "repositories_analyzed": overview.get("analyzed_repositories", 0) > 0
                }
            }
            
            return compliance
        except Exception as e:
            logger.error(f"Error getting compliance status: {e}")
            return {}
