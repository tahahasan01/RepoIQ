"""
Pytest configuration file for setting up test environment.
"""
import sys
import os
from pathlib import Path
import pytest

# Add Backend directory to Python path so imports work
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

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
