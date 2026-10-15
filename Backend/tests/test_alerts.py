"""
Organisation alerts, against a real database.

Before this, no alert was ever stored: create_alert awaited the result of an
await (TypeError, swallowed), wrote to audit_logs rather than `alerts`, nothing
deduplicated, two checks read every historical analysis instead of the latest,
and nothing scheduled the checks at all.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


def _now(offset_minutes: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)).isoformat()


@pytest.fixture
def org(db, user):  # noqa: F811
    """Alice owns Acme; its Core team has one repository assigned."""
    org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
    team = db.table("teams").insert({"organization_id": org["id"], "name": "Core"}).execute().data[0]
    repo = db.table("repositories").insert({
        "user_id": user["id"], "github_repo_id": 1, "name": "api", "full_name": "acme/api",
    }).execute().data[0]
    db.table("repository_assignments").insert({"repository_id": repo["id"], "team_id": team["id"]}).execute()
    org["team_id"] = team["id"]
    org["repo"] = repo
    return org


@pytest.fixture
def bob(db, org):  # noqa: F811
    """A member of Acme (through a team), not its owner."""
    bob = db.table("users").insert({"email": "bob@example.com", "full_name": "Bob"}).execute().data[0]
    db.table("team_members").insert({"team_id": org["team_id"], "user_id": bob["id"]}).execute()
    return bob


@pytest.fixture
def eve(db):  # noqa: F811
    """A user in no organisation with Alice."""
    return db.table("users").insert({"email": "eve@example.com", "full_name": "Eve"}).execute().data[0]


def _analysis(db, repo, completed_at=None, **scores):  # noqa: F811
    row = {
        "repository_id": repo["id"], "status": "completed",
        "completed_at": completed_at or _now(),
        "overall_score": 90, "security_score": 90, "critical_issues": 0,
    }
    row.update(scores)
    return db.table("analysis_results").insert(row).execute().data[0]


def _service():
    from app.services.alert_service import AlertService
    return AlertService()


def _check(org_id):
    return asyncio.run(_service().check_organization(org_id))


def _alerts(db, org_id):  # noqa: F811
    return db.table("alerts").select("*").eq("organization_id", org_id).execute().data


@requires_db
class TestAlertsAreStored:

    def test_conditions_in_the_latest_analysis_are_stored_in_alerts(self, db, org):  # noqa: F811
        analysis = _analysis(db, org["repo"], overall_score=40, security_score=30, critical_issues=2)
        db.table("issues").insert([
            {"analysis_id": analysis["id"], "agent_type": "security", "severity": "critical"},
            {"analysis_id": analysis["id"], "agent_type": "quality", "severity": "critical"},
        ]).execute()

        result = _check(org["id"])

        assert result["alerts_created"] == 3
        rows = {a["alert_type"]: a for a in _alerts(db, org["id"])}
        assert set(rows) == {"critical_issues", "quality_threshold", "security_vulnerability"}
        assert rows["critical_issues"]["details"]["critical_issues"] == 2
        assert rows["security_vulnerability"]["details"]["vulnerability_count"] == 1
        assert rows["quality_threshold"]["severity"] == "high"
        assert rows["quality_threshold"]["details"]["score"] == 40
        assert rows["quality_threshold"]["details"]["threshold"] == 70
        assert all(a["repository_id"] == org["repo"]["id"] for a in rows.values())
        assert all(a["details"]["analysis_id"] == analysis["id"] for a in rows.values())
        # Not in audit_logs any more.
        assert db.table("audit_logs").select("id").eq("organization_id", org["id"]).execute().data == []

    def test_a_healthy_analysis_raises_nothing(self, db, org):  # noqa: F811
        _analysis(db, org["repo"], overall_score=85)

        assert _check(org["id"]) == {"alerts_found": 0, "alerts_created": 0, "alerts": []}

    def test_only_the_latest_analysis_counts(self, db, org):  # noqa: F811
        """A score of 30 last month is not a problem once today's run scored 95."""
        _analysis(db, org["repo"], completed_at=_now(-60 * 24 * 30), overall_score=30, critical_issues=4)
        _analysis(db, org["repo"], overall_score=95)

        assert _check(org["id"])["alerts_found"] == 0

    def test_a_missing_score_is_not_a_low_score(self, db, org):  # noqa: F811
        _analysis(db, org["repo"], overall_score=None)

        assert _check(org["id"])["alerts_found"] == 0

    def test_failed_analyses_are_ignored(self, db, org):  # noqa: F811
        db.table("analysis_results").insert({
            "repository_id": org["repo"]["id"], "status": "failed", "overall_score": 10,
        }).execute()

        assert _check(org["id"])["alerts_found"] == 0

    def test_repositories_outside_the_organisation_are_not_checked(self, db, org, user):  # noqa: F811
        loose = db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 2, "name": "side", "full_name": "alice/side",
        }).execute().data[0]
        _analysis(db, loose, overall_score=10, critical_issues=9)

        assert _check(org["id"])["alerts_found"] == 0


