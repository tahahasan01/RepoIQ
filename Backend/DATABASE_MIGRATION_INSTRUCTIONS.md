# Database migrations

One command brings any database - empty or years old - to the current schema:

```bash
cd Backend
python -m app.db.migrate      # reads DATABASE_URL
```

Every deploy runs it before the new code serves traffic (`railway.toml`
`preDeployCommand`, the Procfile `release` phase, the `migrate` service in
`docker-compose.yml`, and `start.sh`).

## How it works

- `database/postgres_schema.sql` is the **baseline**: the full schema as of the
  move off Supabase. It is written entirely with `IF NOT EXISTS`, so it is
  applied on every run - a no-op on an existing database.
- Each file in `database/migrations/` is applied **once**, in numeric order, in
  its own transaction, and recorded in `schema_migrations`. A failed migration
  rolls back completely and is retried on the next run.
- A Postgres advisory lock serialises concurrent runs, so two instances
  deploying at once cannot apply a migration twice.

## Changing the schema

1. Add `database/migrations/NNN_short_description.sql`, numbered after the
   highest existing file.
2. Write it idempotently: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
   EXISTS`, `ADD COLUMN IF NOT EXISTS`. `tests/test_migrate.py` enforces this.
3. **Do not edit the baseline.** Changing both writes every change twice and the
   copies drift. `tests/test_schema_matches_code.py` reads the baseline plus
   every migration and fails if the code uses a column neither defines.
4. Run `python -m app.db.migrate` locally and the test suite.

## History

The Supabase-era files (`schema.sql`, migrations 001-003, and the Alembic
setup) were removed. 001-003 are folded into the baseline; Alembic was never
able to run against this database (its baseline was an empty "tables exist in
Supabase" revision and its dependencies were not installed).
