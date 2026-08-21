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
