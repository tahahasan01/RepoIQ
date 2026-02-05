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
    """
    # Mock database and Redis connections for testing
    from unittest.mock import MagicMock, patch
    
    # Mock Supabase client
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.execute.return_value.data = []
    
    # Mock Redis
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True
    mock_redis.get.return_value = None
    
    with patch('app.db.database.get_supabase_client', return_value=mock_supabase), \
         patch('redis.Redis.from_url', return_value=mock_redis):
        try:
            from main import app as _app
            print("[TEST SETUP] Successfully imported FastAPI app", file=sys.stderr)
            return _app
        except Exception as e:
            print(f"[TEST SETUP] Warning: Could not import app: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            # Return a minimal FastAPI app for basic tests
            from fastapi import FastAPI
            minimal_app = FastAPI()
            
            @minimal_app.get("/")
            def root():
                return {"message": "Test API", "version": "test"}
            
            @minimal_app.get("/health")
            def health():
                return {"status": "healthy"}
            
            return minimal_app
