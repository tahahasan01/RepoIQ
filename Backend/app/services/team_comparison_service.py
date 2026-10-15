import asyncio
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
                # Only teams of THIS organization: a caller may belong to
                # several, and another organization's team must not be reported
                # as part of this one's comparison. Access to the organization
                # was established above, and that is all get_team checks - so
                # one query replaces a get_team (up to four queries) per id.
                teams = (await run_blocking(
                    self.db.table("teams").select("*")
                    .in_("id", list(team_ids)).eq("organization_id", org["id"]).execute
                )).data or []
                order = {str(t).lower(): i for i, t in enumerate(team_ids)}
                teams.sort(key=lambda t: order.get(t["id"], len(order)))  # as requested
            else:
                teams = await team_service.list_organization_teams(organization_id, user_id)

            # Only teams the caller is on (or all, for the organization owner):
            # another team's metrics are computed from repositories shared with
            # that team, not with the caller.
            teams = await team_service.teams_user_is_on(teams, user_id)
            if not teams:
                return []

            metrics = await self._metrics_for_teams([t["id"] for t in teams])
            return [
                {**metrics[team["id"]], "team_id": team["id"], "team_name": team["name"]}
                for team in teams
            ]
        except Exception as e:
            logger.error(f"Error comparing teams: {e}")
            return []

    async def _metrics_for_teams(self, team_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        {team_id: metrics} for teams the caller has ALREADY been authorised to
        see (is_on_team / teams_user_is_on). This method checks nothing.

        PERF: at most four queries (two of them concurrent) whatever the number
        of teams. The metrics used to be computed one team at a time, each pass
        re-running the team access checks: ~12 sequential queries per team, 95
        for an eight-team organization's comparison.
        """
        if not team_ids:
            return {}

        assignments, members = await asyncio.gather(
            run_blocking(
                self.db.table("repository_assignments").select("team_id, repository_id")
                .in_("team_id", team_ids).execute
            ),
            run_blocking(self.db.table("team_members").select("team_id").in_("team_id", team_ids).execute),
        )
        repos_by_team: Dict[str, set] = {t: set() for t in team_ids}
        for row in assignments.data or []:
            repos_by_team[row["team_id"]].add(row["repository_id"])
        # Team size does not depend on repositories: a team that has not been
        # assigned a repository yet still has people.
        team_size: Dict[str, int] = {t: 0 for t in team_ids}
        for row in members.data or []:
            team_size[row["team_id"]] += 1

        repo_ids = sorted(set().union(*repos_by_team.values()))
        latest: Dict[str, Dict[str, Any]] = {}
        fixed_by_analysis: Dict[str, int] = {}
        if repo_ids:
            analyses = (await run_blocking(
                self.db.table("analysis_results")
                .select("id, repository_id, overall_score, total_issues, critical_issues")
                .in_("repository_id", repo_ids).eq("status", "completed")
                .order("completed_at", desc=True).execute
            )).data or []
            for analysis in analyses:
                latest.setdefault(analysis["repository_id"], analysis)

            # Velocity (simplified): findings on the latest analyses fixed in
            # the last 30 days.
            if latest:
                thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).isoformat()
                fixed = (await run_blocking(
                    self.db.table("issues").select("analysis_id")
                    .in_("analysis_id", [a["id"] for a in latest.values()])
                    .eq("fixed", True).gte("fix_applied_at", thirty_days_ago).execute
                )).data or []
                for row in fixed:
                    fixed_by_analysis[row["analysis_id"]] = fixed_by_analysis.get(row["analysis_id"], 0) + 1

        result: Dict[str, Dict[str, Any]] = {}
        for team_id in team_ids:
            team_repos = repos_by_team[team_id]
            if not team_repos:
                result[team_id] = {
                    "total_repositories": 0,
                    "overall_score": 0,
                    "total_issues": 0,
                    "critical_issues": 0,
                    "team_size": team_size[team_id],
                    "velocity": 0
                }
                continue

            team_latest = [latest[r] for r in team_repos if r in latest]
            scores = [a.get("overall_score", 0) for a in team_latest if a.get("overall_score")]
            overall_score = sum(scores) / len(scores) if scores else 0
            result[team_id] = {
                "total_repositories": len(team_repos),
                "overall_score": round(overall_score, 2),
                "total_issues": sum(a.get("total_issues", 0) for a in team_latest),
                "critical_issues": sum(a.get("critical_issues", 0) for a in team_latest),
                "team_size": team_size[team_id],
                "velocity": sum(fixed_by_analysis.get(a["id"], 0) for a in team_latest)
            }
        return result

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
        """Get team health trends over time, for people on the team."""
        try:
            from app.services.team_service import TeamService

            repos = await TeamService().get_team_repositories(team_id, user_id)
            return await self._health_trends([r["id"] for r in repos], days)
        except Exception as e:
            logger.error(f"Error getting team health trends: {e}")
            return []

    async def _health_trends(self, repo_ids: List[str], days: int) -> List[Dict[str, Any]]:
        """
        Daily average score and issue count across these repositories. No access
        check: the caller must already be authorised for them.
        """
        try:
            if not repo_ids:
                return []

            # Get analyses in time period
            start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
            analyses_result = (await run_blocking(
                self.db.table("analysis_results").select("overall_score, total_issues, completed_at")
                .in_("repository_id", repo_ids).eq("status", "completed")
                .gte("completed_at", start_date).order("completed_at").execute
            ))
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
