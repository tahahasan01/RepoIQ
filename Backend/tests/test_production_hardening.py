"""
Production launch hardening: security headers on every response, and a
production process that refuses to boot when misconfigured.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

GOOD_SECRET = "k" * 20 + "Q9vR2mZt7LwX4pNa8sHd"          # 40 chars, no placeholder text
GOOD_TOKEN_KEY = "t" * 20 + "B3nF6yJc1KeU5oWq0rGi"


def _prod(**overrides):
    """A production Settings that passes every check, with `overrides` applied."""
    from app.core.config import Settings

    values = dict(
        APP_ENV="production",
        DEBUG=False,
        SECRET_KEY=GOOD_SECRET,
        TOKEN_ENCRYPTION_KEY=GOOD_TOKEN_KEY,
        ALLOWED_ORIGINS="https://app.repoiq.dev,https://www.repoiq.dev",
        LLM_PROVIDER="anthropic",
        ANTHROPIC_API_KEY="sk-ant-api03-realistic-looking-key",
        ANTHROPIC_AUTH_TOKEN=None,
        GITHUB_AUTH_MODE="oauth",
        GITHUB_REDIRECT_URI="https://app.repoiq.dev/auth/github/callback",
    )
    values.update(overrides)
    return Settings(**values)


def _refused(match, **overrides):
    with pytest.raises(ValidationError, match=match):
        _prod(**overrides)


class TestProductionConfigValidation:

    def test_a_correct_production_config_boots(self):
        settings = _prod()
        assert settings.is_production
        assert settings.api_docs_enabled is False

    def test_development_is_not_held_to_production_rules(self):
        from app.core.config import Settings

        settings = Settings(
            APP_ENV="development", SECRET_KEY="short", ALLOWED_ORIGINS="http://localhost:8080", DEBUG=True,
        )
        assert settings.api_docs_enabled is True

    @pytest.mark.parametrize("secret", [
        "too-short-but-random-Zx81",
        "your-super-secret-key-change-this-in-production",
        "test_secret_key_for_ci_testing_12345678901234567890",
        "CHANGEME" + "x" * 40,
    ])
    def test_weak_or_placeholder_secret_keys_are_refused(self, secret):
        _refused("SECRET_KEY must be a random value", SECRET_KEY=secret)

    def test_the_token_encryption_key_is_required(self):
        _refused("TOKEN_ENCRYPTION_KEY must be set", TOKEN_ENCRYPTION_KEY=None)
        _refused("TOKEN_ENCRYPTION_KEY must be set", TOKEN_ENCRYPTION_KEY="   ")

    def test_the_token_encryption_key_must_differ_from_the_secret_key(self):
        _refused("must differ from SECRET_KEY", TOKEN_ENCRYPTION_KEY=GOOD_SECRET)

    def test_a_short_token_encryption_key_is_refused(self):
        _refused("TOKEN_ENCRYPTION_KEY must be at least", TOKEN_ENCRYPTION_KEY="Zq8Lm2")

    @pytest.mark.parametrize("origins", [
        "",
        " , ",
        "*",
        "http://app.repoiq.dev",
        "https://app.repoiq.dev,http://localhost:8080",
        "https://127.0.0.1:8443",
        "https://localhost",
        "https://app.your-domain.com",  # copied from .env.example unchanged
    ])
    def test_dev_wildcard_and_plain_http_origins_are_refused(self, origins):
        _refused("ALLOWED_ORIGINS", ALLOWED_ORIGINS=origins)

    def test_the_anthropic_provider_needs_a_credential(self):
        _refused("needs ANTHROPIC_API_KEY", ANTHROPIC_API_KEY=None)
        _refused("needs ANTHROPIC_API_KEY", ANTHROPIC_API_KEY="sk-ant-api03-your-key")
        assert _prod(ANTHROPIC_API_KEY=None, ANTHROPIC_AUTH_TOKEN="sk-ant-oat01-real-token")

    def test_debug_is_refused(self):
        _refused("DEBUG must be false", DEBUG=True)

    def test_the_agent_sdk_provider_is_still_refused(self):
        _refused("local development only", LLM_PROVIDER="claude_agent_sdk")

    def test_github_app_mode_needs_its_credentials(self):
        _refused("GITHUB_AUTH_MODE=app needs GITHUB_APP_ID, GITHUB_APP_SLUG", GITHUB_AUTH_MODE="app")
        _refused("GITHUB_AUTH_MODE must be", GITHUB_AUTH_MODE="saml")
        assert _prod(
            GITHUB_AUTH_MODE="app", GITHUB_APP_ID="123", GITHUB_APP_SLUG="repoiq",
            GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
        )

    def test_the_oauth_redirect_must_be_public_https(self):
        _refused("GITHUB_REDIRECT_URI", GITHUB_REDIRECT_URI="http://localhost:8080/auth/github/callback")
        _refused("GITHUB_REDIRECT_URI", GITHUB_REDIRECT_URI="https://app.your-domain.com/auth/github/callback")

    def test_the_env_example_cannot_boot_production_unedited(self):
        """Every REQUIRED blank and placeholder in the template is caught."""
        from pathlib import Path

        from app.core.config import Settings

        template = Path(__file__).resolve().parent.parent / ".env.example"
        with pytest.raises(ValidationError) as excinfo:
            Settings(_env_file=str(template), SECRET_KEY="", ANTHROPIC_API_KEY=None,
                     ALLOWED_ORIGINS="https://app.your-domain.com",
                     GITHUB_REDIRECT_URI="https://app.your-domain.com/auth/github/callback")
        message = str(excinfo.value)
        for setting in ("SECRET_KEY", "TOKEN_ENCRYPTION_KEY", "ALLOWED_ORIGINS", "ANTHROPIC_API_KEY",
                        "GITHUB_REDIRECT_URI"):
            assert setting in message

    def test_every_problem_is_reported_at_once(self):
        with pytest.raises(ValidationError) as excinfo:
            _prod(DEBUG=True, TOKEN_ENCRYPTION_KEY=None, ALLOWED_ORIGINS="http://localhost:3000")
        message = str(excinfo.value)
        assert "DEBUG" in message and "TOKEN_ENCRYPTION_KEY" in message and "ALLOWED_ORIGINS" in message

    def test_docs_can_be_opted_into_in_production(self):
        assert _prod(ENABLE_API_DOCS=True).api_docs_enabled is True

    def test_prod_is_an_alias_for_production(self):
        _refused("DEBUG", APP_ENV="prod", DEBUG=True)

    def test_blank_origins_are_not_allowed_as_empty_strings(self):
        from app.core.config import Settings

        assert Settings(ALLOWED_ORIGINS="https://a.dev, ,https://b.dev,").allowed_origins_list == [
            "https://a.dev", "https://b.dev",
        ]


class TestApiDocsInProduction:

    def test_production_serves_no_docs_or_schema(self):
        from main import docs_config

        app = FastAPI(**docs_config(_prod()))
        client = TestClient(app)
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 404

    def test_opted_in_production_and_development_serve_them(self):
        from app.core.config import Settings
        from main import docs_config

        for settings in (_prod(ENABLE_API_DOCS=True), Settings(APP_ENV="development")):
            client = TestClient(FastAPI(**docs_config(settings)))
            assert client.get("/docs").status_code == 200
            assert client.get("/openapi.json").status_code == 200


EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-opener-policy": "same-origin",
}


class TestSecurityHeaders:

    def test_api_responses_carry_the_headers(self, client):
        response = client.get("/live")

        for name, value in EXPECTED.items():
            assert response.headers[name] == value
        assert "camera=()" in response.headers["permissions-policy"]
        assert "microphone=()" in response.headers["permissions-policy"]
        assert "geolocation=()" in response.headers["permissions-policy"]
        csp = response.headers["content-security-policy"]
        assert "default-src 'none'" in csp and "frame-ancestors 'none'" in csp

    def test_errors_and_not_found_carry_them_too(self, client):
        assert client.get("/no-such-route").headers["x-frame-options"] == "DENY"
        # Unauthenticated: answered by a dependency, not a route body.
        assert client.get("/api/v1/users/me/settings").headers["x-content-type-options"] == "nosniff"

    def test_hsts_is_not_sent_outside_production(self, client):
        assert "strict-transport-security" not in client.get("/live").headers

    def test_cors_preflight_carries_them(self, client):
        response = client.options(
            "/api/v1/users/me/settings",
            headers={"Origin": "http://localhost:8080", "Access-Control-Request-Method": "GET"},
        )
        assert response.headers["x-frame-options"] == "DENY"

    def test_docs_pages_get_a_policy_that_lets_them_render(self, client):
        """Development serves /docs; its CDN assets must be allowed, the API's must not be."""
        docs = client.get("/docs")
        assert docs.status_code == 200
        docs_csp = docs.headers["content-security-policy"]
        assert "https://cdn.jsdelivr.net" in docs_csp
        assert "cdn.jsdelivr.net" not in client.get("/openapi.json").headers["content-security-policy"]

    def test_unhandled_exceptions_carry_them(self):
        """The 500 handler answers from outside the middleware stack."""
        import main

        app = FastAPI()
        app.add_exception_handler(Exception, main.global_exception_handler)

        @app.get("/boom")
        async def boom():
            raise RuntimeError("secret detail")

        response = TestClient(app, raise_server_exceptions=False).get("/boom")
        assert response.status_code == 500
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "secret detail" not in response.text

    def _app(self, **kwargs):
        from starlette.responses import JSONResponse

        from app.middleware.security_headers import SecurityHeadersMiddleware

        app = FastAPI()

        @app.get("/own")
        async def own():
            return JSONResponse({}, headers={"X-Frame-Options": "SAMEORIGIN"})

        app.add_middleware(SecurityHeadersMiddleware, **kwargs)
        return TestClient(app)

    def test_hsts_in_production(self):
        response = self._app(hsts=True).get("/own")
        assert response.headers["strict-transport-security"].startswith("max-age=63072000")

    def test_a_header_the_route_set_is_kept(self):
        assert self._app().get("/own").headers["x-frame-options"] == "SAMEORIGIN"
