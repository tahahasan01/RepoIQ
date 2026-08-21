"""
Regression tests for the Phase 1 security fixes.

Each test names the AUDIT.md finding it locks down.
"""
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def fake_redis(monkeypatch):
    """An in-memory stand-in for RedisService with the methods these paths use."""
    store = {}

    class FakeClient:
        def setex(self, key, ttl, value):
            store[key] = value if isinstance(value, bytes) else str(value).encode()
            return True

        def get(self, key):
            return store.get(key)

        def delete(self, *keys):
            return sum(1 for k in keys if store.pop(k, None) is not None)

    service = MagicMock()
    service.available = True
    service.client = FakeClient()
    service._store = store

    for module in (
        "app.services.session_revocation",
        "app.services.oauth_state",
    ):
        monkeypatch.setattr(f"{module}.get_redis_service", lambda: service)

    return service


@pytest.fixture
def unavailable_redis(monkeypatch):
    service = MagicMock()
    service.available = False
    for module in ("app.services.session_revocation", "app.services.oauth_state"):
        monkeypatch.setattr(f"{module}.get_redis_service", lambda: service)
    return service


# ---------------------------------------------------------------------------
# H-1: logout did nothing
# ---------------------------------------------------------------------------

class TestSessionRevocation:
    """H-1: logout wrote to a nonexistent attribute and nothing read the key."""

    def test_tokens_carry_iat(self):
        from app.core.security import create_access_token, verify_token

        token = create_access_token({"sub": "user-1"})
        payload = verify_token(token, "access")

        assert payload is not None
        assert "iat" in payload, "revocation cannot work without iat"

    def test_refresh_tokens_carry_jti(self):
        from app.core.security import create_refresh_token, verify_token

        payload = verify_token(create_refresh_token({"sub": "user-1"}), "refresh")
        assert payload.get("jti"), "rotation cannot detect reuse without jti"

    def test_refresh_jtis_are_unique(self):
        from app.core.security import create_refresh_token, verify_token

        a = verify_token(create_refresh_token({"sub": "u"}), "refresh")["jti"]
        b = verify_token(create_refresh_token({"sub": "u"}), "refresh")["jti"]
        assert a != b

    def test_token_is_valid_before_revocation(self, fake_redis):
        from app.services.session_revocation import is_token_revoked

        assert is_token_revoked("user-1", int(time.time())) is False

    def test_token_is_rejected_after_revocation(self, fake_redis):
        from app.services.session_revocation import revoke_user_sessions, is_token_revoked

        issued_at = int(time.time()) - 10
        assert revoke_user_sessions("user-1") is True
        assert is_token_revoked("user-1", issued_at) is True

    def test_token_issued_after_revocation_still_works(self, fake_redis):
        from app.services.session_revocation import revoke_user_sessions, is_token_revoked

        revoke_user_sessions("user-1")
        # Logging straight back in must not be blocked by the watermark.
        assert is_token_revoked("user-1", int(time.time()) + 5) is False

    def test_token_issued_in_the_SAME_SECOND_is_revoked(self, fake_redis):
        """
        Found by exercising logout against a real server: `iat` has whole-second
        resolution, so a token issued in the same second as the revocation was
        indistinguishable from one issued just before it. With a `<` comparison
        those survived - logout did not revoke the very session that called it,
        and refresh-token reuse left the attacker's rotated token working.
        Reproducible just by doing the two calls quickly.
        """
        from app.services.session_revocation import revoke_user_sessions, is_token_revoked

        now = int(time.time())
        revoke_user_sessions("user-1")

        assert is_token_revoked("user-1", now) is True

    def test_a_fresh_login_clears_the_watermark(self, fake_redis):
        """
        Why `<=` is safe: a real login deletes the watermark rather than relying
        on the timestamp comparison to let it through.
        """
        from app.services.session_revocation import (
            revoke_user_sessions, clear_revocation, is_token_revoked
        )

        now = int(time.time())
        revoke_user_sessions("user-1")
        assert is_token_revoked("user-1", now) is True

        clear_revocation("user-1")
        assert is_token_revoked("user-1", now) is False

    def test_revocation_is_scoped_to_one_user(self, fake_redis):
        from app.services.session_revocation import revoke_user_sessions, is_token_revoked

        revoke_user_sessions("user-1")
        assert is_token_revoked("user-2", int(time.time()) - 10) is False

    def test_token_without_iat_is_rejected_once_revoked(self, fake_redis):
        from app.services.session_revocation import revoke_user_sessions, is_token_revoked

        revoke_user_sessions("user-1")
        assert is_token_revoked("user-1", None) is True

    def test_revocation_reports_failure_when_redis_is_down(self, unavailable_redis):
        from app.services.session_revocation import revoke_user_sessions

        # Must not claim success - the route turns this into a 503 rather than
        # telling the user they are logged out while their tokens stay live.
        assert revoke_user_sessions("user-1") is False

    def test_revocation_check_fails_open(self, unavailable_redis):
        from app.services.session_revocation import is_token_revoked

        # Deliberate: a cache outage must not log the entire product out.
        assert is_token_revoked("user-1", int(time.time())) is False

    def test_logout_route_uses_the_revocation_service(self):
        import inspect
        from app.api.routes import auth

        source = inspect.getsource(auth.logout)
        assert "revoke_user_sessions" in source

        # Strip the docstring and comments - the fix is documented in prose that
        # names the broken attribute it replaced.
        code = "\n".join(
            line for line in source.splitlines()
            if not line.strip().startswith("#")
        )
        code = code.split('"""')[0] + code.split('"""')[-1]
        assert "redis_client" not in code, "the attribute that never existed"

    def test_get_current_user_checks_revocation(self):
        import inspect
        from app.api import dependencies

        source = inspect.getsource(dependencies.get_current_user)
        assert "is_token_revoked" in source


