"""
Persisted notification preferences (user_settings, GET/PUT /users/me/settings).

The Settings page's toggles used to live only in browser state, so every
choice was lost on reload and nothing server-side could honour one. These
check that a choice survives, that a partial update changes only what was
sent, and that bad input is refused rather than coerced or stored.
"""
import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)

from app.core.config import get_settings
from app.services.user_settings_service import (
    DEFAULT_USER_SETTINGS,
    get_user_settings,
    update_user_settings,
)

API = get_settings().api_prefix


def _stored(db, user_id):  # noqa: F811
    return db.table("user_settings").select("*").eq("user_id", user_id).execute().data


@requires_db
class TestService:

    def test_defaults_match_the_column_defaults(self, db):  # noqa: F811
        """A user with no row must read exactly what a fresh row would hold."""
        from app.db import postgres

        with postgres.Database.get_pool().connection() as conn:
            rows = conn.execute(
                "SELECT column_name, column_default FROM information_schema.columns "
                "WHERE table_name = 'user_settings'"
            ).fetchall()
        column_defaults = {name: default for name, default in rows}

        for field, value in DEFAULT_USER_SETTINGS.items():
            expected = str(value).lower()
            assert column_defaults[field] == expected, field

    async def test_a_user_who_never_saved_gets_defaults_without_a_write(self, db, user):  # noqa: F811
        settings = await get_user_settings(user["id"])

        assert {k: settings[k] for k in DEFAULT_USER_SETTINGS} == DEFAULT_USER_SETTINGS
        assert settings["updated_at"] is None
        assert _stored(db, user["id"]) == []

    async def test_partial_updates_change_only_what_was_sent(self, db, user):  # noqa: F811
        first = await update_user_settings(user["id"], {"weekly_digest": True})
        second = await update_user_settings(user["id"], {"alert_score_threshold": 80})

        assert first["weekly_digest"] is True and first["email_notifications"] is True
        assert second["weekly_digest"] is True, "a field left out of the update was reset"
        assert second["alert_score_threshold"] == 80
        assert second["updated_at"]
        assert await get_user_settings(user["id"]) == second
        assert len(_stored(db, user["id"])) == 1

    async def test_settings_are_per_user(self, db, user):  # noqa: F811
        bob = db.table("users").insert({"email": "bob@example.com"}).execute().data[0]

        await update_user_settings(user["id"], {"security_alerts": False})

        assert (await get_user_settings(bob["id"]))["security_alerts"] is True

    async def test_the_database_rejects_an_out_of_range_threshold(self, user):  # noqa: F811
        """The CHECK constraint backs up the API's validation for any writer."""
        import psycopg

        with pytest.raises(psycopg.errors.CheckViolation):
            await update_user_settings(user["id"], {"alert_score_threshold": 101})

    async def test_unknown_fields_are_refused(self, user):  # noqa: F811
        with pytest.raises(ValueError, match="slack"):
            await update_user_settings(user["id"], {"slack_alerts": True})

    async def test_deleting_the_user_deletes_their_settings(self, db, user):  # noqa: F811
        await update_user_settings(user["id"], {"weekly_digest": True})
        db.table("users").delete().eq("id", user["id"]).execute()

        assert _stored(db, user["id"]) == []


@pytest.fixture
def signed_in(app, user):  # noqa: F811
    from app.api.dependencies import get_current_user

    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@requires_db
class TestHttp:

    def test_get_returns_defaults(self, client, signed_in):
        response = client.get(f"{API}/users/me/settings")

        assert response.status_code == 200, response.text
        assert response.json() == {**DEFAULT_USER_SETTINGS, "updated_at": None}

    def test_put_is_partial_and_persists(self, client, signed_in):
        assert client.put(f"{API}/users/me/settings", json={"weekly_digest": True}).status_code == 200
        response = client.put(f"{API}/users/me/settings", json={"alert_score_threshold": 0})

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["weekly_digest"] is True
        assert body["alert_score_threshold"] == 0
        assert client.get(f"{API}/users/me/settings").json() == body

    def test_an_empty_update_changes_nothing(self, client, signed_in):
        response = client.put(f"{API}/users/me/settings", json={})

        assert response.status_code == 200
        assert response.json()["updated_at"] is None

    def test_invalid_input_is_422_and_nothing_is_stored(self, client, signed_in, db):  # noqa: F811
        response = client.put(
            f"{API}/users/me/settings", json={"weekly_digest": True, "alert_score_threshold": 101}
        )

        assert response.status_code == 422, response.text
        assert _stored(db, signed_in["id"]) == []


class TestValidation:
    """The request model, without a database: what the route turns into a 422."""

    @pytest.mark.parametrize("body", [
        {"alert_score_threshold": 101},
        {"alert_score_threshold": -1},
        {"alert_score_threshold": "80"},
        {"alert_score_threshold": 60.5},
        {"email_notifications": "false"},
        {"email_notifications": 0},
        {"weekly_digest": None},
        # There is no Slack integration; a Slack toggle must not look saved.
        {"slack_alerts": True},
    ])
    def test_rejected(self, body):
        from pydantic import ValidationError

        from app.schemas import UserSettingsUpdate

        with pytest.raises(ValidationError):
            UserSettingsUpdate(**body)

    def test_changes_are_only_the_fields_sent(self):
        from app.schemas import UserSettingsUpdate

        assert UserSettingsUpdate(weekly_digest=False).changes() == {"weekly_digest": False}
        assert UserSettingsUpdate(alert_score_threshold=0).changes() == {"alert_score_threshold": 0}
        assert UserSettingsUpdate().changes() == {}
