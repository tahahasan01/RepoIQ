"""
Tests for the PostgREST-shaped query builder over PostgreSQL.

These run against a real database when one is reachable, because the whole point
of this module is producing SQL that Postgres actually accepts - a mocked test
would assert my assumptions rather than the database's behaviour. They skip when
no database is configured, so the suite still runs on a clean checkout.

Set TEST_DATABASE_URL to point at a throwaway database:
    docker run -d --name repoiq-postgres -e POSTGRES_PASSWORD=repoiq_dev \\
        -e POSTGRES_USER=repoiq -e POSTGRES_DB=repoiq -p 5433:5432 postgres:16-alpine
    psql < database/postgres_schema.sql
"""
import os
import pathlib
import uuid

import pytest

BACKEND = pathlib.Path(__file__).resolve().parent.parent

# Defaults to a SEPARATE database from the application's. These fixtures
# TRUNCATE, so sharing one with the running app destroys its data - which is
# exactly what happened during development before this was split out.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://repoiq:repoiq_dev@localhost:5433/repoiq_test"
)


def _database_available() -> bool:
    try:
        import psycopg

        with psycopg.connect(TEST_DATABASE_URL, connect_timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _database_available(),
    reason="no PostgreSQL reachable at TEST_DATABASE_URL",
)


def _assert_disposable(url: str) -> None:
    """
    Refuse to run destructive fixtures against a database that is not obviously
    disposable.

    These fixtures TRUNCATE users CASCADE, which removes every user and - via
    the foreign keys - every repository, analysis and finding. Pointed at a real
    database that is total data loss, and the only thing standing between the two
    is an environment variable. So: the database name must say it is for tests,
    and the host must be local.

    Learned the hard way in development: the suite silently wiped the local
    application database because TEST_DATABASE_URL defaulted to the same one.
    """
    import urllib.parse

    parsed = urllib.parse.urlparse(url)
    name = (parsed.path or "").lstrip("/")
    host = parsed.hostname or ""

    if host not in ("localhost", "127.0.0.1", "::1", "postgres", "db"):
        pytest.fail(
            f"Refusing to run destructive tests against a non-local host ({host}). "
            "Point TEST_DATABASE_URL at a disposable local database."
        )

    if not any(marker in name.lower() for marker in ("test", "_ci", "tmp")):
        pytest.fail(
            f"Refusing to TRUNCATE database {name!r}: the name does not identify "
            "it as a test database. Create one (e.g. repoiq_test) and set "
            "TEST_DATABASE_URL."
        )


@pytest.fixture
def db(monkeypatch):
    """A client pointed at the test database, with a clean users table."""
    from app.db import postgres

    _assert_disposable(TEST_DATABASE_URL)

    monkeypatch.setattr(
        postgres.settings, "DATABASE_URL", TEST_DATABASE_URL, raising=False
    )
    postgres.Database._pool = None
    postgres._client = None

    client = postgres.get_db()

    with postgres.Database.get_pool().connection() as conn:
        conn.execute("TRUNCATE users CASCADE")

    yield client

    with postgres.Database.get_pool().connection() as conn:
        conn.execute("TRUNCATE users CASCADE")
    postgres.Database.close()
    postgres._client = None


@pytest.fixture
def user(db):
    return db.table("users").insert(
        {"email": "alice@example.com", "full_name": "Alice"}
    ).execute().data[0]


# ---------------------------------------------------------------------------
# JSON-shape compatibility - the reason ~350 call sites keep working
# ---------------------------------------------------------------------------

@requires_db
class TestValuesLookLikeJSON:
    """
    The codebase was written against PostgREST, which speaks JSON. psycopg
    returns native Python types, and the difference is not cosmetic:

      - UUIDs are used as dict keys, sliced for log redaction (user_id[:8]),
        interpolated into Redis cache keys, and compared to JWT claim strings.
        A uuid.UUID breaks every one of those - subscripting one raises.
      - timestamps go straight into API responses.
      - Decimal is not JSON-serialisable.
    """

    def test_uuid_is_a_string(self, user):
        assert isinstance(user["id"], str)
        uuid.UUID(user["id"])  # still a valid UUID

    def test_uuid_can_be_sliced_for_log_redaction(self, user):
        assert len(user["id"][:8]) == 8

    def test_timestamp_is_an_iso_string(self, user):
        assert isinstance(user["created_at"], str)
        assert "T" in user["created_at"]

    def test_row_is_json_serialisable(self, db, user):
        import json

        db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 1,
            "name": "r", "full_name": "o/r",
        }).execute()
        rows = db.table("repositories").select("*").eq("user_id", user["id"]).execute().data

        json.dumps(rows)  # must not raise


