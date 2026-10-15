"""
Developer insights, resolved-issue detection, and the post-analysis pipeline.

Against a real database, with GitHub faked. Before this, nothing ever wrote
developer_contributions, code_ownership, issue_blame or issues.fixed, so every
team, developer and velocity figure in the product was zero or empty.
"""
import asyncio
import inspect
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


def _sunday(weeks_ago: int) -> int:
    now = datetime.now(timezone.utc)
    sunday = (now - timedelta(days=(now.weekday() + 1) % 7 + 7 * weeks_ago)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return int(sunday.timestamp())


@pytest.fixture
def repo(db, user):  # noqa: F811
    db.table("users").update({"github_username": "alice"}).eq("id", user["id"]).execute()
    return db.table("repositories").insert({
        "user_id": user["id"], "github_repo_id": 1, "name": "r", "full_name": "alice/r",
        "default_branch": "main",
    }).execute().data[0]


@pytest.fixture
def bob(db, user, repo):  # noqa: F811
    """
    A collaborator: a team member in the owner's organization who also has the
    repository in their own sync - i.e. GitHub grants him access to it.
    """
    bob = db.table("users").insert(
        {"email": "bob@example.com", "full_name": "Bob", "github_username": "bob"}
    ).execute().data[0]
    org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
    team = db.table("teams").insert({"organization_id": org["id"], "name": "Core"}).execute().data[0]
    db.table("team_members").insert({"team_id": team["id"], "user_id": bob["id"], "role": "member"}).execute()
    db.table("repositories").insert({
        "user_id": bob["id"], "github_repo_id": repo["github_repo_id"],
        "name": repo["name"], "full_name": repo["full_name"],
    }).execute()
    bob["team_id"] = team["id"]
    return bob


@pytest.fixture
def stranger(db):  # noqa: F811
    """A RepoIQ user who shares no organization with the repository owner."""
    return db.table("users").insert(
        {"email": "eve@example.com", "full_name": "Eve", "github_username": "eve"}
    ).execute().data[0]


def _analysis(db, repo, issues, status="completed", completed_at=None):  # noqa: F811
    analysis = db.table("analysis_results").insert({
        "repository_id": repo["id"], "status": status,
        "completed_at": completed_at or datetime.now(timezone.utc).isoformat(),
    }).execute().data[0]
    if issues:
        db.table("issues").insert([dict(i, analysis_id=analysis["id"]) for i in issues]).execute()
    return analysis


def _github(stats, blame):
    github = MagicMock()
    github.get_contributor_weekly_stats.return_value = stats
    github.get_file_blame.side_effect = lambda full_name, branch, path: blame.get(path, [])
    return github


def _refresh(repo, analysis_id, paths, github):
    from app.services.repository_insights import refresh_repository_insights

    with patch("app.services.repository_insights.create_github_service", return_value=github):
        return asyncio.run(refresh_repository_insights(repo, "token", analysis_id, paths))


@requires_db
class TestInsights:

    def test_contributions_ownership_and_blame_are_written(self, db, user, repo, bob):  # noqa: F811
        recent = datetime.now(timezone.utc).isoformat()
        analysis = _analysis(db, repo, [
            {"agent_type": "security", "severity": "high", "category": "sql_injection",
             "file_path": "app.py", "line_number": 3},
        ])
        github = _github(
            stats=[
                {"login": "alice", "weeks": [{"week_start": _sunday(1), "additions": 50, "deletions": 5, "commits": 4}]},
                {"login": "stranger", "weeks": [{"week_start": _sunday(1), "additions": 9, "deletions": 0, "commits": 9}]},
            ],
            blame={"app.py": [
                {"start": 1, "end": 2, "login": "alice", "committed_at": recent},
                {"start": 3, "end": 3, "login": "bob", "committed_at": recent},
                {"start": 4, "end": 4, "login": "stranger", "committed_at": recent},
            ]},
        )

        summary = _refresh(repo, analysis["id"], ["app.py"], github)

        assert summary == {"contributors": 2, "files_blamed": 1, "issues_blamed": 1}

        owners = {r["user_id"]: r for r in db.table("code_ownership").select("*")
                  .eq("repository_id", repo["id"]).execute().data}
        # Shares are over ALL lines - the non-user's line still counts.
        assert owners[user["id"]]["ownership_percentage"] == 50
        assert owners[bob["id"]]["ownership_percentage"] == 25

        blame = db.table("issue_blame").select("user_id").execute().data
        assert [b["user_id"] for b in blame] == [bob["id"]]

        rows = {r["user_id"]: r for r in db.table("developer_contributions").select("*")
                .eq("repository_id", repo["id"]).execute().data}
        assert rows[user["id"]]["commits_count"] == 4
        assert rows[bob["id"]]["issues_introduced"] == 1

    def test_strangers_are_never_attributed(self, db, user, repo, stranger):  # noqa: F811
        """
        GitHub attributes commits by author email, which anyone can spoof. A
        repository must not be able to write rows about - or reveal the profile
        of - a user who shares no organization with its owner.
        """
        recent = datetime.now(timezone.utc).isoformat()
        analysis = _analysis(db, repo, [
            {"agent_type": "security", "severity": "high", "category": "x",
             "file_path": "app.py", "line_number": 1},
        ])
        _refresh(repo, analysis["id"], ["app.py"], _github(
            stats=[{"login": "eve", "weeks": [
                {"week_start": _sunday(1), "additions": 1, "deletions": 0, "commits": 1},
            ]}],
            blame={"app.py": [{"start": 1, "end": 5, "login": "eve", "committed_at": recent}]},
        ))

        for table in ("developer_contributions", "code_ownership", "issue_blame"):
            rows = db.table(table).select("user_id").eq("user_id", stranger["id"]).execute().data
            assert not rows, f"{table} has a row for a stranger"

    def test_organization_membership_alone_does_not_allow_attribution(self, db, user, repo, stranger):  # noqa: F811
        """
        Anyone can create an organization and add anyone to a team without
        consent, so "colleague" cannot be the test - repository access is.
        """
        org = db.table("organizations").insert({"name": "Trap", "owner_id": user["id"]}).execute().data[0]
        team = db.table("teams").insert({"organization_id": org["id"], "name": "T"}).execute().data[0]
        db.table("team_members").insert(
            {"team_id": team["id"], "user_id": stranger["id"], "role": "member"}
        ).execute()

        recent = datetime.now(timezone.utc).isoformat()
        _refresh(repo, None, ["app.py"], _github(
            stats=[{"login": "eve", "weeks": [
                {"week_start": _sunday(1), "additions": 1, "deletions": 0, "commits": 1},
            ]}],
            blame={"app.py": [{"start": 1, "end": 5, "login": "eve", "committed_at": recent}]},
        ))

        for table in ("developer_contributions", "code_ownership"):
            assert not db.table(table).select("user_id").eq("user_id", stranger["id"]).execute().data

    def test_refresh_replaces_ownership(self, db, user, repo, bob):  # noqa: F811
        """Someone whose lines were all rewritten no longer owns the file."""
        recent = datetime.now(timezone.utc).isoformat()
        _refresh(repo, None, ["a.py"], _github([], {"a.py": [
            {"start": 1, "end": 10, "login": "bob", "committed_at": recent},
        ]}))
        _refresh(repo, None, ["a.py"], _github([], {"a.py": [
            {"start": 1, "end": 10, "login": "alice", "committed_at": recent},
        ]}))

        owners = db.table("code_ownership").select("user_id").eq("repository_id", repo["id"]).execute().data
        assert [o["user_id"] for o in owners] == [user["id"]]

    def test_refresh_is_idempotent(self, db, user, repo):  # noqa: F811
        github = _github([{"login": "alice", "weeks": [
            {"week_start": _sunday(0), "additions": 1, "deletions": 1, "commits": 1},
        ]}], {})
        _refresh(repo, None, [], github)
        _refresh(repo, None, [], github)

        rows = db.table("developer_contributions").select("id").eq("repository_id", repo["id"]).execute().data
        assert len(rows) == 1

    def test_old_weeks_are_ignored(self, db, user, repo):  # noqa: F811
        _refresh(repo, None, [], _github([{"login": "alice", "weeks": [
            {"week_start": _sunday(52), "additions": 1, "deletions": 1, "commits": 1},
        ]}], {}))

        assert not db.table("developer_contributions").select("id").eq("repository_id", repo["id"]).execute().data

    def test_stats_still_computing_is_not_an_error(self, db, user, repo, monkeypatch):  # noqa: F811
        from app.services import repository_insights

        monkeypatch.setattr(repository_insights, "_STATS_RETRY_SECONDS", 0)
        summary = _refresh(repo, None, [], _github(None, {}))

        assert summary["contributors"] == 0


@requires_db
class TestResolvedIssues:

    def _issue(self, path, category="sql_injection"):
        return {"agent_type": "security", "severity": "high", "category": category,
                "file_path": path, "line_number": 1}

    def test_findings_gone_from_reviewed_files_are_marked_fixed(self, db, user, repo):  # noqa: F811
        from app.services.repository_insights import mark_resolved_issues

        old_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        previous = _analysis(db, repo, [
            self._issue("a.py"),                    # fixed: a.py reviewed, finding gone
            self._issue("b.py"),                    # still present in b.py
            self._issue("c.py"),                    # c.py not reviewed: unknown, untouched
        ], completed_at=old_time)
        current = _analysis(db, repo, [self._issue("b.py")])

        resolved = asyncio.run(mark_resolved_issues(repo["id"], current["id"], ["a.py", "b.py"]))

        assert resolved == 1
        rows = {r["file_path"]: r for r in db.table("issues").select("file_path, fixed, fix_applied_at")
                .eq("analysis_id", previous["id"]).execute().data}
        assert rows["a.py"]["fixed"] is True and rows["a.py"]["fix_applied_at"]
        assert rows["b.py"]["fixed"] is False
        assert rows["c.py"]["fixed"] is False

    def test_counts_matter(self, db, user, repo):  # noqa: F811
        """Two identical findings down to one means one was fixed."""
        from app.services.repository_insights import mark_resolved_issues

        old_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        _analysis(db, repo, [self._issue("a.py"), self._issue("a.py")], completed_at=old_time)
        current = _analysis(db, repo, [self._issue("a.py")])

        assert asyncio.run(mark_resolved_issues(repo["id"], current["id"], ["a.py"])) == 1

    def test_first_analysis_resolves_nothing(self, db, user, repo):  # noqa: F811
        from app.services.repository_insights import mark_resolved_issues

        current = _analysis(db, repo, [self._issue("a.py")])
        assert asyncio.run(mark_resolved_issues(repo["id"], current["id"], ["a.py"])) == 0


@requires_db
class TestColleagueVisibility:
    """Another person's figures cover shared-organization repositories only."""

    def _week(self, db, user_id, repo_id, commits):  # noqa: F811
        start = datetime.fromtimestamp(_sunday(1), tz=timezone.utc)
        db.table("developer_contributions").insert({
            "user_id": user_id, "repository_id": repo_id, "commits_count": commits,
            "period_start": start.isoformat(), "period_end": (start + timedelta(days=7)).isoformat(),
        }).execute()

    def test_private_activity_is_not_visible_to_colleagues(self, db, user, repo, bob):  # noqa: F811
        from app.services.developer_analytics_service import DeveloperAnalyticsService

        side_project = db.table("repositories").insert({
            "user_id": bob["id"], "github_repo_id": 99, "name": "side", "full_name": "bob/side",
        }).execute().data[0]
        db.table("repository_assignments").insert(
            {"repository_id": repo["id"], "team_id": bob["team_id"]}
        ).execute()
        self._week(db, bob["id"], repo["id"], 3)          # org repository
        self._week(db, bob["id"], side_project["id"], 40)  # Bob's own, unassigned

        service = DeveloperAnalyticsService()
        as_colleague = asyncio.run(service.get_developer_performance(bob["id"], user["id"]))
        as_himself = asyncio.run(service.get_developer_performance(bob["id"], bob["id"]))

        assert as_colleague["total_commits"] == 3
        assert as_himself["total_commits"] == 43

    def test_organization_view_counts_only_its_repositories(self, db, user, repo, bob):  # noqa: F811
        from app.services.developer_analytics_service import DeveloperAnalyticsService

        side_project = db.table("repositories").insert({
            "user_id": bob["id"], "github_repo_id": 99, "name": "side", "full_name": "bob/side",
        }).execute().data[0]
        db.table("repository_assignments").insert(
            {"repository_id": repo["id"], "team_id": bob["team_id"]}
        ).execute()
        self._week(db, bob["id"], repo["id"], 3)
        self._week(db, bob["id"], side_project["id"], 40)
        org_id = db.table("teams").select("organization_id").eq("id", bob["team_id"]).execute().data[0]["organization_id"]

        developers = asyncio.run(
            DeveloperAnalyticsService().get_organization_developers(org_id, user["id"])
        )

        assert [d["total_commits"] for d in developers] == [3]


class TestDeveloperPerformanceAccess:

    def test_another_users_metrics_need_a_shared_organization(self):
        """Omitting repository_id used to skip the access check entirely."""
        from fastapi import HTTPException
        from app.api.routes import developers

        with patch("app.services.organization_service.OrganizationService") as org_cls:
            org_cls.return_value.get_colleague_ids = MagicMock(
                side_effect=lambda uid: asyncio.sleep(0, result=set())
            )
            with pytest.raises(HTTPException) as err:
                asyncio.run(developers.get_developer_performance(
                    "someone-else", None, 30, {"id": "me"}
                ))
        assert err.value.status_code == 404

    def test_colleagues_can_see_each_other(self):
        from app.api.routes import developers

        with patch("app.services.organization_service.OrganizationService") as org_cls, \
                patch.object(developers.DeveloperAnalyticsService, "__init__", lambda self: None), \
                patch.object(developers.DeveloperAnalyticsService, "get_developer_performance",
                             lambda self, **kw: asyncio.sleep(0, result={"user_id": kw["user_id"]})):
            org_cls.return_value.get_colleague_ids = MagicMock(
                side_effect=lambda uid: asyncio.sleep(0, result={"colleague"})
            )
            result = asyncio.run(developers.get_developer_performance("colleague", None, 30, {"id": "me"}))
        assert result == {"user_id": "colleague"}


class TestPostAnalysisPipeline:

    def test_followups_are_awaited_not_fire_and_forget(self):
        """create_task inside Celery's asyncio.run() is cancelled when it returns."""
        from app.tasks import analysis_tasks

        source = inspect.getsource(analysis_tasks)
        assert "asyncio.create_task(" not in source
        assert "await asyncio.wait_for(step()" in inspect.getsource(analysis_tasks._run_followups)

    def test_a_failing_followup_does_not_stop_the_others(self):
        from app.tasks import analysis_tasks

        calls = []

        async def boom(*a, **k):
            calls.append("roadmap")
            raise RuntimeError("roadmap broke")

        orchestrator = MagicMock()
        orchestrator.generate_improvement_roadmap = boom
        with patch("app.services.repository_insights.mark_resolved_issues",
                   side_effect=lambda *a: calls.append("resolved") or asyncio.sleep(0, result=0)), \
                patch("app.services.repository_insights.refresh_repository_insights",
                      side_effect=lambda *a: calls.append("insights") or asyncio.sleep(0, result={})):
            asyncio.run(analysis_tasks._run_followups(
                repo={"id": "r"}, github_token="t", analysis_id="a", issues=[],
                analysed_paths=[], orchestrator=orchestrator, repo_service=MagicMock(),
            ))
        assert calls == ["roadmap", "resolved", "insights"]

    def test_whole_analysis_cache_is_gone(self):
        """Its hit path saved scores but never the issues behind them."""
        from app.tasks import analysis_tasks

        source = inspect.getsource(analysis_tasks._run_analysis_internal)
        assert "get_cached_analysis" not in source
        assert '"files_reused": files_reused' in source
        assert '"commit_sha": commit_sha' in source

    def test_roadmap_tolerates_findings_without_a_category(self):
        from app.agents.orchestrator import AgentOrchestrator

        orchestrator = AgentOrchestrator.__new__(AgentOrchestrator)
        roadmap = asyncio.run(orchestrator.generate_improvement_roadmap([
            {"severity": "high", "description": "x"},
            {"severity": "critical", "auto_fixable": True, "description": "y"},
        ]))
        assert [i["category"] for i in roadmap["quick_wins"]] == ["uncategorized", "uncategorized"]
        assert roadmap["estimated_impact"]["critical_issues"] == 1