class TestRefreshTokenRotation:
    """M-12: refresh tokens were unrevocable for seven days with no reuse detection."""

    def test_current_token_is_accepted(self, fake_redis):
        from app.services.session_revocation import register_refresh_token, consume_refresh_token

        register_refresh_token("user-1", "jti-1")
        assert consume_refresh_token("user-1", "jti-1") is True

    def test_superseded_token_is_rejected(self, fake_redis):
        from app.services.session_revocation import register_refresh_token, consume_refresh_token

        register_refresh_token("user-1", "jti-1")
        register_refresh_token("user-1", "jti-2")  # rotation

        assert consume_refresh_token("user-1", "jti-1") is False

    def test_reuse_revokes_every_session(self, fake_redis):
        from app.services.session_revocation import (
            register_refresh_token, consume_refresh_token, is_token_revoked
        )

        register_refresh_token("user-1", "jti-1")
        register_refresh_token("user-1", "jti-2")

        consume_refresh_token("user-1", "jti-1")  # replay of the old one

        # Both the attacker and the legitimate user are cut off; we cannot tell
        # which is which, so everything goes.
        assert is_token_revoked("user-1", int(time.time()) - 5) is True


# ---------------------------------------------------------------------------
# H-2: rate limiting was bypassable and failed open
# ---------------------------------------------------------------------------

class TestRateLimiterIdentity:
    """H-2: X-Forwarded-For was trusted unconditionally."""

    @pytest.fixture
    def middleware(self):
        from app.middleware.rate_limiter import RateLimitMiddleware
        return RateLimitMiddleware.__new__(RateLimitMiddleware)

    def _request(self, headers=None, peer="203.0.113.9"):
        request = MagicMock()
        request.headers = headers or {}
        request.client.host = peer
        request.state = MagicMock(spec=[])
        return request

    def test_xff_ignored_when_no_proxies_configured(self, middleware, monkeypatch):
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 0, raising=False)

        ip = middleware._client_ip(self._request({"X-Forwarded-For": "1.2.3.4"}))

        assert ip == "203.0.113.9", "spoofed XFF must not create a fresh bucket"

    def test_spoofed_prefix_cannot_shift_identity(self, middleware, monkeypatch):
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 1, raising=False)

        # Attacker sends "evil"; our single proxy appends the real peer.
        ip = middleware._client_ip(
            self._request({"X-Forwarded-For": "9.9.9.9, 203.0.113.9"})
        )

        assert ip == "203.0.113.9"

    def test_real_client_ip_used_behind_two_proxies(self, middleware, monkeypatch):
        """
        Two trusted proxies append two entries: the client, then the inner proxy.
        The client is the entry `trusted` positions from the right.
        """
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 2, raising=False)

        ip = middleware._client_ip(
            self._request({"X-Forwarded-For": "198.51.100.7, 10.0.0.1"})
        )

        assert ip == "198.51.100.7"

    def test_extra_spoofed_hops_do_not_shift_identity(self, middleware, monkeypatch):
        """
        An attacker prepending a hop must not push the trusted index off the real
        client. With two trusted proxies and three entries, the leftmost was
        supplied by the caller and the conservative answer is the second.
        """
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 2, raising=False)

        ip = middleware._client_ip(
            self._request({"X-Forwarded-For": "1.1.1.1, 198.51.100.7, 10.0.0.1"})
        )

        assert ip == "198.51.100.7", "spoofed leading hop must be ignored"

    def test_rotating_xff_yields_one_bucket(self, middleware, monkeypatch):
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 0, raising=False)

        identifiers = {
            middleware._get_identifier(self._request({"X-Forwarded-For": f"1.2.3.{i}"}))
            for i in range(50)
        }

        assert len(identifiers) == 1, "XFF rotation defeated the limiter"

    def test_authenticated_callers_bucket_by_token(self, middleware, monkeypatch):
        import app.middleware.rate_limiter as rl
        monkeypatch.setattr(rl.settings, "TRUSTED_PROXY_COUNT", 0, raising=False)

        a = middleware._get_identifier(self._request({"authorization": "Bearer aaa"}))
        b = middleware._get_identifier(self._request({"authorization": "Bearer bbb"}))

        assert a.startswith("token:") and a != b