# ---------------------------------------------------------------------------
# Operators
# ---------------------------------------------------------------------------

@requires_db
class TestOperators:

    def test_select_eq_single(self, db, user):
        found = db.table("users").select("*").eq("id", user["id"]).single().execute()
        assert found.data["full_name"] == "Alice"

    def test_single_with_no_match_returns_none(self, db):
        """
        supabase-py raised here; callers all wrapped that in try/except and
        treated it as "not found". Returning None is the same outcome without
        using exceptions for an expected result.
        """
        assert db.table("users").select("*").eq("email", "nobody@x.com").single().execute().data is None

    def test_update_returns_the_updated_row(self, db, user):
        result = db.table("users").update({"bio": "hi"}).eq("id", user["id"]).execute()
        assert result.data[0]["bio"] == "hi"

    def test_in_(self, db, user):
        db.table("repositories").insert([
            {"user_id": user["id"], "github_repo_id": 1, "name": "a", "full_name": "o/a"},
            {"user_id": user["id"], "github_repo_id": 2, "name": "b", "full_name": "o/b"},
        ]).execute()

        rows = db.table("repositories").select("name").in_("github_repo_id", [1, 2]).execute()
        assert sorted(r["name"] for r in rows.data) == ["a", "b"]

    def test_empty_in_matches_nothing_without_invalid_sql(self, db, user):
        """`IN ()` is a syntax error; it has to become a FALSE predicate."""
        assert db.table("repositories").select("id").in_("id", []).execute().data == []

    def test_order_and_limit(self, db, user):
        db.table("repositories").insert([
            {"user_id": user["id"], "github_repo_id": 1, "name": "a", "full_name": "o/a", "stars": 5},
            {"user_id": user["id"], "github_repo_id": 2, "name": "b", "full_name": "o/b", "stars": 9},
        ]).execute()

        rows = db.table("repositories").select("*").eq("user_id", user["id"]) \
            .order("stars", desc=True).limit(1).execute()
        assert [r["name"] for r in rows.data] == ["b"]

    def test_offset(self, db, user):
        db.table("repositories").insert([
            {"user_id": user["id"], "github_repo_id": i, "name": f"r{i}", "full_name": f"o/r{i}"}
            for i in range(3)
        ]).execute()

        rows = db.table("repositories").select("id").eq("user_id", user["id"]) \
            .order("github_repo_id").limit(2).offset(1).execute()
        assert len(rows.data) == 2

    def test_ilike_is_case_insensitive(self, db, user):
        rows = db.table("users").select("full_name").ilike("full_name", "%LIC%").execute()
        assert [r["full_name"] for r in rows.data] == ["Alice"]

    def test_not_is_null(self, db, user):
        db.table("users").insert({"email": "b@x.com"}).execute()  # no full_name

        rows = db.table("users").select("full_name").not_.is_("full_name", "null").execute()
        assert [r["full_name"] for r in rows.data] == ["Alice"]

    def test_is_null(self, db, user):
        db.table("users").insert({"email": "b@x.com"}).execute()

        rows = db.table("users").select("email").is_("full_name", "null").execute()
        assert [r["email"] for r in rows.data] == ["b@x.com"]

    def test_upsert_updates_in_place(self, db, user):
        repo = db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 1, "name": "r", "full_name": "o/r",
        }).execute().data[0]

        for count in (3, 7):
            db.table("developer_contributions").upsert({
                "user_id": user["id"], "repository_id": repo["id"],
                "period_start": "2026-01-01", "period_end": "2026-02-01",
                "commits_count": count,
            }, on_conflict="user_id,repository_id,period_start,period_end").execute()

        rows = db.table("developer_contributions").select("commits_count") \
            .eq("user_id", user["id"]).execute()
        assert [r["commits_count"] for r in rows.data] == [7]

    def test_delete_cascades(self, db, user):
        db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 1, "name": "r", "full_name": "o/r",
        }).execute()

        db.table("users").delete().eq("id", user["id"]).execute()

        assert db.table("repositories").select("id").eq("user_id", user["id"]).execute().data == []


# ---------------------------------------------------------------------------
# Embedded resources
# ---------------------------------------------------------------------------

