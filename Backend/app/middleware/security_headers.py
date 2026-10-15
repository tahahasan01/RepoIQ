"""
Browser security headers on every response.

The API answers JSON (plus uploaded avatars), so nothing it serves should ever
be rendered as a document, framed, or allowed to run script. These headers make
the browser enforce that even if a response is mis-typed or reflects input:

  X-Content-Type-Options: nosniff
      A JSON body containing markup is not sniffed into HTML.
  X-Frame-Options: DENY / CSP frame-ancestors 'none'
      No clickjacking through a framed endpoint (the CSP form is the modern one;
      XFO covers older browsers).
  Referrer-Policy: no-referrer
      Chosen over strict-origin-when-cross-origin because nothing here is a page
      a user navigates from, so a Referer from an API response has no legitimate
      consumer - and request URLs carry repository names and ids.
  Permissions-Policy
      Camera, microphone and geolocation are never needed.
  Cross-Origin-Opener-Policy: same-origin
      A response opened in a window cannot be scripted by its opener.
  Content-Security-Policy: default-src 'none'
      Nothing loads or runs. The interactive docs pages (when enabled) get a
      policy that admits exactly the CDN assets FastAPI's Swagger UI and ReDoc
      load, and nothing else.
  Strict-Transport-Security
      Production only: sent over plain-http development it would pin localhost
      to https in the developer's browser for two years.

A pure ASGI middleware, not BaseHTTPMiddleware: it only edits the response
start message and never buffers a body (see the GZip note in main.py).
Headers a route sets itself are left alone.
"""
from typing import Dict, Iterable, List, Tuple

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

# FastAPI's get_swagger_ui_html / get_redoc_html: bundles and CSS from
# jsdelivr, an inline bootstrap script, Google Fonts (ReDoc), a favicon from
# fastapi.tiangolo.com, and a blob: worker (ReDoc's search).
DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data: https://fastapi.tiangolo.com https://cdn.redoc.ly; "
    "connect-src 'self'; "
    "worker-src blob:; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)

HSTS_VALUE = "max-age=63072000; includeSubDomains"

_COMMON: Tuple[Tuple[str, str], ...] = (
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
)


def security_headers(path: str, *, hsts: bool, docs_paths: Iterable[str] = ()) -> Dict[str, str]:
    """The headers for a response to `path`. Also used by the 500 handler,
    whose response is sent from outside the middleware stack."""
    headers = dict(_COMMON)
    headers["Content-Security-Policy"] = DOCS_CSP if path in set(docs_paths) else API_CSP
    if hsts:
        headers["Strict-Transport-Security"] = HSTS_VALUE
    return headers


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool = False, docs_paths: Iterable[str] = ()):
        self.app = app
        self.hsts = hsts
        self.docs_paths: List[str] = [p for p in docs_paths if p]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        extra = security_headers(scope.get("path", ""), hsts=self.hsts, docs_paths=self.docs_paths)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in extra.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)
