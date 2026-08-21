import logging
import structlog
from typing import Any
import sys


def _utf8_stream(stream):
    """
    Force UTF-8 on the log stream.

    The codebase uses emoji in ~124 log statements. On a console with a legacy
    encoding (cp1252 on Windows, POSIX C locale in some containers) writing one
    raises UnicodeEncodeError from inside the logging call. Because several of
    those statements live in middleware, that exception propagates out of the
    request and turns an ordinary 200 into a 500.
    """
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    return stream


def setup_logging(level: str = None) -> None:
    """
    Configure structlog + stdlib logging.

    MUST be called by every entrypoint before the app is constructed. When it is
    not called, structlog falls back to an unconfigured PrintLogger: filter_by_level
    never runs, so every logger.debug() in the codebase prints on every request,
    synchronously, to stdout.
    """
    from app.core.config import get_settings

    settings = get_settings()

    if level is None:
        level = "DEBUG" if settings.DEBUG else "INFO"

    resolved = getattr(logging, level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=_utf8_stream(sys.stdout),
        level=resolved,
        force=True,
    )

    # loguru is used directly in main.py, the routes and the tasks. Point it at
    # the same UTF-8 stream and level so the two logging stacks agree.
    try:
        from loguru import logger as loguru_logger
        loguru_logger.remove()
        loguru_logger.add(
            _utf8_stream(sys.stdout),
            level=level.upper(),
            backtrace=False,
            diagnose=False,
        )
    except Exception:
        pass


def get_logger(name: str) -> Any:
    return structlog.get_logger(name)