class TestRateLimiterFailsClosed:
    """H-2: consume() swallowed errors, so the in-memory fallback was unreachable."""

    @pytest.mark.asyncio
    async def test_redis_failure_propagates(self):
        from app.middleware.rate_limiter import TokenBucket

        redis = MagicMock()
        redis.eval.side_effect = Exception("redis down")
        bucket = TokenBucket(redis, capacity=10, refill_rate=1.0)

        with pytest.raises(Exception):
            await bucket.consume("ip:1.2.3.4")

    def test_middleware_is_installed_unconditionally(self):
        import inspect
        import main

        source = inspect.getsource(main)
        index = source.find("RateLimitMiddleware,")
        assert index != -1
        # The add_middleware call must not sit inside a Redis-ping try block.
        preceding = source[:index]
        assert "Redis connection failed, rate limiting disabled" not in preceding


# ---------------------------------------------------------------------------
# H-3: webhook SSRF
# ---------------------------------------------------------------------------

class TestWebhookUrlGuard:
    """H-3: any URL was accepted and could be triggered on demand."""

    BLOCKED = [
        "http://169.254.169.254/latest/meta-data/",   # AWS/Azure/GCP metadata
        "https://169.254.169.254/",
        "http://localhost:8000/api/v1/cache/invalidate/*",
        "https://127.0.0.1/",
        "https://10.0.0.5/hook",
        "https://192.168.1.1/hook",
        "https://172.16.0.1/hook",
        "https://[::1]/hook",
        "https://0.0.0.0/",
    ]

    @pytest.mark.parametrize("url", BLOCKED)
    def test_internal_destinations_are_refused(self, url):
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        with pytest.raises(UnsafeUrlError):
            resolve_and_validate(url)

    def test_plain_http_is_refused_by_default(self):
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        with pytest.raises(UnsafeUrlError):
            resolve_and_validate("http://example.com/hook")

    def test_non_http_schemes_are_refused(self):
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        for url in ("file:///etc/passwd", "gopher://x/", "ftp://example.com/"):
            with pytest.raises(UnsafeUrlError):
                resolve_and_validate(url)

    def test_public_https_destination_is_allowed(self):
        from app.services.url_guard import resolve_and_validate

        with patch("app.services.url_guard.socket.getaddrinfo") as getaddrinfo:
            getaddrinfo.return_value = [(2, 1, 6, "", ("93.184.216.34", 443))]
            hostname, ips = resolve_and_validate("https://example.com/hook")

        assert hostname == "example.com"
        assert ips == ["93.184.216.34"]

    def test_dns_rebinding_answer_is_refused(self):
        """A hostname resolving to both public and private must be rejected."""
        from app.services.url_guard import resolve_and_validate, UnsafeUrlError

        with patch("app.services.url_guard.socket.getaddrinfo") as getaddrinfo:
            getaddrinfo.return_value = [
                (2, 1, 6, "", ("93.184.216.34", 443)),
                (2, 1, 6, "", ("127.0.0.1", 443)),
            ]
            with pytest.raises(UnsafeUrlError):
                resolve_and_validate("https://rebind.example.com/hook")

    @pytest.mark.asyncio
    async def test_delivery_revalidates_the_destination(self):
        """Registration-time validation alone loses to a later DNS change."""
        from app.services.webhook_service import WebhookService

        service = WebhookService.__new__(WebhookService)
        service.db = MagicMock()
        service.max_retries = 3
        service.retry_delays = [5, 30, 300]
        service._log_delivery = AsyncMock()

        webhook = {"id": "wh-1", "url": "https://evil.example.com/hook", "secret": "s"}

        with patch("app.services.url_guard.socket.getaddrinfo") as getaddrinfo:
            getaddrinfo.return_value = [(2, 1, 6, "", ("169.254.169.254", 443))]
            result = await service.send_webhook(webhook, "test.ping", {})

        assert result is False
        service._log_delivery.assert_awaited_once()
        assert service._log_delivery.await_args.args[2] == "blocked"

    def test_test_endpoint_does_not_use_the_retry_ladder(self):
        """The default ladder sleeps 335s in total on a request-path endpoint."""
        import inspect
        from app.api.routes import webhooks

        source = inspect.getsource(webhooks.test_webhook)
        assert "max_attempts=1" in source

    def test_delivery_does_not_follow_redirects(self):
        import inspect
        from app.services.webhook_service import WebhookService

        source = inspect.getsource(WebhookService.send_webhook)
        assert "follow_redirects=False" in source


