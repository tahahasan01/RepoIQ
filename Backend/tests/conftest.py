"""
Pytest configuration file for setting up test environment.
"""
import sys
import os
from pathlib import Path
import pytest

# Add Backend directory to Python path so imports work
# This must happen BEFORE any imports of our modules
backend_dir = Path(__file__).parent.parent.resolve()
backend_dir_str = str(backend_dir)

# Remove if already exists and add to front
if backend_dir_str in sys.path:
    sys.path.remove(backend_dir_str)
sys.path.insert(0, backend_dir_str)

# Debug: Print sys.path for troubleshooting (will show in CI logs)
print(f"[TEST SETUP] Added to sys.path: {backend_dir_str}", file=sys.stderr)
print(f"[TEST SETUP] Full sys.path: {sys.path[:3]}...", file=sys.stderr)

# Isolate the suite from any local .env.
#
# pydantic-settings reads .env by default, so once a developer configures the
# app for real, tests start reading their configuration and results diverge from
# a clean checkout. Pointing at a path that cannot exist makes the suite depend
# only on what is set explicitly below.
os.environ["REPOIQ_ENV_FILE"] = str(backend_dir / "does-not-exist.env")

# Set environment variables for testing
os.environ.setdefault("SECRET_KEY", "test_secret_key_for_testing_12345678901234567890")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test_key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test_service_key")
os.environ.setdefault("GITHUB_CLIENT_ID", "test_client_id")
os.environ.setdefault("GITHUB_CLIENT_SECRET", "test_client_secret")
os.environ.setdefault("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/callback")
os.environ.setdefault("OPENAI_API_KEY", "test_openai_key")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080")


@pytest.fixture(scope="session")
def anyio_backend():
    """Configure anyio backend for async tests."""
    return "asyncio"


@pytest.fixture(scope="session")
def app():
    """
    Create FastAPI app instance for testing.
    Import is done here to ensure environment variables are set first.

    This deliberately does NOT catch import errors. It previously fell back to a
    stub FastAPI app whose handlers returned exactly what the tests asserted, so
    the suite went green even when the real application could not be imported at
    all - CI reported success on a completely broken build.
    """
    from main import app as _app
    print("[TEST SETUP] Successfully imported FastAPI app", file=sys.stderr)
    return _app


@pytest.fixture()
def client(app):
    """Synchronous TestClient. Server exceptions surface as 500s, not raises."""
    from fastapi.testclient import TestClient
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def admin_key(monkeypatch):
    """Configure an admin API key for the duration of one test."""
    key = "test-admin-key-abc123"
    import main
    import app.api.dependencies as deps
    monkeypatch.setattr(main.settings, "ADMIN_API_KEY", key, raising=False)
    monkeypatch.setattr(deps.settings, "ADMIN_API_KEY", key, raising=False)
    return key
