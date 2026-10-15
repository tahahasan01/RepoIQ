"""
Developer contribution metrics.

Read-only: developer_contributions is written by
app/services/repository_insights.py after each analysis, one row per
developer per week. Every figure here is a sum over those weekly rows, so it
can be traced back to GitHub's own contributor statistics and the blame of the
reviewed files.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.db.postgres import get_service_db
from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

logger = get_logger(__name__)


def _summarise(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    commits = sum(r.get("commits_count") or 0 for r in rows)
    introduced = sum(r.get("issues_introduced") or 0 for r in rows)
    return {
        "total_commits": commits,
        "total_lines_added": sum(r.get("lines_added") or 0 for r in rows),
        "total_lines_removed": sum(r.get("lines_removed") or 0 for r in rows),
        # Findings in the reviewed code whose lines this developer's commits
        # last touched (issue_blame). Not a judgement of the person: it is
        # where findings sit, and it is only as broad as the analysis sample.
        "total_issues_introduced": introduced,
        "issues_per_100_commits": round(introduced / commits * 100, 1) if commits else None,
        "repositories": len({r["repository_id"] for r in rows}),
    }


class DeveloperAnalyticsService:
    def __init__(self):
        self.db = get_service_db()

    async def _contributions(
        self,
        user_ids: List[str],
        period_days: int,
        repository_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Weekly rows for these users. repository_ids=None means every repository
        (only ever for a developer viewing themselves); a list restricts to it,
        and an empty list means nothing is visible.
        """
        if not user_ids or repository_ids == []:
            return []
        since = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()

        def _query():
            query = self.db.table("developer_contributions").select(
                "user_id, repository_id, commits_count, lines_added, lines_removed, issues_introduced"
            ).in_("user_id", user_ids).gte("period_start", since)
            if repository_ids is not None:
                query = query.in_("repository_id", repository_ids)
            return query.execute()

        return (await run_blocking(_query)).data or []

    async def _organization_repository_ids(self, organization_ids: List[str]) -> List[str]:
        """Repositories assigned to any team in these organizations."""
        if not organization_ids:
            return []
        teams = (await run_blocking(
            self.db.table("teams").select("id").in_("organization_id", organization_ids).execute
        )).data or []
        if not teams:
            return []
        assignments = (await run_blocking(
            self.db.table("repository_assignments").select("repository_id")
            .in_("team_id", [t["id"] for t in teams]).execute
        )).data or []
        return sorted({a["repository_id"] for a in assignments})

    async def get_developer_performance(
        self,
        user_id: str,
        viewer_id: str,
        repository_id: Optional[str] = None,
        period_days: int = 30,
    ) -> Dict[str, Any]:
        """
        One developer's totals over the trailing period, as `viewer_id` may see them.

        SECURITY: a developer sees all of their own activity. Anyone else sees
        only activity in repositories assigned to teams of an organization they
        both belong to - a colleague's private side projects are not the org's
        business. (Whether the viewer may look at this developer at all, and
        owns repository_id, is checked by the route.)
        """
        from app.services.organization_service import OrganizationService

        if repository_id:
            scope: Optional[List[str]] = [repository_id]
        elif viewer_id == user_id:
            scope = None
        else:
            orgs = OrganizationService()
            shared = (
                {o["id"] for o in await orgs.list_user_organizations(viewer_id)}
                & {o["id"] for o in await orgs.list_user_organizations(user_id)}
            )
            scope = await self._organization_repository_ids(sorted(shared))

        rows = await self._contributions([user_id], period_days, scope)
        now = datetime.now(timezone.utc)
        return {
            "user_id": user_id,
            "period_start": (now - timedelta(days=period_days)).isoformat(),
            "period_end": now.isoformat(),
            **_summarise(rows),
        }

    async def get_organization_developers(
        self,
        organization_id: str,
        user_id: str,
        period_days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Every team member in an organization the caller belongs to, with totals."""
        from app.services.organization_service import OrganizationService

        org = await OrganizationService().get_organization(organization_id, user_id)
        if not org:
            return []

        teams = (await run_blocking(
            self.db.table("teams").select("id").eq("organization_id", organization_id).execute
        )).data or []
        team_ids = [t["id"] for t in teams]
        if not team_ids:
            return []

        members = (await run_blocking(
            self.db.table("team_members").select("user_id").in_("team_id", team_ids).execute
        )).data or []
        member_ids = sorted({m["user_id"] for m in members})
        if not member_ids:
            return []

        # Only this organization's repositories: members' activity elsewhere is
        # not visible to the organization. A handful of queries for the whole
        # organization, not two per developer.
        rows = await self._contributions(
            member_ids, period_days, await self._organization_repository_ids([organization_id])
        )
        people = (await run_blocking(
            self.db.table("users").select(TEAM_MEMBER_USER_COLUMNS).in_("id", member_ids).execute
        )).data or []

        by_user: Dict[str, List[Dict[str, Any]]] = {uid: [] for uid in member_ids}
        for row in rows:
            by_user[row["user_id"]].append(row)

        return [
            {**person, "user_id": person["id"], **_summarise(by_user.get(person["id"], []))}
            for person in people
        ]

    async def get_repository_contributors(
        self, repository_id: str, user_id: str, period_days: int = 90
    ) -> List[Dict[str, Any]]:
        """Contributors to a repository the caller owns, busiest first."""
        from app.services.repository_service import RepositoryService

        repo = await RepositoryService().get_repository(repository_id, user_id)
        if not repo:
            return []

        since = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
        # SECURITY: explicit column allowlist. users(*) returns the ENTIRE user
        # row - including the GitHub token and email - for every joined developer
        # (AUDIT.md C-4).
        rows = (await run_blocking(
            self.db.table("developer_contributions").select(
                f"user_id, repository_id, commits_count, lines_added, lines_removed, "
                f"issues_introduced, users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("repository_id", repo["id"]).gte("period_start", since).execute
        )).data or []

        grouped: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            entry = grouped.setdefault(row["user_id"], {"user": row.get("users"), "rows": []})
            entry["rows"].append(row)

        contributors = [
            {"user_id": uid, "user": entry["user"], **_summarise(entry["rows"])}
            for uid, entry in grouped.items()
        ]
        contributors.sort(key=lambda c: c["total_commits"], reverse=True)
        return contributors
