.PHONY: help install dev prod test clean docker-build docker-up docker-down

help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Run in development mode"
	@echo "  make prod         - Run in production mode"
	@echo "  make test         - Run tests"
	@echo "  make clean        - Clean cache and temp files"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-up    - Start Docker containers"
	@echo "  make docker-down  - Stop Docker containers"
	@echo "  make format       - Format code with black"
	@echo "  make lint         - Lint code with pylint"

install:
	pip install -r requirements.txt

dev:
	uvicorn main:app --reload --host 0.0.0.0 --port 8000

prod:
	uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

test:
	pytest tests/ -v --cov=app

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .pytest_cache .coverage htmlcov/

docker-build:
	docker build -t coderabbit-backend .

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f api

format:
	black app/ tests/

lint:
	pylint app/

migrate:
	alembic upgrade head

migrate-create:
	alembic revision --autogenerate -m "$(name)"
