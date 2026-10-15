"""
The team page's data: team-scoped summaries of assigned repositories.

Repository reads are owner-only everywhere else, so a team member saw that a
teammate's repository was on the team and nothing about it.
"""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


@pytest.fixture
def team_setup(db, user):  # noqa: F811
    """Alice owns the org and a repository on its team; Bob is a team member."""
    bob = db.table("users").insert({"email": "bob@example.com", "full_name": "Bob"}).execute().data[0]
    org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
    team = db.table("teams").insert({"organization_id": org["id"], "name": "Core"}).execute().data[0]
    db.table("team_members").insert({"team_id": team["id"], "user_id": bob["id"], "role": "member"}).execute()
    repo = db.table("repositories").insert({
        "user_id": user["id"], "github_repo_id": 11, "name": "api", "full_name": "alice/api",
    }).execute().data[0]
    private = db.table("repositories").insert({
        "user_id": user["id"], "github_repo_id": 12, "name": "diary", "full_name": "alice/diary",
    }).execute().data[0]
    db.table("repository_assignments").insert(
        {"repository_id": repo["id"], "team_id": team["id"], "assigned_by": user["id"]}
    ).execute()
    db.table("analysis_results").insert({
        "repository_id": repo["id"], "status": "completed", "overall_score": 81,
        "total_issues": 4, "critical_issues": 1, "completed_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    start = datetime.now(timezone.utc) - timedelta(days=3)
    for repo_id, commits in ((repo["id"], 5), (private["id"], 50)):
        db.table("developer_contributions").insert({
            "user_id": bob["id"], "repository_id": repo_id, "commits_count": commits,
            "period_start": start.isoformat(), "period_end": (start + timedelta(days=7)).isoformat(),
        }).execute()
    return {"bob": bob, "team": team, "repo": repo, "private": private}


@requires_db
class TestSummary:

    def test_a_member_sees_the_teams_repositories_and_scores(self, db, user, team_setup):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService

        summary = asyncio.run(TeamInsightsService().get_summary(team_setup["team"]["id"], team_setup["bob"]["id"]))

        repos = {r["full_name"]: r for r in summary["repositories"]}
        assert list(repos) == ["alice/api"]                      # not the unassigned one
        assert repos["alice/api"]["latest_analysis"]["overall_score"] == 81
        assert summary["metrics"]["total_repositories"] == 1

    def test_member_figures_count_only_team_repositories(self, db, user, team_setup):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService

        summary = asyncio.run(TeamInsightsService().get_summary(team_setup["team"]["id"], user["id"]))

        bob = next(m for m in summary["members"] if m["user_id"] == team_setup["bob"]["id"])
        assert bob["total_commits"] == 5  # the 50 in an unassigned repository are not the team's

    def test_other_teams_in_the_organization_get_nothing(self, db, user, team_setup):  # noqa: F811
        """Sharing a repository with a team is not sharing it with the whole company."""
        from app.services.team_insights_service import TeamInsightsService

        carol = db.table("users").insert({"email": "carol@example.com"}).execute().data[0]
        other_team = db.table("teams").insert(
            {"organization_id": team_setup["team"]["organization_id"], "name": "Other"}
        ).execute().data[0]
        db.table("team_members").insert({"team_id": other_team["id"], "user_id": carol["id"], "role": "member"}).execute()

        assert asyncio.run(TeamInsightsService().get_summary(team_setup["team"]["id"], carol["id"])) is None

    def test_outsiders_get_nothing(self, db, user, team_setup):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService

        outsider = db.table("users").insert({"email": "eve@example.com"}).execute().data[0]
        assert asyncio.run(TeamInsightsService().get_summary(team_setup["team"]["id"], outsider["id"])) is None


@requires_db
class TestUnassign:

    def test_owner_can_unassign(self, db, user, team_setup):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService

        ok = asyncio.run(TeamInsightsService().unassign_repository(
            team_setup["team"]["id"], team_setup["repo"]["id"], user["id"]
        ))
        assert ok
        assert not db.table("repository_assignments").select("id") \
            .eq("team_id", team_setup["team"]["id"]).execute().data

    def test_a_plain_member_cannot_unassign_someone_elses_repository(self, db, user, team_setup):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService

        ok = asyncio.run(TeamInsightsService().unassign_repository(
            team_setup["team"]["id"], team_setup["repo"]["id"], team_setup["bob"]["id"]
        ))
        assert not ok
        assert db.table("repository_assignments").select("id") \
            .eq("team_id", team_setup["team"]["id"]).execute().data


@requires_db
class TestTeamScopedVisibility:
    """
    Repositories assigned to a team are shared with that team. These listings
    used to show them to anyone in the organization.
    """

    def _carol_on_other_team(self, db, team_setup):  # noqa: F811
        carol = db.table("users").insert({"email": "carol@example.com"}).execute().data[0]
        other = db.table("teams").insert(
            {"organization_id": team_setup["team"]["organization_id"], "name": "Other"}
        ).execute().data[0]
        db.table("team_members").insert({"team_id": other["id"], "user_id": carol["id"], "role": "member"}).execute()
        return carol

    def test_team_repositories(self, db, user, team_setup):  # noqa: F811
        from app.services.team_service import TeamService

        carol = self._carol_on_other_team(db, team_setup)
        assert asyncio.run(TeamService().get_team_repositories(team_setup["team"]["id"], carol["id"])) == []
        member_view = asyncio.run(TeamService().get_team_repositories(team_setup["team"]["id"], team_setup["bob"]["id"]))
        assert [r["id"] for r in member_view] == [team_setup["repo"]["id"]]

    def test_organization_repositories(self, db, user, team_setup):  # noqa: F811
        from app.services.organization_service import OrganizationService

        carol = self._carol_on_other_team(db, team_setup)
        org_id = team_setup["team"]["organization_id"]

        assert asyncio.run(OrganizationService().get_organization_repositories(org_id, carol["id"])) == []
        owner_view = asyncio.run(OrganizationService().get_organization_repositories(org_id, user["id"]))
        assert [r["id"] for r in owner_view] == [team_setup["repo"]["id"]]

    def test_team_comparison(self, db, user, team_setup):  # noqa: F811
        from app.services.team_comparison_service import TeamComparisonService

        carol = self._carol_on_other_team(db, team_setup)
        org_id = team_setup["team"]["organization_id"]

        names = [t["team_name"] for t in asyncio.run(TeamComparisonService().compare_teams(org_id, carol["id"]))]
        assert names == ["Other"]