@requires_db
class TestEmbeddedResources:
    """PostgREST's `select("*, users(...)")` becomes a LEFT JOIN + JSON object."""

    def test_embedded_user_is_nested(self, db, user):
        org = db.table("organizations").insert(
            {"name": "Acme", "owner_id": user["id"]}
        ).execute().data[0]
        team = db.table("teams").insert(
            {"organization_id": org["id"], "name": "Core"}
        ).execute().data[0]
        db.table("team_members").insert(
            {"team_id": team["id"], "user_id": user["id"], "role": "member"}
        ).execute()

        rows = db.table("team_members").select(
            "team_id, user_id, role, users(id, full_name, avatar_url, github_username)"
        ).eq("team_id", team["id"]).execute()

        row = rows.data[0]
        assert row["role"] == "member"
        assert row["users"]["full_name"] == "Alice"

    def test_the_C4_allowlist_still_holds_over_postgres(self, db, user):
        """
        AUDIT.md C-4 was `users(*)` leaking github_access_token and email to
        every team member. The column allowlist must survive the migration -
        the join is now SQL rather than PostgREST, so this re-verifies it.
        """
        from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

        org = db.table("organizations").insert(
            {"name": "Acme", "owner_id": user["id"]}
        ).execute().data[0]
        team = db.table("teams").insert(
            {"organization_id": org["id"], "name": "Core"}
        ).execute().data[0]
        db.table("team_members").insert(
            {"team_id": team["id"], "user_id": user["id"], "role": "member"}
        ).execute()

        rows = db.table("team_members").select(
            f"team_id, user_id, role, users({TEAM_MEMBER_USER_COLUMNS})"
        ).eq("team_id", team["id"]).execute()

        embedded = rows.data[0]["users"]
        assert "github_access_token" not in embedded
        assert "email" not in embedded


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

@requires_db
class TestUnscopedMutationsAreRefused:
    """
    An UPDATE or DELETE with no WHERE rewrites or empties the whole table. Every
    caller in this codebase scopes by id or user_id; one that does not is a bug,
    and it should fail loudly rather than take the table with it.
    """

    def test_unfiltered_update_is_refused(self, db, user):
        from app.db.query_builder import QueryError

        with pytest.raises(QueryError, match="unfiltered UPDATE"):
            db.table("users").update({"bio": "x"}).execute()

    def test_unfiltered_delete_is_refused(self, db, user):
        from app.db.query_builder import QueryError

        with pytest.raises(QueryError, match="unfiltered DELETE"):
            db.table("users").delete().execute()

    def test_the_row_survives_a_refused_delete(self, db, user):
        from app.db.query_builder import QueryError

        with pytest.raises(QueryError):
            db.table("users").delete().execute()

        assert db.table("users").select("id").eq("id", user["id"]).execute().data


class TestIdentifiersAreValidated:
    """
    Identifiers cannot be bound parameters, so they are the one place a mistake
    becomes injectable. They come from source today, but the guard means a
    future caller cannot pass request data through.
    """

    @pytest.mark.parametrize("bad", [
        "users; DROP TABLE users",
        'users" --',
        "users WHERE 1=1",
        "1users",
        "",
    ])
    def test_unsafe_identifiers_are_rejected(self, bad):
        from app.db.query_builder import QueryError, _ident

        with pytest.raises(QueryError):
            _ident(bad)

    def test_ordinary_identifiers_pass(self):
        from app.db.query_builder import _ident

        for good in ("users", "analysis_results", "github_repo_id", "_x1"):
            _ident(good)


# ---------------------------------------------------------------------------
# Supabase is gone
# ---------------------------------------------------------------------------

class TestSupabaseIsFullyRemoved:

    def test_no_module_imports_supabase(self):
        import ast

        offenders = []
        for path in list((BACKEND / "app").rglob("*.py")) + [BACKEND / "main.py"]:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module or ""]
                else:
                    continue
                if any(n.split(".")[0] in ("supabase", "postgrest", "gotrue") for n in names):
                    offenders.append(f"{path.name}:{node.lineno}")

        assert not offenders, f"still importing Supabase: {offenders}"

    def test_requirements_no_longer_list_supabase(self):
        text = (BACKEND / "requirements.txt").read_text(encoding="utf-8")
        declared = [
            line for line in text.splitlines()
            if line.strip().startswith(("supabase", "postgrest", "gotrue"))
        ]
        assert not declared

    def test_psycopg_is_declared(self):
        text = (BACKEND / "requirements.txt").read_text(encoding="utf-8")
        assert "psycopg" in text

    def test_settings_use_database_url(self):
        from app.core.config import Settings

        assert "DATABASE_URL" in Settings.model_fields
        for gone in ("SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY"):
            assert gone not in Settings.model_fields
