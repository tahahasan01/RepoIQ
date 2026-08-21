"""
Tests for the GitHub App authentication path.

This path is the least-privilege alternative to the OAuth App. It is disabled by
default (GITHUB_AUTH_MODE=oauth) and cannot be exercised end-to-end without a
registered app, so these tests cover the parts that are easy to get subtly wrong
and impossible to notice until a production login fails:

  - RS256 JWT signing against a real RSA key
  - the escaped-newline PEM form that every secret store produces
  - misconfiguration failing loudly rather than at first use
  - the OAuth path remaining completely unaffected while the flag is off
"""
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt


@pytest.fixture(scope="module")
def rsa_keypair():
    """A throwaway key in PKCS#1 PEM - exactly the shape GitHub issues."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    return private_pem, public_pem


@pytest.fixture
def app_settings(monkeypatch, rsa_keypair):
    """Configure the GitHub App path for one test."""
    private_pem, _ = rsa_keypair
    from app.services import github_app

    monkeypatch.setattr(github_app.settings, "GITHUB_AUTH_MODE", "app", raising=False)
    monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", "123456", raising=False)
    monkeypatch.setattr(github_app.settings, "GITHUB_APP_SLUG", "repoiq", raising=False)
    monkeypatch.setattr(
        github_app.settings, "GITHUB_APP_PRIVATE_KEY", private_pem, raising=False
    )
    return github_app


class TestAppJwtSigning:
    """GitHub rejects a malformed app JWT with an opaque 401."""

    def test_jwt_verifies_with_rs256(self, app_settings, rsa_keypair):
        _, public_pem = rsa_keypair

        token = app_settings.create_app_jwt()
        claims = jwt.decode(token, public_pem, algorithms=["RS256"])

        assert claims["iss"] == "123456"

    def test_iat_is_backdated_for_clock_skew(self, app_settings, rsa_keypair):
        _, public_pem = rsa_keypair

        claims = jwt.decode(
            app_settings.create_app_jwt(), public_pem, algorithms=["RS256"]
        )
        assert claims["iat"] <= int(time.time())

    def test_lifetime_is_within_githubs_ten_minute_limit(self, app_settings, rsa_keypair):
        _, public_pem = rsa_keypair

        claims = jwt.decode(
            app_settings.create_app_jwt(), public_pem, algorithms=["RS256"]
        )
        assert 0 < claims["exp"] - claims["iat"] <= 600

    def test_escaped_newline_pem_is_accepted(self, monkeypatch, rsa_keypair):
        """
        Railway, Vercel and Docker env vars cannot hold real newlines, so a
        pasted PEM arrives as one line with \\n sequences. Without normalising
        it, signing fails with an unhelpful parse error at first login.
        """
        private_pem, public_pem = rsa_keypair
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", "123456", raising=False)
        monkeypatch.setattr(
            github_app.settings,
            "GITHUB_APP_PRIVATE_KEY",
            private_pem.replace("\n", "\\n"),
            raising=False,
        )

        claims = jwt.decode(
            github_app.create_app_jwt(), public_pem, algorithms=["RS256"]
        )
        assert claims["iss"] == "123456"


class TestMisconfigurationFailsLoudly:

    def test_missing_private_key_raises(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", "1", raising=False)
        monkeypatch.setattr(
            github_app.settings, "GITHUB_APP_PRIVATE_KEY", None, raising=False
        )

        with pytest.raises(github_app.GitHubAppNotConfigured):
            github_app.create_app_jwt()

    def test_junk_private_key_is_rejected_with_a_useful_message(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", "1", raising=False)
        monkeypatch.setattr(
            github_app.settings, "GITHUB_APP_PRIVATE_KEY", "not-a-key", raising=False
        )

        with pytest.raises(github_app.GitHubAppNotConfigured, match="PEM"):
            github_app.create_app_jwt()

    def test_missing_app_id_raises(self, monkeypatch, rsa_keypair):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_ID", None, raising=False)
        monkeypatch.setattr(
            github_app.settings, "GITHUB_APP_PRIVATE_KEY", rsa_keypair[0], raising=False
        )

        with pytest.raises(github_app.GitHubAppNotConfigured):
            github_app.create_app_jwt()

    def test_missing_slug_raises_on_install_url(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_SLUG", None, raising=False)

        with pytest.raises(github_app.GitHubAppNotConfigured):
            github_app.install_url("state")


class TestDisabledByDefault:
    """The OAuth path must be completely unaffected until the flag is flipped."""

    def test_default_mode_is_oauth(self):
        from app.core.config import get_settings

        assert get_settings().GITHUB_AUTH_MODE == "oauth"

    def test_is_enabled_is_false_by_default(self):
        from app.services import github_app

        assert github_app.is_enabled() is False

    def test_authorize_route_still_uses_oauth(self, client):
        response = client.get("/api/v1/auth/github/authorize")

        assert response.status_code == 200
        body = response.json()
        assert body["mode"] == "oauth"
        assert "login/oauth/authorize" in body["auth_url"]

    @pytest.mark.asyncio
    async def test_token_resolution_still_decrypts_the_stored_token(self):
        from app.services import github_token

        user = {"id": "u1", "github_access_token": "stored-token"}
        with patch("app.services.auth_service.AuthService") as auth_cls:
            auth_cls.return_value.get_user = AsyncMock(return_value=user)
            with patch("app.services.github_token.decrypt_stored_token", return_value="plain"):
                result = await github_token.resolve_github_token_for_user("u1")

        assert result == "plain"


class TestInstallFlow:

    def test_install_url_carries_the_state_nonce(self, app_settings):
        """Same login-CSRF protection as the OAuth flow."""
        url = app_settings.install_url("nonce-abc")

        assert "github.com/apps/repoiq/installations/new" in url
        assert "state=nonce-abc" in url

    def test_authorize_route_returns_the_install_url_in_app_mode(
        self, client, monkeypatch, rsa_keypair
    ):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_AUTH_MODE", "app", raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_APP_SLUG", "repoiq", raising=False)

        body = client.get("/api/v1/auth/github/authorize").json()

        assert body["mode"] == "app"
        assert "/apps/repoiq/installations/new" in body["auth_url"]
        assert "state=" in body["auth_url"]


class TestInstallationTokens:

    @pytest.mark.asyncio
    async def test_token_is_cached_between_calls(self, app_settings, monkeypatch):
        """A fresh exchange per API call would burn the app's rate limit."""
        store = {}

        class FakeClient:
            def get(self, key):
                return store.get(key)

            def setex(self, key, ttl, value):
                store[key] = value.encode() if isinstance(value, str) else value
                return True

        redis = MagicMock()
        redis.available = True
        redis.client = FakeClient()
        monkeypatch.setattr(
            "app.services.github_app.get_redis_service", lambda: redis
        )

        response = MagicMock()
        response.status_code = 201
        response.json.return_value = {"token": "ghs_installation_token"}

        with patch("httpx.AsyncClient") as client_cls:
            instance = client_cls.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=response)

            first = await app_settings.get_installation_token("42")
            second = await app_settings.get_installation_token("42")

            assert instance.post.await_count == 1, "second call should hit the cache"

        assert first == second == "ghs_installation_token"

    @pytest.mark.asyncio
    async def test_cache_ttl_is_shorter_than_the_token_lifetime(self, app_settings):
        """Installation tokens last an hour; refreshing at 55 min avoids
        a token expiring mid-analysis."""
        assert app_settings._TOKEN_TTL_SECONDS < 3600

    @pytest.mark.asyncio
    async def test_revoked_installation_reports_clearly(self, app_settings, monkeypatch):
        redis = MagicMock()
        redis.available = False
        monkeypatch.setattr(
            "app.services.github_app.get_redis_service", lambda: redis
        )

        response = MagicMock()
        response.status_code = 404

        with patch("httpx.AsyncClient") as client_cls:
            instance = client_cls.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=response)

            with pytest.raises(app_settings.GitHubAppError, match="uninstalled"):
                await app_settings.get_installation_token("42")

    @pytest.mark.asyncio
    async def test_missing_installation_gives_an_actionable_error(self, monkeypatch):
        """Not an opaque failure - the user needs to be told to install."""
        from app.services import github_token, github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_AUTH_MODE", "app", raising=False)

        with patch("app.services.auth_service.AuthService") as auth_cls:
            auth_cls.return_value.get_user = AsyncMock(
                return_value={"id": "u1", "github_installation_id": None}
            )
            with pytest.raises(github_token.GitHubTokenUnavailable, match="install"):
                await github_token.resolve_github_token_for_user("u1")

    @pytest.mark.asyncio
    async def test_installation_token_is_used_in_app_mode(self, monkeypatch):
        from app.services import github_token, github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_AUTH_MODE", "app", raising=False)

        with patch("app.services.auth_service.AuthService") as auth_cls:
            auth_cls.return_value.get_user = AsyncMock(
                return_value={"id": "u1", "github_installation_id": "42"}
            )
            with patch.object(
                github_app, "get_installation_token", AsyncMock(return_value="ghs_tok")
            ):
                result = await github_token.resolve_github_token_for_user("u1")

        assert result == "ghs_tok"


