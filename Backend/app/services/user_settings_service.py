"""
Per-user notification preferences (the user_settings table, migration 010).

These are PREFERENCES, read by the alert checks to decide whether, and above
what score, to notify a user. Storing one sends nothing by itself: there is no
email delivery and no Slack integration in this backend, and this module does
not pretend otherwise. Alert code should call get_user_settings(user_id) and
honour what it returns.

A user who has never saved has no row; they get DEFAULT_USER_SETTINGS, which
must match the column defaults in the migration (tests/test_user_settings.py
checks that), so a read never has to write.
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.concurrency import run_blocking
from app.db.postgres import get_service_db

DEFAULT_USER_SETTINGS: Dict[str, Any] = {
    "email_notifications": True,
    "security_alerts": True,
    "weekly_digest": False,
    # Alert when a repository's overall score falls below this (0-100).
    "alert_score_threshold": 60,
    "auto_analyze_new_repos": False,
}

SETTINGS_FIELDS = tuple(DEFAULT_USER_SETTINGS)


def _shape(user_id: str, row: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    row = row or {}
    settings = {field: row.get(field, default) for field, default in DEFAULT_USER_SETTINGS.items()}
    return {"user_id": user_id, **settings, "updated_at": row.get("updated_at")}


async def get_user_settings(user_id: str) -> Dict[str, Any]:
    """
    The user's preferences, with defaults for a user who never saved any.

    Returns {"user_id", <each SETTINGS_FIELDS>, "updated_at"}; updated_at is
    None when the user has no stored row (i.e. everything is a default).
    """
    db = get_service_db()
    result = await run_blocking(
        db.table("user_settings").select("*").eq("user_id", user_id).single().execute
    )
    return _shape(user_id, result.data)


async def update_user_settings(user_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply a partial update and return the full resulting settings.

    Only the keys in `changes` are written. On first save the row is created
    and every other column takes its database default; afterwards the upsert's
    ON CONFLICT updates only the supplied columns, so a field left out of a
    request is never reset. Callers validate values (the route uses a pydantic
    model); the table's NOT NULL and CHECK constraints are the backstop.
    """
    unknown = set(changes) - set(SETTINGS_FIELDS)
    if unknown:
        raise ValueError(f"Unknown settings: {', '.join(sorted(unknown))}")
    if not changes:
        return await get_user_settings(user_id)

    db = get_service_db()
    payload = {
        "user_id": user_id,
        **changes,
        "updated_at": datetime.now(timezone.utc),
    }
    result = await run_blocking(
        db.table("user_settings").upsert(payload, on_conflict="user_id").execute
    )
    return _shape(user_id, result.data[0])