@requires_db
class TestDeduplication:

    def test_rechecking_the_same_analysis_creates_nothing_new(self, db, org):  # noqa: F811
        _analysis(db, org["repo"], overall_score=60, critical_issues=1)

        first = _check(org["id"])
        second = _check(org["id"])

        assert first["alerts_created"] == 2
        assert second == {"alerts_found": 2, "alerts_created": 0, "alerts": []}
        assert len(_alerts(db, org["id"])) == 2

    def test_acknowledging_is_final_for_that_analysis(self, db, org, user):  # noqa: F811
        _analysis(db, org["repo"], critical_issues=1)
        alert = _check(org["id"])["alerts"][0]
        asyncio.run(_service().acknowledge_alert(alert["id"], user["id"]))

        assert _check(org["id"])["alerts_created"] == 0

    def test_a_new_analysis_with_the_condition_raises_a_new_alert(self, db, org):  # noqa: F811
        _analysis(db, org["repo"], completed_at=_now(-60), critical_issues=1)
        _check(org["id"])
        _analysis(db, org["repo"], critical_issues=1)

        assert _check(org["id"])["alerts_created"] == 1
        assert len(_alerts(db, org["id"])) == 2

    def test_the_database_rejects_a_duplicate_condition(self, db, org):  # noqa: F811
        """The backstop for the schedule and a manual check racing."""
        import psycopg

        row = {
            "organization_id": org["id"], "repository_id": org["repo"]["id"],
            "alert_type": "critical_issues", "dedupe_key": "analysis:x", "message": "m",
        }
        db.table("alerts").insert(row).execute()
        with pytest.raises(psycopg.errors.UniqueViolation):
            db.table("alerts").insert(row).execute()

    def test_create_alert_reports_a_duplicate_as_none(self, db, org):  # noqa: F811
        kwargs = dict(
            organization_id=org["id"], repository_id=org["repo"]["id"], alert_type="critical_issues",
            severity="critical", message="m", dedupe_key="analysis:y", details={"n": 1},
        )
        created = asyncio.run(_service().create_alert(**kwargs))

        assert created["details"] == {"n": 1}
        assert "dedupe_key" not in created
        assert asyncio.run(_service().create_alert(**kwargs)) is None


@requires_db
class TestAcknowledgeAndList:

    @pytest.fixture
    def alert(self, db, org):  # noqa: F811
        _analysis(db, org["repo"], critical_issues=1)
        return _check(org["id"])["alerts"][0]

    def test_a_member_can_acknowledge(self, alert, bob):
        acked = asyncio.run(_service().acknowledge_alert(alert["id"], bob["id"]))

        assert acked["acknowledged"] is True
        assert acked["acknowledged_by"] == bob["id"]
        assert acked["acknowledged_at"]

    def test_acknowledging_twice_keeps_the_first(self, alert, bob, user):  # noqa: F811
        first = asyncio.run(_service().acknowledge_alert(alert["id"], bob["id"]))
        again = asyncio.run(_service().acknowledge_alert(alert["id"], user["id"]))

        assert again["acknowledged_by"] == bob["id"]
        assert again["acknowledged_at"] == first["acknowledged_at"]

    def test_a_non_member_cannot_acknowledge(self, db, alert, eve):  # noqa: F811
        assert asyncio.run(_service().acknowledge_alert(alert["id"], eve["id"])) is None
        assert db.table("alerts").select("acknowledged").eq("id", alert["id"]).execute().data[0]["acknowledged"] is False

    def test_unknown_and_malformed_ids_are_not_found(self, alert, user):  # noqa: F811
        import uuid

        assert asyncio.run(_service().acknowledge_alert(str(uuid.uuid4()), user["id"])) is None
        assert asyncio.run(_service().acknowledge_alert("not-a-uuid", user["id"])) is None

    def test_list_filters_acknowledged_and_age(self, db, org, alert, user):  # noqa: F811
        old = db.table("alerts").insert({
            "organization_id": org["id"], "repository_id": org["repo"]["id"], "alert_type": "quality_threshold",
            "dedupe_key": "analysis:old", "message": "old", "created_at": _now(-60 * 24 * 10),
        }).execute().data[0]
        service = _service()

        assert [a["id"] for a in asyncio.run(service.get_organization_alerts(org["id"], user["id"], 7))] == [alert["id"]]
        assert [a["id"] for a in asyncio.run(service.get_organization_alerts(org["id"], user["id"], 30))] == \
            [alert["id"], old["id"]]

        asyncio.run(service.acknowledge_alert(alert["id"], user["id"]))
        assert asyncio.run(service.get_organization_alerts(org["id"], user["id"], 7, include_acknowledged=False)) == []

    def test_list_is_members_only(self, org, alert, bob, eve):
        service = _service()

        assert len(asyncio.run(service.get_organization_alerts(org["id"], bob["id"]))) == 1
        assert asyncio.run(service.get_organization_alerts(org["id"], eve["id"])) is None