# ---------------------------------------------------------------------------
# H-10: GitHub tokens in the Celery broker
# ---------------------------------------------------------------------------

class TestNoTokensInTaskArguments:
    """H-10: Celery serialises kwargs into Redis in plaintext."""

    def test_analysis_task_takes_user_id_not_token(self):
        import inspect
        from app.tasks.analysis_tasks import analyze_repository_task

        params = inspect.signature(analyze_repository_task).parameters
        assert "user_id" in params
        assert "github_token" not in params

    def test_auto_fix_task_takes_user_id_not_token(self):
        import inspect
        from app.tasks.analysis_tasks import auto_fix_issues_task

        params = inspect.signature(auto_fix_issues_task).parameters
        assert "user_id" in params
        assert "github_token" not in params

    def test_route_does_not_enqueue_a_token(self):
        import inspect
        from app.api.routes import analysis

        source = inspect.getsource(analysis.auto_fix_issues)
        assert "github_token=github_token" not in source


# ---------------------------------------------------------------------------
# H-11 / H-12: OAuth state, scope, and response filtering
# ---------------------------------------------------------------------------

class TestOAuthStateNonce:
    """H-11: the callback accepted any code - textbook login CSRF."""

    def test_issued_state_is_accepted_once(self, fake_redis):
        from app.services.oauth_state import issue_state, consume_state

        state = issue_state()
        assert consume_state(state) is True
        assert consume_state(state) is False, "state must be single-use"

    def test_unknown_state_is_refused(self, fake_redis):
        from app.services.oauth_state import consume_state

        assert consume_state("not-a-real-state") is False

    def test_missing_state_is_refused(self, fake_redis):
        from app.services.oauth_state import consume_state

        assert consume_state(None) is False
        assert consume_state("") is False

    def test_state_verification_fails_closed(self, unavailable_redis):
        """Unlike revocation, an unverifiable OAuth callback must be rejected."""
        from app.services.oauth_state import consume_state

        assert consume_state("anything") is False

    def test_authorize_url_carries_a_state_nonce(self, client):
        response = client.get("/api/v1/auth/github/authorize")

        assert response.status_code == 200
        assert "state=" in response.json()["auth_url"]

    def test_authorize_url_requests_repo_scope(self, client):
        """
        `repo` is required, not an oversight. An OAuth App has no read-only
        private-repository scope, and this product analyses private repos and
        opens fix PRs. Narrowing this breaks both. Least privilege here means
        migrating to a GitHub App, not trimming the scope string.
        """
        auth_url = client.get("/api/v1/auth/github/authorize").json()["auth_url"]

        assert "repo" in auth_url
        assert "read%3Auser" in auth_url or "read:user" in auth_url

    def test_scope_is_configurable(self):
        from app.core.config import get_settings

        assert "repo" in get_settings().GITHUB_OAUTH_SCOPES


class TestOAuthCallbackResponseIsFiltered:
    """H-12: `user: dict` shipped the stored github_access_token to the browser."""

    def test_public_user_drops_the_token(self):
        from app.schemas import PublicUser

        record = {
            "id": "user-1",
            "email": "a@example.com",
            "github_access_token": "ghp_supersecret",
            "github_username": "octocat",
        }
        serialized = PublicUser.from_record(record).model_dump()

        assert "github_access_token" not in serialized
        assert serialized["github_username"] == "octocat"

    def test_callback_response_model_is_typed(self):
        from app.api.routes.auth import TokenWithUserResponse
        from app.schemas import PublicUser

        assert TokenWithUserResponse.model_fields["user"].annotation is PublicUser


# ---------------------------------------------------------------------------
# M-4: token encryption key separation
# ---------------------------------------------------------------------------

