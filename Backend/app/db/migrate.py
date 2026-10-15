"""
Bring a database to the current schema.

    python -m app.db.migrate            # uses DATABASE_URL

Run on every deploy before the new code starts serving (railway.toml
preDeployCommand, Procfile release, docker-compose `migrate`, start.sh).

How the schema is laid out
--------------------------
database/postgres_schema.sql is the BASELINE: the full schema as of the move
off Supabase, with the Supabase-era migrations 001-003 folded in. It is frozen.
Every change after it is a numbered file in database/migrations/ (004 onward),
applied once, in order, and recorded in schema_migrations.

Do not edit the baseline to change the schema - add a migration. Editing both
writes every change twice, and the copies drift.

Safety
------
- The baseline is CREATE ... IF NOT EXISTS throughout, so it is applied on every
  run: a no-op on an existing database, the full schema on an empty one.
- Each migration runs in its own transaction with its version row, so a failed
  migration leaves no partial schema and no record, and the next run retries it.
- A session advisory lock serialises concurrent runs (two instances deploying
  at once), so a migration is never applied twice.
- Migrations must be idempotent (IF NOT EXISTS). They usually run exactly once,
  but a database restored from a backup taken mid-deploy may see one again.
"""
import pathlib
import re
import sys
from typing import List, Optional

import psycopg

DATABASE_DIR = pathlib.Path(__file__).resolve().parents[2] / "database"
BASELINE = DATABASE_DIR / "postgres_schema.sql"
MIGRATIONS_DIR = DATABASE_DIR / "migrations"

_VERSION = re.compile(r"^(\d{3,})_[a-z0-9_]+\.sql$")
# Arbitrary, fixed: identifies "RepoIQ schema migration" among advisory locks.
_LOCK_ID = 7_201_014_442


def migration_files() -> List[pathlib.Path]:
    files = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if not _VERSION.match(path.name):
            raise ValueError(f"migration file name must be NNN_snake_case.sql: {path.name}")
        files.append(path)
    versions = [_VERSION.match(p.name).group(1) for p in files]
    if len(versions) != len(set(versions)):
        raise ValueError(f"duplicate migration version in {versions}")
    return files


def migrate(database_url: Optional[str] = None) -> List[str]:
    """Apply the baseline and any pending migrations. Returns versions applied."""
    if database_url is None:
        from app.core.config import get_settings

        database_url = get_settings().DATABASE_URL

    applied_now: List[str] = []
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (_LOCK_ID,))
        try:
            with conn.transaction():
                conn.execute(BASELINE.read_text(encoding="utf-8"))
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS schema_migrations ("
                    " version TEXT PRIMARY KEY,"
                    " applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
                )

            done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
            for path in migration_files():
                version = _VERSION.match(path.name).group(1)
                if version in done:
                    continue
                with conn.transaction():
                    conn.execute(path.read_text(encoding="utf-8"))
                    conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)", (version,)
                    )
                applied_now.append(version)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (_LOCK_ID,))
    return applied_now


def main() -> int:
    applied = migrate()
    if applied:
        print(f"Applied migrations: {', '.join(applied)}")
    else:
        print("Schema is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
