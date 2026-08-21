"""
Regression tests for the Phase 0 (deploy-blocker) security fixes.

Each test names the AUDIT.md finding it locks down. These are the behaviours that
must never silently regress: every one of them was exploitable before this phase.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# C-5: operational endpoints were unauthenticated
# ---------------------------------------------------------------------------

class TestAdminEndpointsAreGated:
    """C-5: /metrics, /cache/stats and /cache/invalidate were open to anyone."""

    OPS_ENDPOINTS = [
        ("GET", "/metrics"),
        ("GET", "/api/v1/cache/stats"),
        ("DELETE", "/api/v1/cache/invalidate/github:repos:*"),
    ]

    @pytest.mark.parametrize("method,path", OPS_ENDPOINTS)
    def test_disabled_when_no_admin_key_configured(self, client, monkeypatch, method, path):
        """With ADMIN_API_KEY unset the ops surface must fail closed, not open."""
        import main
        import app.api.dependencies as deps
        monkeypatch.setattr(main.settings, "ADMIN_API_KEY", None, raising=False)
        monkeypatch.setattr(deps.settings, "ADMIN_API_KEY", None, raising=False)

        assert client.request(method, path).status_code == 404

    @pytest.mark.parametrize("method,path", OPS_ENDPOINTS)
    def test_rejected_without_key(self, client, admin_key, method, path):
        assert client.request(method, path).status_code == 404

    @pytest.mark.parametrize("method,path", OPS_ENDPOINTS)
    def test_rejected_with_wrong_key(self, client, admin_key, method, path):
        response = client.request(method, path, headers={"X-Admin-Key": "wrong"})
        assert response.status_code == 404

    def test_accepted_with_correct_key(self, client, admin_key):
        response = client.get("/metrics", headers={"X-Admin-Key": admin_key})
        assert response.status_code == 200

    def test_wildcard_flush_is_refused(self, client, admin_key):
        """`*` would drop every tenant's cache and stall Redis via KEYS."""
        response = client.delete(
            "/api/v1/cache/invalidate/*",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 400
        assert "entire keyspace" in response.json()["detail"]

    def test_admin_key_comparison_is_constant_time(self):
        """A timing-variable compare on an ops key is a byte-at-a-time oracle."""
        import inspect
        import app.api.dependencies as deps
        source = inspect.getsource(deps.require_admin)
        assert "compare_digest" in source


# ---------------------------------------------------------------------------
# C-5 (second half): KEYS -> SCAN
# ---------------------------------------------------------------------------

class TestCacheInvalidationDoesNotBlockRedis:
    """C-5: invalidate() used KEYS, which is O(N) and blocks the Redis loop."""

    def test_invalidate_uses_scan_not_keys(self):
        from app.services.redis_service import RedisService

        service = RedisService.__new__(RedisService)
        service.available = True
        service.client = MagicMock()
        service.client.scan_iter.return_value = iter([b"k1", b"k2"])
        service.client.delete.return_value = 2

        deleted = service.invalidate("github:repos:*")

        assert deleted == 2
        service.client.scan_iter.assert_called_once()
        service.client.keys.assert_not_called()

    def test_invalidate_deletes_in_bounded_batches(self):
        from app.services.redis_service import RedisService

        service = RedisService.__new__(RedisService)
        service.available = True
        service.client = MagicMock()
        service.client.scan_iter.return_value = iter([f"k{i}".encode() for i in range(1200)])
        service.client.delete.side_effect = lambda *keys: len(keys)

        deleted = service.invalidate("db:repo:*")

        assert deleted == 1200
        # 500 + 500 + 200 - never one giant DEL
        assert service.client.delete.call_count == 3
        for call in service.client.delete.call_args_list:
            assert len(call.args) <= 500


# ---------------------------------------------------------------------------
# C-6: Cache-Control: public on per-user payloads
# ---------------------------------------------------------------------------

class TestResponseCacheHeaders:
    """C-6: authenticated responses were marked publicly cacheable."""

    def test_authenticated_responses_are_never_public(self, app):
        from app.middleware.cache_middleware import ResponseCacheMiddleware
        import inspect

        source = inspect.getsource(ResponseCacheMiddleware.dispatch)
        assert "private, no-store" in source

    def test_cache_key_uses_full_digest_not_truncated_md5(self):
        """A 32-bit per-user key collides by the birthday bound."""
        from app.middleware.cache_middleware import ResponseCacheMiddleware

        middleware = ResponseCacheMiddleware.__new__(ResponseCacheMiddleware)

        def make_request(token):
            request = MagicMock()
            request.method = "GET"
            request.url.path = "/api/v1/analysis/repositories/abc/results"
            request.query_params = {}
            request.headers = {"authorization": f"Bearer {token}"}
            return request

        key_a = middleware._get_cache_key(make_request("token-a"))
        key_b = middleware._get_cache_key(make_request("token-b"))

        assert key_a != key_b
        # sha256 hex digest, prefixed
        assert len(key_a.split(":")[-1]) == 64

    def test_anonymous_and_authenticated_keys_differ(self):
        from app.middleware.cache_middleware import ResponseCacheMiddleware

        middleware = ResponseCacheMiddleware.__new__(ResponseCacheMiddleware)

        anon = MagicMock()
        anon.method = "GET"
        anon.url.path = "/api/v1/github/repositories"
        anon.query_params = {}
        anon.headers = {}

        authed = MagicMock()
        authed.method = "GET"
        authed.url.path = "/api/v1/github/repositories"
        authed.query_params = {}
        authed.headers = {"authorization": "Bearer x"}

        assert middleware._get_cache_key(anon) != middleware._get_cache_key(authed)


# ---------------------------------------------------------------------------
# C-2 / C-3 / C-4: team authorisation
# ---------------------------------------------------------------------------

@pytest.fixture
def team_service():
    from app.services.team_service import TeamService
    service = TeamService.__new__(TeamService)
    service.db = MagicMock()
    return service


class TestRepositoryAssignmentRequiresOwnership:
    """C-2: any team member could assign ANY repository to their own team."""

    @pytest.mark.asyncio
    async def test_rejects_repository_the_actor_does_not_own(self, team_service):
        team_service.get_team = AsyncMock(return_value={
            "id": "team-1", "organization_id": "org-1", "manager_id": "someone-else"
        })
        # The ownership-scoped query returns nothing for a foreign repo.
        team_service.db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = \
            MagicMock(data=[])

        result = await team_service.assign_repository_to_team(
            repository_id="victim-repo-uuid",
            team_id="team-1",
            assigned_by="attacker-user-id",
        )

        assert result is False

    @pytest.mark.asyncio
    async def test_ownership_query_filters_on_actor(self, team_service):
        """The repo lookup must be scoped by user_id, not fetched then compared."""
        import inspect
        from app.services.team_service import TeamService

        source = inspect.getsource(TeamService.assign_repository_to_team)
        assert '.eq("user_id", assigned_by)' in source
        # the old membership-based escape hatch must be gone
        assert "Check if user is member of team" not in source


class TestTeamMembershipRequiresAdmin:
    """C-3: any team member could add anyone, with any role, and evict anyone."""

    @pytest.mark.asyncio
    async def test_plain_member_cannot_add_a_member(self, team_service):
        team_service._get_team_row = MagicMock(return_value={
            "id": "team-1", "organization_id": "org-1", "manager_id": "the-manager"
        })
        team_service._is_team_admin = AsyncMock(return_value=False)
        team_service.find_user_by_identifier = AsyncMock(return_value={"id": "victim"})

        result = await team_service.add_team_member(
            team_id="team-1",
            user_identifier="victim@example.com",
            role="manager",
            added_by="plain-member",
        )

        assert result is False
        team_service.find_user_by_identifier.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_plain_member_cannot_remove_another_member(self, team_service):
        team_service._get_team_row = MagicMock(return_value={
            "id": "team-1", "organization_id": "org-1", "manager_id": "the-manager"
        })
        team_service._is_team_admin = AsyncMock(return_value=False)

        result = await team_service.remove_team_member(
            team_id="team-1",
            user_id="the-org-owner",
            removed_by="plain-member",
        )

        assert result is False
        team_service.db.table.return_value.delete.assert_not_called()

    @pytest.mark.asyncio
    async def test_member_may_remove_themselves(self, team_service):
        team_service._get_team_row = MagicMock(return_value={
            "id": "team-1", "organization_id": "org-1", "manager_id": "the-manager"
        })
        team_service._is_team_admin = AsyncMock(return_value=False)

        with patch("app.services.organization_service.OrganizationService") as org_cls:
            org_cls.return_value.log_audit_event = AsyncMock(return_value=True)
            result = await team_service.remove_team_member(
                team_id="team-1",
                user_id="self-id",
                removed_by="self-id",
            )

        assert result is True

    @pytest.mark.asyncio
    async def test_invalid_role_is_rejected(self, team_service):
        team_service._get_team_row = MagicMock(return_value={
            "id": "team-1", "organization_id": "org-1", "manager_id": "boss"
        })
        team_service._is_team_admin = AsyncMock(return_value=True)

        with pytest.raises(ValueError, match="Invalid role"):
            await team_service.add_team_member(
                team_id="team-1",
                user_identifier="someone@example.com",
                role="superadmin",
                added_by="boss",
            )

    @pytest.mark.asyncio
    async def test_manager_is_an_admin(self, team_service):
        team = {"id": "team-1", "organization_id": "org-1", "manager_id": "the-manager"}
        assert await team_service._is_team_admin(team, "the-manager") is True

    @pytest.mark.asyncio
    async def test_org_owner_is_an_admin(self, team_service):
        team = {"id": "team-1", "organization_id": "org-1", "manager_id": "someone"}

        with patch("app.services.organization_service.OrganizationService") as org_cls:
            org_cls.return_value.get_organization = AsyncMock(
                return_value={"id": "org-1", "owner_id": "the-owner"}
            )
            assert await team_service._is_team_admin(team, "the-owner") is True

    @pytest.mark.asyncio
    async def test_non_owner_non_manager_is_not_an_admin(self, team_service):
        team = {"id": "team-1", "organization_id": "org-1", "manager_id": "someone"}

        with patch("app.services.organization_service.OrganizationService") as org_cls:
            org_cls.return_value.get_organization = AsyncMock(
                return_value={"id": "org-1", "owner_id": "the-owner"}
            )
            assert await team_service._is_team_admin(team, "rando") is False


class TestTeamMemberListingColumns:
    """C-4: users(*) returned github_access_token and email to every member."""

    def test_never_selects_all_user_columns(self):
        import inspect
        from app.services.team_service import TeamService

        source = inspect.getsource(TeamService.get_team_members)
        # Ignore comment lines - the fix is documented in a comment that names
        # the pattern it removed.
        code = "\n".join(
            line for line in source.splitlines()
            if not line.strip().startswith("#")
        )
        assert "users(*)" not in code

    def test_allowlist_excludes_credentials_and_pii(self):
        from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

        for forbidden in ("github_access_token", "email", "*"):
            assert forbidden not in TEAM_MEMBER_USER_COLUMNS


# ---------------------------------------------------------------------------
# H-4: LIKE wildcard injection / directory harvesting
# ---------------------------------------------------------------------------

class TestLikeWildcardEscaping:
    """H-4: '%' in a search term turned every lookup into a full-table scan."""

    def test_escapes_percent(self):
        from app.services.team_service import escape_like
        assert escape_like("%") == "\\%"

    def test_escapes_underscore(self):
        from app.services.team_service import escape_like
        assert escape_like("a_b") == "a\\_b"

    def test_escapes_backslash_first(self):
        from app.services.team_service import escape_like
        assert escape_like("a\\%b") == "a\\\\\\%b"

    def test_ordinary_input_is_unchanged(self):
        from app.services.team_service import escape_like
        assert escape_like("alice@example.com") == "alice@example.com"

    def test_user_search_does_not_return_email(self):
        import inspect
        from app.api.routes import users

        source = inspect.getsource(users.search_users)
        assert '"id, full_name, github_username, avatar_url"' in source
        assert '"id, email' not in source

    def test_user_search_is_scoped_to_shared_organisations(self):
        import inspect
        from app.api.routes import users

        source = inspect.getsource(users.search_users)
        assert "list_user_organizations" in source
        assert 'in_("id", list(visible_ids))' in source


# ---------------------------------------------------------------------------
# C-1: password change
# ---------------------------------------------------------------------------

class TestPasswordChange:
    """
    C-1: current_password was ignored, and the update was applied through a
    shared client that carried whichever session last signed in - so it could
    change a different user's password.

    Rewritten for local auth. The bug is now impossible by construction rather
    than guarded against: local_auth holds no session state and every function
    takes the user it operates on as an explicit argument.
    """

    @pytest.fixture
    def db(self):
        return MagicMock()

    @pytest.mark.asyncio
    async def test_rejects_wrong_current_password(self, db):
        from app.services import local_auth

        stored = local_auth.hash_password("correct-horse")
        db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value =             MagicMock(data={"id": "user-1", "password_hash": stored})

        changed = await local_auth.change_password(db, "user-1", "wrong", "new-password")

        assert changed is False
        db.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_correct_password_updates_the_addressed_user(self, db):
        from app.services import local_auth

        stored = local_auth.hash_password("correct-horse")
        db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value =             MagicMock(data={"id": "user-1", "password_hash": stored})

        changed = await local_auth.change_password(db, "user-1", "correct-horse", "new-password")

        assert changed is True
        # Scoped to the id we were given - not to "the current session".
        db.table.return_value.update.return_value.eq.assert_called_with("id", "user-1")

    @pytest.mark.asyncio
    async def test_unknown_user_cannot_change_anything(self, db):
        from app.services import local_auth

        db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value =             MagicMock(data=None)

        assert await local_auth.change_password(db, "ghost", "x", "y") is False
        db.table.return_value.update.assert_not_called()

    def test_no_session_state_exists_to_get_wrong(self):
        """The structural reason C-1 cannot recur."""
        import inspect
        from app.services import local_auth

        source = inspect.getsource(local_auth)
        assert "sign_in_with_password" not in source
        assert ".auth." not in source

    def test_password_hashing_survives_the_bcrypt_72_byte_limit(self):
        """
        bcrypt only reads the first 72 bytes. Older libraries truncated
        silently, making two long passphrases that differ late IDENTICAL;
        modern bcrypt raises instead, turning that into a signup crash.
        """
        from app.services.local_auth import hash_password, verify_password

        long_a = "x" * 199 + "a"
        long_b = "x" * 199 + "b"
        stored = hash_password(long_a)

        assert verify_password(long_a, stored) is True
        assert verify_password(long_b, stored) is False

    def test_missing_hash_is_a_failed_login_not_a_crash(self):
        """GitHub-only accounts have no password_hash."""
        from app.services.local_auth import verify_password

        assert verify_password("anything", None) is False

    def test_malformed_hash_is_a_failed_login_not_a_500(self):
        from app.services.local_auth import verify_password

        assert verify_password("anything", "not-a-bcrypt-hash") is False


class TestConnectionPoolIsReused:
    """
    H-8: a new database client was constructed on every service instantiation,
    and services are constructed per request.

    Under Postgres this matters more, not less: these are real connections
    against a server with a hard max_connections, shared across every API and
    Celery worker.
    """

    def test_pool_is_created_once(self):
        from app.db import postgres

        postgres.Database._pool = None
        with patch("app.db.postgres.ConnectionPool", return_value=MagicMock()) as ctor:
            postgres.Database.get_pool()
            postgres.Database.get_pool()
            postgres.Database.get_pool()

        assert ctor.call_count == 1
        postgres.Database._pool = None

    def test_client_is_reused_across_calls(self):
        from app.db import postgres

        postgres._client = None
        with patch.object(postgres.Database, "get_pool", return_value=MagicMock()):
            assert postgres.get_db() is postgres.get_db()
        postgres._client = None

    def test_pool_is_bounded(self):
        """An unbounded pool exhausts the server's connection budget."""
        from app.core.config import get_settings

        settings = get_settings()
        assert 0 < settings.DB_POOL_MAX_SIZE <= 25
        assert settings.DB_POOL_TIMEOUT > 0, "an unbounded wait turns a blip into a hang"


# ---------------------------------------------------------------------------
# Logging: unconfigured structlog in the production entrypoint
# ---------------------------------------------------------------------------

class TestLoggingIsConfigured:
    """main.py never called setup_logging(), so debug logs printed unfiltered."""

    def test_production_entrypoint_configures_logging(self):
        import inspect
        import main

        source = inspect.getsource(main)
        assert "setup_logging()" in source

    def test_emoji_in_log_messages_does_not_raise(self, capsys):
        """~124 log statements contain emoji; a cp1252 stream made them 500s."""
        from app.core.logging import setup_logging, get_logger

        setup_logging(level="INFO")
        logger = get_logger("test")
        logger.info("⚡ cache hit ✅ 🗑️")  # must not raise