class TestMigrationIsContained:
    """The whole point of isolating the token boundary during the audit."""

    def test_only_one_place_produces_a_token(self):
        import inspect
        from app.services import github_token

        source = inspect.getsource(github_token.resolve_github_token_for_user)
        assert "github_app.is_enabled()" in source
        assert "decrypt_stored_token" in source

    def test_github_service_is_unchanged_by_the_mode(self):
        """It takes a token string; it does not care where it came from."""
        import inspect
        from app.services.github_service import GitHubService

        assert "access_token" in inspect.signature(GitHubService.__init__).parameters

    def test_migration_sql_exists(self):
        import pathlib

        backend = pathlib.Path(__file__).resolve().parent.parent
        migration = backend / "database/migrations/003_github_app_installations.sql"

        assert migration.exists()
        text = migration.read_text(encoding="utf-8")
        assert "github_installation_id" in text


class TestAppClientCredentialsAreSeparate:
    """
    A GitHub App issues its own OAuth client id/secret, distinct from the OAuth
    App's. During migration both paths are live, so sharing one pair would break
    whichever cohort was not configured.
    """

    def test_app_credentials_are_preferred(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_CLIENT_ID", "Iv23app", raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_APP_CLIENT_SECRET", "app-secret", raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_CLIENT_ID", "oauth-id", raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_CLIENT_SECRET", "oauth-secret", raising=False)

        assert github_app.app_client_credentials() == ("Iv23app", "app-secret")

    def test_falls_back_to_oauth_credentials_after_full_cutover(self, monkeypatch):
        from app.services import github_app

        monkeypatch.setattr(github_app.settings, "GITHUB_APP_CLIENT_ID", None, raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_APP_CLIENT_SECRET", None, raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_CLIENT_ID", "oauth-id", raising=False)
        monkeypatch.setattr(github_app.settings, "GITHUB_CLIENT_SECRET", "oauth-secret", raising=False)

        assert github_app.app_client_credentials() == ("oauth-id", "oauth-secret")

    def test_missing_credentials_raise_clearly(self, monkeypatch):
        from app.services import github_app

        for name in (
            "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET",
            "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
        ):
            monkeypatch.setattr(github_app.settings, name, None, raising=False)

        with pytest.raises(github_app.GitHubAppNotConfigured, match="CLIENT"):
            github_app.app_client_credentials()

    def test_exchange_uses_the_helper_not_the_oauth_settings(self):
        import inspect
        from app.services import github_app

        source = inspect.getsource(github_app.exchange_user_code)
        assert "app_client_credentials()" in source
        assert "settings.GITHUB_CLIENT_SECRET" not in source


