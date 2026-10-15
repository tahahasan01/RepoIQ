"""
Latency regressions: the query shapes behind the organization, team and
documentation pages.

Measured on a seeded eight-team organization before these fixes: the executive
team comparison ran 95 sequential queries (420ms against a local database), the
team page 33 (132ms), and GET /architecture ran a model completion on every
request (~12s). The tests pin the shape - queries that do not grow with the
number of teams or repositories, and a diagram generated once per file tree -
rather than wall-clock times, which depend on the machine.
"""
import contextlib
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


@contextlib.contextmanager
def count_queries(monkeypatch):
    """Count every statement the query builder sends to PostgreSQL."""
    from app.db.query_builder import QueryBuilder

    counter = {"n": 0}
    original = QueryBuilder.execute

    def counting(self):
        counter["n"] += 1
        return original(self)

    monkeypatch.setattr(QueryBuilder, "execute", counting)
    try:
        yield counter
    finally:
        monkeypatch.setattr(QueryBuilder, "execute", original)


def _seed_org(db, owner, member, teams: int, repos_per_team: int = 2):  # noqa: F811
    """`teams` teams, each with `member` on it and repositories with a scored analysis."""
    org = db.table("organizations").insert({"name": "Acme", "owner_id": owner["id"]}).execute().data[0]
    now = datetime.now(timezone.utc)
    rows = []
    for t in range(teams):
        team = db.table("teams").insert({"organization_id": org["id"], "name": f"T{t}"}).execute().data[0]
        db.table("team_members").insert({"team_id": team["id"], "user_id": member["id"]}).execute()
        for r in range(repos_per_team):
            gh = t * 100 + r + 1
            repo = db.table("repositories").insert({
                "user_id": owner["id"], "github_repo_id": gh, "name": f"r{gh}", "full_name": f"o/r{gh}",
            }).execute().data[0]
            db.table("repository_assignments").insert(
                {"repository_id": repo["id"], "team_id": team["id"], "assigned_by": owner["id"]}
            ).execute()
            older = db.table("analysis_results").insert({
                "repository_id": repo["id"], "status": "completed", "overall_score": 10,
                "total_issues": 99, "critical_issues": 9, "completed_at": (now - timedelta(days=5)).isoformat(),
            }).execute().data[0]
            latest = db.table("analysis_results").insert({
                "repository_id": repo["id"], "status": "completed", "overall_score": 60 + t,
                "total_issues": 4, "critical_issues": 1, "completed_at": now.isoformat(),
            }).execute().data[0]
            db.table("issues").insert([
                {"analysis_id": latest["id"], "agent_type": "security", "severity": "critical",
                 "fixed": True, "fix_applied_at": now.isoformat()},
                {"analysis_id": latest["id"], "agent_type": "quality", "severity": "low"},
                # A fix on a superseded analysis is not this team's current velocity.
                {"analysis_id": older["id"], "agent_type": "quality", "severity": "low",
                 "fixed": True, "fix_applied_at": now.isoformat()},
            ]).execute()
        rows.append(team)
    return org, rows


def _person(db, name):  # noqa: F811
    return db.table("users").insert({"email": f"{name}@example.com", "full_name": name}).execute().data[0]


