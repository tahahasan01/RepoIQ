# RepoIQ backend

FastAPI API, Celery worker and beat for RepoIQ. Setup, configuration,
deployment and testing are documented in the [root README](../README.md).

- Settings: `app/core/config.py`; every one is listed in `.env.example`
- Schema changes: add `database/migrations/NNN_name.sql`, then `python -m app.db.migrate`
- GitHub App setup and migration from OAuth: [GITHUB_APP_MIGRATION.md](GITHUB_APP_MIGRATION.md)
