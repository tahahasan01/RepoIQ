"""
Error message sanitisation for HTTP responses.

Route handlers used to raise `HTTPException(500, detail=str(e))` in 56 places.
Supabase and PostgREST exceptions embed table names, column names, SQL fragments,
project hostnames and occasionally connection strings, all of which were being
returned verbatim to unauthenticated-adjacent clients. That also bypassed the
sanitisation the auth routes already did, so the same deployment leaked internals
from one endpoint while carefully hiding them on another.

The rule here: the client gets a stable, actionable sentence; the log gets the
exception, with its type and traceback.
"""
from typing import Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

DEFAULT_MESSAGE = "Something went wrong processing this request. Please try again."


def safe_detail(
    exc: Exception,
    message: Optional[str] = None,
    *,
    context: Optional[str] = None,
) -> str:
    """
    Log `exc` and return a message that is safe to send to a client.

    Args:
        exc: the caught exception. Logged in full, never returned.
        message: what to tell the user. Should say what failed, not why.
        context: optional label for the log line (e.g. the operation name).

    Returns:
        The client-facing string.
    """
    label = f"[{context}] " if context else ""
    logger.error(f"{label}{type(exc).__name__}: {exc}", exc_info=True)
    return message or DEFAULT_MESSAGE
