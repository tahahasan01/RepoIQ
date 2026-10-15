"""
The schema migration runner (app/db/migrate.py).

Each test gets its own freshly created database, derived from
TEST_DATABASE_URL, and drops it afterwards - the runner is exercised from
genuinely empty, which the shared test database cannot be.
"""
import re
import urllib.parse
import uuid

import pytest

from tests.test_query_builder import TEST_DATABASE_URL, _assert_disposable, requires_db

from app.db import migrate as runner


def _with_db(url: str, name: str) -> str:
    parsed = urllib.parse.urlparse(url)
    return urllib.parse.urlunparse(parsed._replace(path=f"/{name}"))


@pytest.fixture
def empty_db():
    import psycopg

    _assert_disposable(TEST_DATABASE_URL)
    name = f"repoiq_migrate_test_{uuid.uuid4().hex[:8]}"
    admin = _with_db(TEST_DATABASE_URL, "postgres")
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    url = _with_db(TEST_DATABASE_URL, name)
    yield url
    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def _versions():
    return [re.match(r"^(\d+)_", p.name).group(1) for p in runner.migration_files()]


def _scalar(url, query):
    import psycopg

    with psycopg.connect(url) as conn:
        return conn.execute(query).fetchone()[0]


@requires_db
class TestRunner:

    def test_builds_an_empty_database_and_records_every_migration(self, empty_db):
        applied = runner.migrate(empty_db)

        assert applied == _versions()
        assert _scalar(empty_db, "SELECT to_regclass('public.users') IS NOT NULL")
        assert _scalar(empty_db, "SELECT count(*) FROM schema_migrations") == len(_versions())

    def test_second_run_applies_nothing(self, empty_db):
        runner.migrate(empty_db)

        assert runner.migrate(empty_db) == []

    def test_upgrades_a_database_created_before_the_runner(self, empty_db):
        """
        Databases created from the baseline before the runner existed have no
        schema_migrations table. Every migration must still be applied to them.
        """
        import psycopg

        with psycopg.connect(empty_db, autocommit=True) as conn:
            conn.execute(runner.BASELINE.read_text(encoding="utf-8"))

        assert runner.migrate(empty_db) == _versions()
        assert _scalar(
            empty_db,
            "SELECT count(*) FROM information_schema.columns "
            "WHERE table_name = 'chat_messages' AND column_name = 'context_files'",
        ) == 1

    def test_every_migration_is_idempotent(self, empty_db):
        """A database restored from a mid-deploy backup may see one again."""
        import psycopg

        runner.migrate(empty_db)
        with psycopg.connect(empty_db, autocommit=True) as conn:
            for path in runner.migration_files():
                conn.execute(path.read_text(encoding="utf-8"))

    def test_a_failed_migration_leaves_no_record(self, empty_db, tmp_path, monkeypatch):
        bad = tmp_path / "migrations"
        bad.mkdir()
        (bad / "900_broken.sql").write_text("ALTER TABLE no_such_table ADD COLUMN x INT;")
        monkeypatch.setattr(runner, "MIGRATIONS_DIR", bad)

        with pytest.raises(Exception):
            runner.migrate(empty_db)

        assert _scalar(empty_db, "SELECT count(*) FROM schema_migrations WHERE version = '900'") == 0


class TestMigrationFiles:

    def test_names_are_numbered_and_unique(self):
        assert runner.migration_files()

    def test_rejects_a_misnamed_file(self, tmp_path, monkeypatch):
        (tmp_path / "add_thing.sql").write_text("SELECT 1;")
        monkeypatch.setattr(runner, "MIGRATIONS_DIR", tmp_path)

        with pytest.raises(ValueError):
            runner.migration_files()

    def test_creates_are_guarded(self):
        """Idempotency starts with IF NOT EXISTS on everything a file creates."""
        unguarded = []
        for path in runner.migration_files():
            sql = re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))
            for stmt in re.findall(
                r"\b(CREATE (?:UNIQUE )?(?:TABLE|INDEX)|ADD COLUMN)\b(?! IF NOT EXISTS)", sql
            ):
                unguarded.append(f"{path.name}: {stmt}")
        assert not unguarded, unguarded