@pytest.fixture
def as_user(app):
    """Authenticate TestClient requests as the given user row."""
    from app.api.dependencies import get_current_user

    def _as(user_row):  # noqa: F811
        app.dependency_overrides[get_current_user] = lambda: user_row
    yield _as
    app.dependency_overrides.pop(get_current_user, None)


@requires_db
class TestRoutes:

    def test_check_list_and_acknowledge(self, client, as_user, db, org, user, bob):  # noqa: F811
        _analysis(db, org["repo"], critical_issues=2)
        as_user(user)

        checked = client.post(f"/api/v1/alerts/organizations/{org['id']}/check")
        assert checked.status_code == 200
        body = checked.json()
        assert (body["alerts_found"], body["alerts_created"]) == (1, 1)

        as_user(bob)
        listed = client.get(f"/api/v1/alerts/organizations/{org['id']}?days=7&include_acknowledged=false")
        assert listed.status_code == 200
        assert [a["alert_type"] for a in listed.json()] == ["critical_issues"]
        assert "dedupe_key" not in listed.json()[0]

        acked = client.post(f"/api/v1/alerts/{listed.json()[0]['id']}/acknowledge")
        assert acked.status_code == 200
        assert acked.json()["acknowledged"] is True

    def test_non_members_get_404_everywhere(self, client, as_user, db, org, eve):  # noqa: F811
        _analysis(db, org["repo"], critical_issues=2)
        alert = _check(org["id"])["alerts"][0]
        as_user(eve)

        assert client.get(f"/api/v1/alerts/organizations/{org['id']}").status_code == 404
        assert client.post(f"/api/v1/alerts/organizations/{org['id']}/check").status_code == 404
        assert client.post(f"/api/v1/alerts/{alert['id']}/acknowledge").status_code == 404


class TestSchedule:

    def test_the_check_is_a_registered_celery_task_on_the_beat_schedule(self):
        from app.core.celery_app import celery_app
        from app.core.config import get_settings
        import app.tasks.alert_tasks  # noqa: F401  (registers the task)

        entry = celery_app.conf.beat_schedule["check-all-organizations-alerts"]
        assert entry["task"] == "check_all_organizations_alerts"
        assert entry["task"] in celery_app.tasks
        assert entry["schedule"] == float(get_settings().ALERT_CHECK_INTERVAL_SECONDS)
        assert "app.tasks.alert_tasks" in celery_app.conf.include

    def test_an_interval_of_zero_removes_the_schedule(self, monkeypatch):
        from app.core import celery_app as module

        monkeypatch.setattr(module.settings, "ALERT_CHECK_INTERVAL_SECONDS", 0)
        assert module.build_beat_schedule() == {}

    @requires_db
    def test_one_failing_organisation_does_not_stop_the_rest(self, db, org, user):  # noqa: F811
        from app.tasks import alert_tasks

        db.table("organizations").insert({"name": "Other", "owner_id": user["id"]}).execute()
        _analysis(db, org["repo"], critical_issues=1)
        real = alert_tasks.check_organization_alerts

        async def flaky(org_id):
            if org_id != org["id"]:
                raise RuntimeError("boom")
            return await real(org_id)

        with patch.object(alert_tasks, "check_organization_alerts", flaky):
            summary = alert_tasks.check_all_organizations_alerts.run()

        assert summary == {"organizations": 2, "alerts_created": 1, "failed": 1}
        assert len(_alerts(db, org["id"])) == 1


@requires_db
class TestAlertVisibilityFollowsTeams:
    """Alerts name a repository and its scores; other teams must not see them."""

    def test_a_member_of_another_team_sees_and_acknowledges_nothing(self, db, user, org):  # noqa: F811
        carol = db.table("users").insert({"email": "carol@example.com"}).execute().data[0]
        other = db.table("teams").insert({"organization_id": org["id"], "name": "Other"}).execute().data[0]
        db.table("team_members").insert({"team_id": other["id"], "user_id": carol["id"]}).execute()
        _analysis(db, org["repo"], critical_issues=1)
        alert = _check(org["id"])["alerts"][0]

        assert asyncio.run(_service().get_organization_alerts(org["id"], carol["id"])) == []
        assert asyncio.run(_service().acknowledge_alert(alert["id"], carol["id"])) is None
        assert [a["id"] for a in asyncio.run(_service().get_organization_alerts(org["id"], user["id"]))] == [alert["id"]]