@requires_db
class TestTeamComparisonIsSetBased:

    async def _compare_count(self, db, monkeypatch, teams):  # noqa: F811
        from app.services.team_comparison_service import TeamComparisonService

        # A member, not the owner: the per-team membership check is the path
        # that used to cost the most.
        owner, member = _person(db, f"owner{teams}"), _person(db, f"member{teams}")
        org, _ = _seed_org(db, owner, member, teams)
        with count_queries(monkeypatch) as counter:
            result = await TeamComparisonService().compare_teams(org["id"], member["id"])
        return result, counter["n"]

    async def test_query_count_does_not_grow_with_the_number_of_teams(self, db, monkeypatch):  # noqa: F811
        small, small_queries = await self._compare_count(db, monkeypatch, teams=2)
        large, large_queries = await self._compare_count(db, monkeypatch, teams=6)

        assert len(small) == 2 and len(large) == 6
        assert large_queries == small_queries
        assert large_queries <= 13  # was ~12 per team: 95 for eight teams

    async def test_metrics_are_each_teams_latest_analyses(self, db, user, monkeypatch):  # noqa: F811
        from app.services.team_comparison_service import TeamComparisonService

        member = _person(db, "bob")
        org, teams = _seed_org(db, user, member, teams=3)
        empty = db.table("teams").insert({"organization_id": org["id"], "name": "Empty"}).execute().data[0]
        db.table("team_members").insert({"team_id": empty["id"], "user_id": member["id"]}).execute()

        result = {t["team_name"]: t for t in await TeamComparisonService().compare_teams(org["id"], user["id"])}

        assert result["T1"] == {
            "team_id": teams[1]["id"], "team_name": "T1",
            "total_repositories": 2, "overall_score": 61, "total_issues": 8, "critical_issues": 2,
            "team_size": 1, "velocity": 2,
        }
        # A team with people but no repositories still reports its size.
        assert result["Empty"]["team_size"] == 1 and result["Empty"]["total_repositories"] == 0

    async def test_selected_teams_keep_the_requested_order_and_organization(self, db, user):  # noqa: F811
        from app.services.team_comparison_service import TeamComparisonService

        member = _person(db, "bob")
        org, teams = _seed_org(db, user, member, teams=3, repos_per_team=1)
        elsewhere = db.table("organizations").insert({"name": "Other", "owner_id": user["id"]}).execute().data[0]
        foreign = db.table("teams").insert({"organization_id": elsewhere["id"], "name": "Foreign"}).execute().data[0]

        result = await TeamComparisonService().compare_teams(
            org["id"], user["id"], [teams[2]["id"], foreign["id"], teams[0]["id"]]
        )

        assert [t["team_name"] for t in result] == ["T2", "T0"]


@requires_db
class TestTeamsUserIsOn:

    async def test_matches_is_on_team_for_every_kind_of_person(self, db, user):  # noqa: F811
        from app.services.team_service import TeamService

        member, manager, outsider = _person(db, "bob"), _person(db, "mia"), _person(db, "eve")
        org, teams = _seed_org(db, user, member, teams=2, repos_per_team=0)
        db.table("teams").update({"manager_id": manager["id"]}).eq("id", teams[1]["id"]).execute()
        teams = db.table("teams").select("*").in_("id", [t["id"] for t in teams]).execute().data
        service = TeamService()

        for person in (user, member, manager, outsider):
            batch = {t["id"] for t in await service.teams_user_is_on(teams, person["id"])}
            single = {t["id"] for t in teams if await service.is_on_team(t, person["id"])}
            assert batch == single

        assert len(await service.teams_user_is_on(teams, user["id"])) == 2      # the owner
        assert [t["name"] for t in await service.teams_user_is_on(teams, manager["id"])] == ["T1"]
        assert await service.teams_user_is_on(teams, outsider["id"]) == []
        assert await service.teams_user_is_on(teams, "") == []


@requires_db
class TestTeamSummaryChecksAccessOnce:

    async def test_summary_does_not_rederive_the_teams_repositories(self, db, user, monkeypatch):  # noqa: F811
        from app.services.team_insights_service import TeamInsightsService
        from app.services.team_service import TeamService

        member = _person(db, "bob")
        _, teams = _seed_org(db, user, member, teams=1, repos_per_team=3)
        spy = AsyncMock(side_effect=AssertionError("re-ran the access check"))
        monkeypatch.setattr(TeamService, "get_team_repositories", spy)

        with count_queries(monkeypatch) as counter:
            summary = await TeamInsightsService().get_summary(teams[0]["id"], member["id"])

        assert len(summary["repositories"]) == 3
        assert summary["metrics"]["total_repositories"] == 3
        assert counter["n"] <= 16  # was 33

    async def test_independent_reads_are_gathered(self, monkeypatch):
        """The members, repositories and metrics reads do not wait on each other."""
        import asyncio
        from app.services import team_insights_service as module

        gathered = []
        real_gather = asyncio.gather

        def spy(*aws, **kwargs):
            gathered.append(len(aws))
            return real_gather(*aws, **kwargs)

        monkeypatch.setattr(module.asyncio, "gather", spy)

        class Teams:
            get_team = AsyncMock(return_value={"id": "t", "organization_id": "o"})
            is_on_team = AsyncMock(return_value=True)
            assigned_repositories = AsyncMock(return_value=[])

        monkeypatch.setattr("app.services.team_service.TeamService", lambda: Teams())
        monkeypatch.setattr(
            "app.services.team_comparison_service.TeamComparisonService._metrics_for_teams",
            AsyncMock(return_value={"t": {}}),
        )
        service = module.TeamInsightsService.__new__(module.TeamInsightsService)

        class Query:
            def __getattr__(self, name):
                return lambda *a, **k: self

            def execute(self):
                return type("R", (), {"data": []})()

        service.db = type("DB", (), {"table": lambda self, name: Query()})()

        await service.get_summary("t", "u")

        assert gathered == [3, 3]


