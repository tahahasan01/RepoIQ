"""
Everything the team page shows, in one call.

A repository assigned to a team is shared with that team: its owner chose to
assign it. But every repository read elsewhere is owner-only, so a team member
could see that a teammate's repository was on the team and nothing about it -
which is why the team page was a wall of "--". This module is the team-scoped
read. It returns summaries only - scores, counts, contribution totals - never
file contents, findings text or anything else the owner-only endpoints guard.

SECURITY: access is being ON the team (a member, its manager, or the
organization's owner) - not TeamService.get_team, which admits anyone in the
organization. Sharing a repository with a team is not sharing it with every
other team in the company.

It composes existing pieces rather than re-deriving them:
TeamComparisonService for the team metrics and trends, and
DeveloperAnalyticsService for contribution totals.
"""
from typing import Any, Dict, List, Optional

from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.db.postgres import get_service_db
from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

logger = get_logger(__name__)

_ANALYSIS_SUMMARY_COLUMNS = (
    "id, repository_id, overall_score, security_score, quality_score, architecture_score, "
    "documentation_score, total_issues, critical_issues, high_issues, files_analyzed, "
    "files_eligible, completed_at"
)


class TeamInsightsService:
    def __init__(self):
        self.db = get_service_db()

    async def _on_team(self, team: Dict[str, Any], user_id: str) -> bool:
        if team.get("manager_id") == user_id:
            return True
        member = (await run_blocking(
            self.db.table("team_members").select("id")
            .eq("team_id", team["id"]).eq("user_id", user_id).execute
        )).data
        if member:
            return True
        org = (await run_blocking(
            self.db.table("organizations").select("owner_id").eq("id", team["organization_id"]).execute
        )).data
        return bool(org) and org[0]["owner_id"] == user_id

    async def get_summary(self, team_id: str, user_id: str, period_days: int = 30) -> Optional[Dict[str, Any]]:
        from app.services.developer_analytics_service import DeveloperAnalyticsService, _summarise
        from app.services.team_comparison_service import TeamComparisonService
        from app.services.team_service import TeamService

        teams = TeamService()
        team = await teams.get_team(team_id, user_id)
        if not team or not await self._on_team(team, user_id):
            return None

        repositories = await teams.get_team_repositories(team_id, user_id)
        repo_ids = [r["id"] for r in repositories]

        latest: Dict[str, Dict[str, Any]] = {}
        if repo_ids:
            analyses = (await run_blocking(
                self.db.table("analysis_results").select(_ANALYSIS_SUMMARY_COLUMNS)
                .in_("repository_id", repo_ids).eq("status", "completed")
                .order("completed_at", desc=True).execute
            )).data or []
            for analysis in analyses:
                latest.setdefault(analysis["repository_id"], analysis)

        members = (await run_blocking(
            self.db.table("team_members")
            .select(f"user_id, role, created_at, users({TEAM_MEMBER_USER_COLUMNS})")
            .eq("team_id", team_id).execute
        )).data or []
        member_ids = [m["user_id"] for m in members]

        # Contributions to THIS team's repositories only.
        rows = await DeveloperAnalyticsService()._contributions(member_ids, period_days, repo_ids)
        by_member: Dict[str, List[Dict[str, Any]]] = {uid: [] for uid in member_ids}
        for row in rows:
            by_member.setdefault(row["user_id"], []).append(row)

        comparison = TeamComparisonService()
        metrics = await comparison._get_team_metrics(team_id, user_id)
        trends = await comparison.get_team_health_trends(team_id, user_id, days=max(period_days, 30))

        return {
            "team": team,
            "period_days": period_days,
            "metrics": metrics,
            "trends": trends,
            "repositories": [
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "full_name": r.get("full_name"),
                    "language": r.get("language"),
                    "is_private": r.get("is_private"),
                    "owner_id": r.get("user_id"),
                    "latest_analysis": latest.get(r["id"]),
                }
                for r in repositories
            ],
            "members": [
                {
                    "user_id": m["user_id"],
                    "role": m["role"],
                    "joined_at": m.get("created_at"),
                    "user": m.get("users"),
                    **_summarise(by_member.get(m["user_id"], [])),
                }
                for m in members
            ],
        }

    async def unassign_repository(self, team_id: str, repository_id: str, user_id: str) -> bool:
        """
        Remove a repository from a team: its owner, or a team admin, may.
        There was no way to do this at all - assignment was one-way.
        """
        from app.services.team_service import TeamService

        teams = TeamService()
        team = await teams.get_team(team_id, user_id)
        if not team:
            return False

        repo = (await run_blocking(
            self.db.table("repositories").select("id, user_id").eq("id", repository_id).execute
        )).data
        if not repo:
            return False
        if repo[0]["user_id"] != user_id and not await teams._is_team_admin(team, user_id):
            return False

        deleted = (await run_blocking(
            self.db.table("repository_assignments").delete()
            .eq("team_id", team_id).eq("repository_id", repository_id).execute
        )).data or []
        if deleted:
            from app.services.organization_service import OrganizationService

            await OrganizationService().log_audit_event(
                team["organization_id"], user_id, "repository_unassigned",
                repository_id=repository_id, details={"team_id": team_id},
            )
        return bool(deleted)
