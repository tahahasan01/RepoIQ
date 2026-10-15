"""
GitHub account lifecycle, installation tokens, plans and cancellation.
"""
import asyncio
import inspect
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestDisconnect:

    def test_disconnect_clears_the_installation(self):
        """In GitHub App mode tokens are minted from the installation id."""
        from app.api.routes import github

        update = AsyncMock()
        with patch.object(github.AuthService, "update_user", update), \
                patch.object(github.AuthService, "__init__", lambda self: None):
            asyncio.run(github.disconnect_github({"id": "u1"}))

        fields = update.call_args.args[1]
        assert fields["github_installation_id"] is None
        assert fields["github_connected"] is False

    def test_a_disconnected_account_gets_no_token(self):
        from app.services import github_token

        with patch("app.services.auth_service.AuthService") as auth_cls:
            auth_cls.return_value.get_user = AsyncMock(return_value={
                "id": "u1", "github_connected": False, "github_installation_id": "123",
            })
            with pytest.raises(github_token.GitHubTokenUnavailable):
                asyncio.run(github_token.resolve_github_token_for_user("u1"))


class TestInstallationTokens:

    def test_cached_tokens_keep_enough_lifetime_for_a_run(self):
        """A one-hour token reused at 55 minutes could expire mid-analysis."""
        from app.services import github_app

        remaining_minutes = (3600 - github_app._TOKEN_TTL_SECONDS) / 60
        assert remaining_minutes >= 20

    def test_no_foreign_installation_is_ever_used(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", "111", raising=False)
        response = MagicMock(status_code=200)
        response.json.return_value = {"installations": [{"id": 9, "app_id": 222}]}
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.get = AsyncMock(return_value=response)
        with patch("app.services.github_app.httpx.AsyncClient", return_value=client):
            assert asyncio.run(github_app.get_user_installation_id("token")) is None

    def test_user_info_does_not_call_get_user_with_an_installation_token(self):
        from app.api.routes import github

        source = inspect.getsource(github.get_github_user_info)
        assert "_is_installation_token()" in source


class TestFreePlanOnly:

    def test_plan_cannot_be_chosen_by_the_client(self):
        """It was client-writable: anyone could mark their organization enterprise."""
        from app.api.routes.organizations import OrganizationCreate, OrganizationUpdate

        created = OrganizationCreate(name="Acme", plan_type="enterprise")
        assert not hasattr(created, "plan_type")
        assert "plan_type" not in OrganizationUpdate(name="Acme").model_dump()

    def test_service_always_writes_free(self):
        from app.services.organization_service import OrganizationService

        source = inspect.getsource(OrganizationService.create_organization)
        assert '"plan_type": "free"' in source
        assert "plan_type:" not in source.split(") -> ")[0]

    def test_names_are_validated(self):
        from pydantic import ValidationError
        from app.api.routes.organizations import OrganizationCreate

        with pytest.raises(ValidationError):
            OrganizationCreate(name="")
        with pytest.raises(ValidationError):
            OrganizationCreate(name="x" * 101)


class TestCancellation:

    def test_queued_analyses_can_be_cancelled(self):
        from app.api.routes import analysis

        assert '"pending"' in inspect.getsource(analysis.cancel_analysis)


class TestArchitectureEndpoint:

    def test_github_listing_runs_off_the_event_loop(self):
        """get_repository_files is synchronous; awaiting it raised on every call."""
        from app.api.routes import analysis

        source = inspect.getsource(analysis.get_architecture_diagram)
        assert "await github_service.get_repository_files" not in source
        assert "run_blocking(" in source
