"""
Sample tests for the API
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root(app):
    """Test root endpoint"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data


@pytest.mark.asyncio
async def test_health_check(app):
    """Test health check endpoint"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_signup_validation(app):
    """Test signup with invalid data"""
    async with AsyncClient(app=app, base_url="http://test") as client:
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
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/users/me")
        assert response.status_code == 403  # Forbidden


# Add more tests for your specific use cases
# - User authentication flow
# - Repository management
# - Analysis workflow
# - Chat interactions