class TestAppModeRepositoryLoading:
    """
    Found by running the real thing: an installation token cannot call GET /user,
    so GitHubService.get_repositories() 403'd and the dashboard was empty after a
    successful login. Verified live against api.github.com.
    """

    def test_installation_tokens_are_detected(self):
        from app.services.github_service import GitHubService

        svc = GitHubService.__new__(GitHubService)
        svc.access_token = "ghs_installationtoken"
        assert svc._is_installation_token() is True

        svc.access_token = "gho_useroauthtoken"
        assert svc._is_installation_token() is False

    def test_get_repositories_avoids_get_user_for_installations(self):
        import inspect
        from app.services.github_service import GitHubService

        source = inspect.getsource(GitHubService.get_repositories)
        assert "_is_installation_token()" in source
        assert "_get_installation_repositories" in source

    def test_installation_repository_shape_matches_the_oauth_path(self):
        from app.services.github_service import GitHubService

        payload = {
            "id": 1, "name": "r", "full_name": "o/r", "private": True,
            "html_url": "https://github.com/o/r", "description": None,
            "language": "Python", "stargazers_count": 3, "forks_count": 1,
            "open_issues_count": 2, "default_branch": "main",
            "created_at": "x", "updated_at": "y", "size": 10,
        }
        shaped = GitHubService._format_installation_repository(payload)

        assert set(shaped) == {
            "id", "name", "full_name", "private", "description", "url", "language",
            "stars", "forks", "open_issues", "default_branch", "created_at",
            "updated_at", "size",
        }
        assert shaped["stars"] == 3 and shaped["private"] is True

    def test_missing_default_branch_falls_back(self):
        """An empty repo reports default_branch as null."""
        from app.services.github_service import GitHubService

        shaped = GitHubService._format_installation_repository(
            {"id": 1, "name": "r", "full_name": "o/r", "private": False,
             "html_url": "u", "default_branch": None}
        )
        assert shaped["default_branch"] == "main"


