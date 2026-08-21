"""
Request correlation and slow-request visibility.

At a few users you debug by reading the logs top to bottom. At a few thousand,
log lines from hundreds of concurrent requests interleave and that stops working:
there is no way to reconstruct what happened during one user's failed analysis.

This assigns every request an id, echoes it in the response so a user can quote
it in a bug report, and makes it available to the whole call stack via a
contextvar so any log line can carry it.

It also replaces the previous blanket "log every request at INFO" behaviour with
something proportionate: successful fast requests log at DEBUG, slow ones and
errors log at WARNING/ERROR with the duration. At thousands of users, one INFO
line per request is noise that hides the signal and costs real money in log
ingest.
"""
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

from app.core.logging import get_logger

logger = get_logger(__name__)

# Readable by any code in the request's call stack without threading it through.
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

REQUEST_ID_HEADER = "X-Request-ID"

# Above this, a request is worth a log line on its own.
SLOW_REQUEST_SECONDS = 1.0

# Paths that would otherwise dominate the logs with no information value.
QUIET_PATHS = {"/health", "/ready", "/live"}


def current_request_id() -> Optional[str]:
    """The id of the request being handled, if any."""
    return request_id_var.get()


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign, propagate and echo a request id; log proportionately."""

    async def dispatch(self, request: Request, call_next):
        # Honour an upstream id so a trace spans the proxy and the app, but
        # constrain it: this value ends up in logs, and an unbounded
        # client-supplied string is a log-injection vector.
        incoming = request.headers.get(REQUEST_ID_HEADER, "")
        request_id = (
            incoming[:64]
            if incoming and incoming.replace("-", "").replace("_", "").isalnum()
            else uuid.uuid4().hex
        )

        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration = time.perf_counter() - started
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} "
                f"raised after {duration:.3f}s"
            )
            raise
        finally:
            request_id_var.reset(token)

        duration = time.perf_counter() - started
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers["Server-Timing"] = f"app;dur={duration * 1000:.1f}"

        if request.url.path in QUIET_PATHS:
            return response

        message = (
            f"[{request_id}] {request.method} {request.url.path} "
            f"-> {response.status_code} in {duration:.3f}s"
        )

        if response.status_code >= 500:
            logger.error(message)
        elif response.status_code >= 400 or duration >= SLOW_REQUEST_SECONDS:
            logger.warning(message)
        else:
            # Successful and fast: not worth a line per request at scale.
            logger.debug(message)

        return response