@requires_db
class TestAlertEvaluationIsSetBased:

    async def test_query_count_does_not_grow_with_repositories(self, db, user, monkeypatch):  # noqa: F811
        from app.services.alert_service import AlertService, AlertTypes

        small_org, _ = _seed_org(db, user, _person(db, "bob"), teams=1, repos_per_team=1)
        with count_queries(monkeypatch) as small:
            small_conditions = await AlertService().evaluate_organization(small_org["id"])

        # A second owner: github_repo_id is unique per owner.
        large_org, _ = _seed_org(db, _person(db, "zed"), _person(db, "yan"), teams=1, repos_per_team=5)
        with count_queries(monkeypatch) as large:
            large_conditions = await AlertService().evaluate_organization(large_org["id"])

        assert large["n"] == small["n"]
        # Each repository's latest analysis has one critical security finding;
        # the superseded analysis is not looked at.
        vulns = [c for c in large_conditions if c["alert_type"] == AlertTypes.SECURITY_VULNERABILITY]
        assert len(vulns) == 5
        assert all(v["details"]["vulnerability_count"] == 1 for v in vulns)
        assert len(small_conditions) < len(large_conditions)


class TestArchitectureDiagramIsCached:

    @pytest.fixture
    def service(self, monkeypatch):
        from app.services import repository_service

        store = {}

        class Redis:
            def get(self, key):
                return store.get(key, (None, None))[0]

            def set(self, key, value, ttl=None):
                store[key] = (value, ttl)
                return True

        svc = repository_service.RepositoryService.__new__(repository_service.RepositoryService)
        svc.redis = Redis()
        svc.db = None
        generate = AsyncMock(return_value="+--+\n|ui|\n+--+")
        monkeypatch.setattr(
            "app.agents.documentation_agent.DocumentationAgent.__init__", lambda self, *a, **k: None
        )
        monkeypatch.setattr(
            "app.agents.documentation_agent.DocumentationAgent.generate_architecture_diagram", generate
        )
        return svc, generate, store

    async def test_an_unchanged_tree_is_generated_once(self, service):
        from app.services.repository_service import ARCHITECTURE_CACHE_TTL_SECONDS

        svc, generate, store = service
        repo = {"id": "r1", "name": "api"}

        first = await svc.get_architecture_diagram(repo, ["b.py", "a.py"])
        second = await svc.get_architecture_diagram(repo, ["a.py", "b.py"])  # same tree, any order

        assert first == second == "+--+\n|ui|\n+--+"
        assert generate.await_count == 1
        assert [ttl for _, ttl in store.values()] == [ARCHITECTURE_CACHE_TTL_SECONDS]

    async def test_a_changed_tree_or_another_repository_regenerates(self, service):
        svc, generate, _ = service

        await svc.get_architecture_diagram({"id": "r1", "name": "api"}, ["a.py"])
        await svc.get_architecture_diagram({"id": "r1", "name": "api"}, ["a.py", "new.py"])
        await svc.get_architecture_diagram({"id": "r2", "name": "api"}, ["a.py"])

        assert generate.await_count == 3

    async def test_the_fallback_is_kept_only_briefly(self, service):
        from app.services.repository_service import ARCHITECTURE_FALLBACK_TTL_SECONDS

        svc, generate, store = service
        generate.return_value = "# api Architecture\n\n```\n...\n```"

        await svc.get_architecture_diagram({"id": "r1", "name": "api"}, ["a.py"])

        assert [ttl for _, ttl in store.values()] == [ARCHITECTURE_FALLBACK_TTL_SECONDS]
