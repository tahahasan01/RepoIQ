"""
Sample tests for the API
"""
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_root(app):
    """Test root endpoint"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data


@pytest.mark.asyncio
async def test_health_check(app):
    """Test health check endpoint with mocked dependencies"""
    # Mock Redis connection
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True
    
    # Mock Supabase/Database connection
    # /health now runs a real query through the psycopg pool rather than a
    # PostgREST call, so the mock shape follows the pool's context manager.
    mock_db = MagicMock()
    mock_conn = mock_db.connection.return_value.__enter__.return_value
    mock_conn.cursor.return_value.__enter__.return_value.fetchone.return_value = (1,)
    
    with patch('redis.Redis.from_url', return_value=mock_redis), \
         patch('app.db.postgres.check_connection', return_value=True):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "dependencies" in data
            assert data["dependencies"]["redis"]["status"] == "healthy"
            assert data["dependencies"]["database"]["status"] == "healthy"


@pytest.mark.asyncio
async def test_password_auth_is_off_by_default(app):
    """GitHub is the only sign-in: no email delivery means no password reset."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for path in ("/api/v1/auth/signup", "/api/v1/auth/login"):
            response = await client.post(path, json={"email": "a@example.com", "password": "long-enough-1"})
            assert response.status_code == 404
            assert "GitHub" in response.json()["detail"]


@pytest.mark.asyncio
async def test_signup_validation(app, monkeypatch):
    """Test signup with invalid data (password auth switched on)"""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "PASSWORD_AUTH_ENABLED", True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "invalid-email",
                "password": "short"
            }
        )
        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_protected_route_without_auth(app):
    """Test accessing protected route without authentication"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/users/me")
        assert response.status_code == 403  # Forbidden


# Add more tests for your specific use cases
# - User authentication flow
# - Repository management
# - Analysis workflow
# - Chat interactions
