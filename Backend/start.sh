#!/bin/bash

echo "Starting CodeRabbit AI Backend..."

if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please copy .env.example to .env and configure it."
    exit 1
fi

echo "Starting Redis..."
redis-server --daemonize yes

echo "Starting Celery worker..."
celery -A app.core.celery_app worker --loglevel=info --detach

echo "Starting FastAPI server..."
uvicorn main:app --host 0.0.0.0 --port 8000

echo "Backend started successfully!"
echo "API Documentation: http://localhost:8000/docs"