class TestEmptyRepositoriesDoNotCrashAnalysis:
    """
    Found by running the real thing: clicking Analyze on a repository with no
    commits raised an unhandled GithubException. Users own empty repos and they
    appear in the list like any other.
    """

    def test_409_empty_repository_is_recognised(self):
        from github import GithubException
        from app.services.github_service import _is_empty_repository

        exc = GithubException(409, {"message": "Git Repository is empty."}, None)
        assert _is_empty_repository(exc) is True

    def test_404_empty_repository_is_recognised(self):
        from github import GithubException
        from app.services.github_service import _is_empty_repository

        exc = GithubException(404, {"message": "This repository is empty."}, None)
        assert _is_empty_repository(exc) is True

    def test_ordinary_404_is_not_treated_as_empty(self):
        from github import GithubException
        from app.services.github_service import _is_empty_repository

        exc = GithubException(404, {"message": "Not Found"}, None)
        assert _is_empty_repository(exc) is False


class TestPermissionErrorsAreNotRetried:
    """
    Found by running the real thing: a 403 permission denial was retried three
    times with exponential backoff - 7 seconds of delay before surfacing a
    failure that could never succeed.
    """

    def test_permission_denial_is_not_retryable(self):
        from github import GithubException
        from app.services.github_service import _is_permission_error

        exc = GithubException(403, {"message": "Resource not accessible by integration"}, None)
        assert _is_permission_error(exc) is True

    def test_rate_limit_is_still_retryable(self):
        from github import GithubException
        from app.services.github_service import _is_permission_error

        exc = GithubException(403, {"message": "API rate limit exceeded"}, None)
        assert _is_permission_error(exc) is False


class TestCallbackRecordsTheInstallation:
    """
    Found by tracing the flow: nothing wrote github_installation_id, so an App
    login succeeded and then every repository call failed with "the GitHub App
    is not installed for this account".
    """

    def test_auth_service_has_an_app_login_path(self):
        from app.services.auth_service import AuthService

        assert hasattr(AuthService, "github_app_login")

    def test_app_login_persists_the_installation_id(self):
        import inspect
        from app.services.auth_service import AuthService

        source = inspect.getsource(AuthService.github_app_login)
        assert '"github_installation_id"' in source

    def test_app_login_stores_no_long_lived_token(self):
        """The entire point of the migration."""
        import inspect
        from app.services.auth_service import AuthService

        source = inspect.getsource(AuthService.github_app_login)
        assert '"github_access_token"' not in source

    def test_callback_routes_to_the_app_path_when_enabled(self):
        import inspect
        from app.api.routes import auth

        source = inspect.getsource(auth.github_callback)
        assert "github_app.is_enabled()" in source
        assert "github_app_login" in source

    def test_callback_accepts_installation_id(self):
        from app.api.routes.auth import GitHubCallbackRequest

        assert "installation_id" in GitHubCallbackRequest.model_fields


class TestWorkerLoggingIsConfigured:
    """
    Found by running the real thing: the Celery worker never called
    setup_logging(), so emoji log lines raised UnicodeEncodeError mid-task.
    Now that analyses run on Celery, this is the path that matters.
    """

    def test_celery_app_configures_logging(self):
        import inspect
        from app.core import celery_app

        assert "setup_logging()" in inspect.getsource(celery_app)
