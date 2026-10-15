"""
Alerts honour each user's notification settings (user_settings, migration 010).

The Settings page has stored "alert me when a repository's score drops below
N" and a security-alerts toggle since migration 010, but the checks compared
every score against one deployment-wide ALERT_QUALITY_THRESHOLD and showed
every alert to everyone. A user who set 80 was never told about a 75; a user
who set 40 was shown every 55.
"""
import asyncio

import pytest

from tests.test_alerts import _alerts, _analysis, _check, _now, _service, bob, org  # noqa: F401  (fixtures)
from tests.test_latency import count_queries
from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


def _set(user_id, **changes):
    from app.services.user_settings_service import update_user_settings

    return asyncio.run(update_user_settings(user_id, changes))


def _listed(org_id, user_id):
    return asyncio.run(_service().get_organization_alerts(org_id, user_id))


@requires_db
class TestQualityThresholdIsPerUser:

    def test_unset_thresholds_use_the_settings_page_default(self, db, org):  # noqa: F811
        from app.services.user_settings_service import DEFAULT_USER_SETTINGS

        default = DEFAULT_USER_SETTINGS["alert_score_threshold"]
        _analysis(db, org["repo"], overall_score=default, completed_at=_now(-60))  # not below it
        assert _check(org["id"])["alerts_found"] == 0

        _analysis(db, org["repo"], overall_score=default - 1)

        assert _check(org["id"])["alerts_created"] == 1
        assert [a["alert_type"] for a in _alerts(db, org["id"])] == ["quality_threshold"]

    def test_a_raised_threshold_is_honoured(self, db, org, user):  # noqa: F811
        _set(user["id"], alert_score_threshold=80)
        _analysis(db, org["repo"], overall_score=75)

        created = _check(org["id"])["alerts"]

        assert [a["alert_type"] for a in created] == ["quality_threshold"]
        assert created[0]["details"]["threshold"] == 80

    def test_a_lowered_threshold_is_honoured(self, db, org, user):  # noqa: F811
        _set(user["id"], alert_score_threshold=40)
        _analysis(db, org["repo"], overall_score=55)

        assert _check(org["id"])["alerts_found"] == 0

    def test_a_threshold_of_zero_turns_quality_alerts_off(self, db, org, user):  # noqa: F811
        _set(user["id"], alert_score_threshold=0)
        _analysis(db, org["repo"], overall_score=0)

        assert _check(org["id"])["alerts_found"] == 0

    def test_each_member_sees_only_what_crosses_their_own_threshold(self, db, org, user, bob):  # noqa: F811
        """Alice (owner) wants 50, Bob (member) wants 80; the repository scores 70."""
        _set(user["id"], alert_score_threshold=50)
        _set(bob["id"], alert_score_threshold=80)
        _analysis(db, org["repo"], overall_score=70)

        # Raised because one member asked for it ...
        assert _check(org["id"])["alerts_created"] == 1
        # ... and shown only to that member, against their own threshold.
        bobs = _listed(org["id"], bob["id"])
        assert [a["alert_type"] for a in bobs] == ["quality_threshold"]
        assert bobs[0]["details"]["threshold"] == 80
        assert _listed(org["id"], user["id"]) == []

    def test_lowering_a_threshold_hides_alerts_already_raised(self, db, org, user):  # noqa: F811
        _set(user["id"], alert_score_threshold=80)
        _analysis(db, org["repo"], overall_score=70)
        _check(org["id"])
        assert len(_listed(org["id"], user["id"])) == 1

        _set(user["id"], alert_score_threshold=60)

        assert _listed(org["id"], user["id"]) == []

    def test_other_alert_types_ignore_the_threshold(self, db, org, user):  # noqa: F811
        _set(user["id"], alert_score_threshold=0)
        _analysis(db, org["repo"], overall_score=10, critical_issues=1)
        _check(org["id"])

        assert [a["alert_type"] for a in _listed(org["id"], user["id"])] == ["critical_issues"]

    def test_the_manual_check_answers_with_the_callers_alerts(self, db, org, user, bob, app, client):  # noqa: F811
        from app.api.dependencies import get_current_user

        _set(user["id"], alert_score_threshold=80)
        _analysis(db, org["repo"], overall_score=70)
        app.dependency_overrides[get_current_user] = lambda: bob
        try:
            body = client.post(f"/api/v1/alerts/organizations/{org['id']}/check").json()
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # Raised for Alice; Bob is on the default 60, which 70 does not cross.
        assert body["alerts"] == []
        assert len(_alerts(db, org["id"])) == 1


@requires_db
class TestSecurityAlertsToggle:

    def test_turning_security_alerts_off_hides_them(self, db, org, user, bob):  # noqa: F811
        analysis = _analysis(db, org["repo"], critical_issues=1)
        db.table("issues").insert(
            {"analysis_id": analysis["id"], "agent_type": "security", "severity": "critical"}
        ).execute()
        _check(org["id"])
        _set(bob["id"], security_alerts=False)

        assert {a["alert_type"] for a in _listed(org["id"], user["id"])} == {
            "critical_issues", "security_vulnerability",
        }
        assert [a["alert_type"] for a in _listed(org["id"], bob["id"])] == ["critical_issues"]


@requires_db
class TestStillSetBased:

    async def test_member_settings_do_not_add_queries_per_member(self, db, org, user, monkeypatch):  # noqa: F811
        from app.services.alert_service import AlertService

        _analysis(db, org["repo"], overall_score=10)
        with count_queries(monkeypatch) as alone:
            await AlertService().evaluate_organization(org["id"])

        for i in range(4):
            person = db.table("users").insert({"email": f"m{i}@example.com"}).execute().data[0]
            db.table("team_members").insert({"team_id": org["team_id"], "user_id": person["id"]}).execute()
            db.table("user_settings").insert({"user_id": person["id"], "alert_score_threshold": 20 + i}).execute()
        with count_queries(monkeypatch) as crowded:
            await AlertService().evaluate_organization(org["id"])

        assert crowded["n"] == alone["n"]

    async def test_preferences_for_many_users_are_one_query(self, db, user, monkeypatch):  # noqa: F811
        from app.services.user_settings_service import DEFAULT_USER_SETTINGS, get_users_settings

        other = db.table("users").insert({"email": "o@example.com"}).execute().data[0]
        db.table("user_settings").insert({"user_id": other["id"], "alert_score_threshold": 90}).execute()

        with count_queries(monkeypatch) as counter:
            prefs = await get_users_settings([user["id"], other["id"]])

        assert counter["n"] == 1
        assert prefs[user["id"]]["alert_score_threshold"] == DEFAULT_USER_SETTINGS["alert_score_threshold"]
        assert prefs[other["id"]]["alert_score_threshold"] == 90

    async def test_no_users_is_no_query(self, monkeypatch):
        from app.services.user_settings_service import get_users_settings

        with count_queries(monkeypatch) as counter:
            assert await get_users_settings([]) == {}
        assert counter["n"] == 0


@pytest.mark.parametrize("score,threshold,shown", [(59, 60, True), (60, 60, False), (None, 60, True)])
def test_wanted_by(score, threshold, shown):
    from app.services.alert_service import wanted_by
    from app.services.user_settings_service import DEFAULT_USER_SETTINGS

    prefs = {**DEFAULT_USER_SETTINGS, "alert_score_threshold": threshold}
    details = {} if score is None else {"score": score}
    alert = {"alert_type": "quality_threshold", "details": details}
    assert wanted_by(alert, prefs) is shown