class TestTokenEncryptionKey:
    """M-4: rotating SECRET_KEY made every stored GitHub token undecryptable."""

    def _service(self, secret, dedicated):
        from app.services.encryption_service import EncryptionService

        with patch("app.services.encryption_service.settings") as s:
            s.SECRET_KEY = secret
            s.TOKEN_ENCRYPTION_KEY = dedicated
            return EncryptionService()

    def test_roundtrip_with_dedicated_key(self):
        service = self._service("jwt-signing-key", "dedicated-token-key-value")
        assert service.decrypt(service.encrypt("ghp_abc")) == "ghp_abc"

    def test_secret_key_rotation_does_not_orphan_tokens(self):
        """The whole point: JWT key rotation must not disconnect every user."""
        service = self._service("original-secret", "dedicated-token-key-value")
        ciphertext = service.encrypt("ghp_abc")

        rotated = self._service("a-completely-new-secret", "dedicated-token-key-value")
        assert rotated.decrypt(ciphertext) == "ghp_abc"

    def test_legacy_ciphertext_still_decrypts_after_adopting_a_dedicated_key(self):
        """Migration path: values written under SECRET_KEY must keep working."""
        legacy = self._service("original-secret", None)
        ciphertext = legacy.encrypt("ghp_legacy")

        migrated = self._service("original-secret", "dedicated-token-key-value")
        assert migrated.decrypt(ciphertext) == "ghp_legacy"

    def test_wrong_key_raises_rather_than_returning_garbage(self):
        service = self._service("secret-a", None)
        ciphertext = service.encrypt("ghp_abc")

        other = self._service("secret-b", None)
        with pytest.raises(ValueError):
            other.decrypt(ciphertext)


# ---------------------------------------------------------------------------
# M-13 / M-14: error message leakage
# ---------------------------------------------------------------------------

class TestErrorMessagesAreSanitised:
    """M-13: 56 handlers returned raw exception text to clients."""

    def test_no_raw_exception_details_remain_in_routes(self):
        import pathlib
        import re

        offenders = []
        routes = pathlib.Path("app/api/routes")
        for path in routes.glob("*.py"):
            src = path.read_text(encoding="utf-8")
            for match in re.finditer(r"detail=str\((\w+)\)", src):
                line = src[:match.start()].count("\n") + 1
                # webhooks.py deliberately returns UnsafeUrlError text, and the
                # ValueError handlers return authored validation messages.
                context = src[max(0, match.start() - 400):match.start()]
                if "UnsafeUrlError" in context or "except ValueError" in context:
                    continue
                offenders.append(f"{path.name}:{line}")

        assert not offenders, f"raw exception text returned at: {offenders}"

    def test_safe_detail_returns_a_generic_message(self):
        from app.api.errors import safe_detail, DEFAULT_MESSAGE

        leaky = Exception('relation "users" does not exist at db.abcxyz.supabase.co')
        assert safe_detail(leaky) == DEFAULT_MESSAGE

    def test_safe_detail_honours_a_supplied_message(self):
        from app.api.errors import safe_detail

        assert safe_detail(Exception("boom"), "Failed to fetch repository") == \
            "Failed to fetch repository"

    def test_token_errors_do_not_distinguish_signature_from_malformed(self):
        """M-14: that distinction is a forgery oracle."""
        from app.api.dependencies import _analyze_token_error, GENERIC_AUTH_ERROR

        malformed = _analyze_token_error("not-a-jwt")
        bad_signature = _analyze_token_error(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
            ".eyJzdWIiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5fQ"
            ".xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        )

        assert malformed == bad_signature == GENERIC_AUTH_ERROR

    def test_expiry_remains_distinguishable(self):
        """The SPA needs this to decide whether to refresh; it leaks nothing."""
        from datetime import timedelta
        from app.core.security import create_access_token
        from app.api.dependencies import _analyze_token_error

        expired = create_access_token({"sub": "u"}, expires_delta=timedelta(seconds=-60))
        assert "expired" in _analyze_token_error(expired).lower()


# ---------------------------------------------------------------------------
# M-11: unverified email in account matching
# ---------------------------------------------------------------------------

class TestGitHubEmailMustBeVerified:
    """M-11: an unverified address was accepted as an account-matching key."""

    def test_only_verified_addresses_are_selected(self):
        import inspect
        from app.services.auth_service import AuthService

        source = inspect.getsource(AuthService.github_oauth)
        assert 'e.get("verified")' in source

    def test_synthetic_fallback_uses_noreply_domain(self):
        """`user@github.com` is a real deliverable domain and could collide."""
        import inspect
        from app.services.auth_service import AuthService

        source = inspect.getsource(AuthService.github_oauth)
        assert "users.noreply.github.com" in source
