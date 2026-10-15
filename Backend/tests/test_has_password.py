"""
`has_password` on the /me responses.

GitHub sign-in accounts have no password (password_hash NULL), so
PUT /users/me/password can never succeed for them. The client hides the form
based on this flag; the hash itself must never reach the response.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


USER = {
    "id": "u1",
    "email": "dev@example.com",
    "full_name": "Dev",
    "github_username": "dev",
    "github_connected": True,
    "created_at": "2026-01-01T00:00:00+00:00",
}


def _service_with_row(row):
    from app.services.auth_service import AuthService

    service = AuthService.__new__(AuthService)
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.single.return_value = query
    query.execute.return_value = MagicMock(data=row)
    service.service_db = MagicMock()
    service.service_db.table.return_value = query
    return service, query


class TestHasPasswordLookup:

    def test_github_only_account_has_no_password(self):
        service, _ = _service_with_row({"password_hash": None})
        assert asyncio.run(service.has_password("u1")) is False

    def test_password_account(self):
        service, query = _service_with_row({"password_hash": "$2b$12$hash"})
        assert asyncio.run(service.has_password("u1")) is True
        query.select.assert_called_once_with("password_hash")

    def test_lookup_failure_is_unknown_not_false(self):
        service, query = _service_with_row(None)
        query.execute.side_effect = RuntimeError("db down")
        assert asyncio.run(service.has_password("u1")) is None


@pytest.mark.parametrize("path", ["/api/v1/users/me", "/api/v1/auth/me"])
@pytest.mark.parametrize("stored", [True, False])
@pytest.mark.parametrize("enabled", [True, False])
def test_me_endpoints_report_has_password_without_the_hash(app, client, path, stored, enabled, monkeypatch):
    from app.api.dependencies import get_current_user
    from app.core.config import get_settings
    from app.services.auth_service import AuthService

    # With password auth off a stored password is unusable, so it is reported absent.
    monkeypatch.setattr(get_settings(), "PASSWORD_AUTH_ENABLED", enabled)

    # A record that (wrongly) carried the hash must still not leak it.
    app.dependency_overrides[get_current_user] = lambda: {**USER, "password_hash": "$2b$12$hash"}
    try:
        with patch.object(AuthService, "has_password", AsyncMock(return_value=stored)), \
                patch.object(AuthService, "__init__", lambda self: None):
            response = client.get(path)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["has_password"] is (stored and enabled)
    assert "password_hash" not in body
