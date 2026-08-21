from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.db.postgres import get_service_db
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)


class TeamComparisonService:
    def __init__(self):
        self.db = get_service_db()

    async def compare_teams(
        self,
        organization_id: str,
        user_id: str,
        team_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Compare teams side-by-side."""
        try:
            # Verify access
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, user_id)
            if not org:
                return []
            
            # Get teams to compare
            from app.services.team_service import TeamService
            team_service = TeamService()
            
            if team_ids:
                teams = []
                for team_id in team_ids:
                    team = await team_service.get_team(team_id, user_id)
                    if team:
                        teams.append(team)
            else:
                teams = await team_service.list_organization_teams(organization_id, user_id)
            
            if not teams:
                return []
            
            # Get metrics for each team
            team_metrics = []
            for team in teams:
                metrics = await self._get_team_metrics(team["id"], user_id)
                metrics["team_id"] = team["id"]
                metrics["team_name"] = team["name"]
                team_metrics.append(metrics)
            
            return team_metrics
        except Exception as e:
            logger.error(f"Error comparing teams: {e}")
            return []

    async def _get_team_metrics(
        self,
        team_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Get metrics for a single team."""
        try:
            from app.services.team_service import TeamService
            team_service = TeamService()
            
            # Get team repositories
            repos = await team_service.get_team_repositories(team_id, user_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return {
                    "total_repositories": 0,
                    "overall_score": 0,
                    "total_issues": 0,
                    "critical_issues": 0,
                    "team_size": 0,
                    "velocity": 0
                }
            
            # Get latest analyses
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").order("completed_at", desc=True).execute))
            analyses = analyses_result.data or []
            
            # Get latest per repo
            latest_analyses = {}
            for analysis in analyses:
                repo_id = analysis["repository_id"]
                if repo_id not in latest_analyses:
                    latest_analyses[repo_id] = analysis
            
            # Calculate metrics
            total_repos = len(repos)
            total_issues = sum(a.get("total_issues", 0) for a in latest_analyses.values())
            critical_issues = sum(a.get("critical_issues", 0) for a in latest_analyses.values())
            
            scores = [a.get("overall_score", 0) for a in latest_analyses.values() if a.get("overall_score")]
            overall_score = sum(scores) / len(scores) if scores else 0
            
            # Get team size
            members_result = (await run_blocking(self.db.table("team_members").select("user_id").eq("team_id", team_id).execute))
            team_size = len(members_result.data or [])
            
            # Calculate velocity (simplified: based on issues fixed)
            # Get issues fixed in last 30 days
            thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
            fixed_issues_result = (await run_blocking(self.db.table("issues").select("id").in_("analysis_id", [a["id"] for a in latest_analyses.values()]).eq("fixed", True).gte("fix_applied_at", thirty_days_ago).execute))
            velocity = len(fixed_issues_result.data or [])
            
            return {
                "total_repositories": total_repos,
                "overall_score": round(overall_score, 2),
                "total_issues": total_issues,
                "critical_issues": critical_issues,
                "team_size": team_size,
                "velocity": velocity
            }
        except Exception as e:
            logger.error(f"Error getting team metrics: {e}")
            return {}

    async def get_team_leaderboard(
        self,
        organization_id: str,
        user_id: str,
        metric: str = "overall_score"
    ) -> List[Dict[str, Any]]:
        """Get team leaderboard ranked by metric."""
        try:
            # Get all teams
            team_comparison = await self.compare_teams(organization_id, user_id)
            
            if not team_comparison:
                return []
            
            # Sort by metric
            valid_metrics = ["overall_score", "velocity", "total_issues", "critical_issues"]
            if metric not in valid_metrics:
                metric = "overall_score"
            
            # For issues, lower is better, so reverse sort
            reverse = metric != "overall_score" and metric != "velocity"
            
            sorted_teams = sorted(
                team_comparison,
                key=lambda x: x.get(metric, 0),
                reverse=not reverse
            )
            
            # Add rank
            for idx, team in enumerate(sorted_teams, 1):
                team["rank"] = idx
            
            return sorted_teams
        except Exception as e:
            logger.error(f"Error getting team leaderboard: {e}")
            return []

    async def get_team_health_trends(
        self,
        team_id: str,
        user_id: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """Get team health trends over time."""
        try:
            from app.services.team_service import TeamService
            team_service = TeamService()
            
            repos = await team_service.get_team_repositories(team_id, user_id)
            repo_ids = [r["id"] for r in repos]
            
            if not repo_ids:
                return []
            
            # Get analyses in time period
            start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("*").in_("repository_id", repo_ids).eq("status", "completed").gte("completed_at", start_date).order("completed_at", asc=True).execute))
            analyses = analyses_result.data or []
            
            # Group by date (daily)
            trends = {}
            for analysis in analyses:
                completed_at = analysis.get("completed_at")
                if completed_at:
                    date_key = completed_at[:10]  # YYYY-MM-DD
                    if date_key not in trends:
                        trends[date_key] = {
                            "date": date_key,
                            "scores": [],
                            "issues": []
                        }
                    
                    if analysis.get("overall_score"):
                        trends[date_key]["scores"].append(analysis["overall_score"])
                    trends[date_key]["issues"].append(analysis.get("total_issues", 0))
            
            # Calculate averages per day
            trend_list = []
            for date_key in sorted(trends.keys()):
                day_data = trends[date_key]
                avg_score = sum(day_data["scores"]) / len(day_data["scores"]) if day_data["scores"] else 0
                avg_issues = sum(day_data["issues"]) / len(day_data["issues"]) if day_data["issues"] else 0
                
                trend_list.append({
                    "date": date_key,
                    "average_score": round(avg_score, 2),
                    "average_issues": round(avg_issues, 2)
                })
            
            return trend_list
        except Exception as e:
            logger.error(f"Error getting team health trends: {e}")
            return []
