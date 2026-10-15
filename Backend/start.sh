#!/bin/bash
# Single-host start: schema, worker, beat, API. Expects DATABASE_URL and REDIS_URL to
# point at running services (see docker-compose.yml for a full local stack).
set -euo pipefail

if [ ! -f ".env" ]; then
    echo "Error: .env not found. Copy .env.example to .env and configure it." >&2
    exit 1
fi

echo "Applying database migrations..."
python -m app.db.migrate

echo "Starting Celery worker..."
celery -A app.core.celery_app worker --loglevel=info -Q celery,analysis --detach

# Beat publishes the scheduled tasks (hourly alert checks) that the worker runs.
echo "Starting Celery beat..."
celery -A app.core.celery_app beat --loglevel=info --detach \
    --schedule /tmp/celerybeat-schedule --pidfile /tmp/celerybeat.pid

echo "Starting RepoIQ API on :8000 (docs at http://localhost:8000/docs)..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
