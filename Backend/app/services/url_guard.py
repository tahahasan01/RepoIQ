"""
Outbound URL validation for user-supplied destinations (webhooks).

Users register arbitrary URLs and can trigger delivery on demand via
POST /webhooks/{id}/test. Without validation that is a general-purpose SSRF
primitive pointed at whatever the API server can reach: cloud metadata
(169.254.169.254), the app's own unauthenticated admin routes on localhost, and
anything else inside the VPC.
"""
import ipaddress
import socket
from typing import List, Tuple
from urllib.parse import urlparse

from app.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_SCHEMES = {"https"}

# Hosts that resolve to something routable but must never be a webhook target.
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata",
}


class UnsafeUrlError(ValueError):
    """Raised when a user-supplied URL must not be requested."""


def _is_blocked_address(ip: ipaddress._BaseAddress) -> bool:
    """
    True for any address that is not a normal, routable public destination.

    ip_address covers most of this for us; link_local catches the cloud metadata
    endpoints (169.254.169.254 on AWS/Azure/GCP, fd00:ec2:: on AWS IPv6).
    """
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def resolve_and_validate(url: str, allow_http: bool = False) -> Tuple[str, List[str]]:
    """
    Validate a webhook destination and return (hostname, resolved_ips).

    Raises UnsafeUrlError with a message safe to show the user.

    Callers should pin the connection to one of the returned IPs. Re-resolving at
    request time reopens a DNS-rebinding window: a hostname that answers with a
    public address here can answer with 127.0.0.1 milliseconds later.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        raise UnsafeUrlError("Malformed URL.")

    scheme = (parsed.scheme or "").lower()
    allowed = ALLOWED_SCHEMES | ({"http"} if allow_http else set())
    if scheme not in allowed:
        raise UnsafeUrlError(
            f"Webhook URLs must use {' or '.join(sorted(allowed))}."
        )

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname:
        raise UnsafeUrlError("URL must include a hostname.")

    if hostname in BLOCKED_HOSTNAMES:
        raise UnsafeUrlError("Webhook URLs must point to a public host.")

    # A literal IP skips DNS but still has to pass the range checks.
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        literal = None

    if literal is not None:
        if _is_blocked_address(literal):
            raise UnsafeUrlError("Webhook URLs must point to a public address.")
        return hostname, [str(literal)]

    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if scheme == "https" else 80))
    except socket.gaierror:
        raise UnsafeUrlError("Could not resolve the webhook hostname.")

    resolved: List[str] = []
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue

        # Reject if ANY resolved address is internal. A hostname with one public
        # and one private A record is a rebinding attack, not a misconfiguration.
        if _is_blocked_address(ip):
            logger.warning(
                f"Refused webhook target {hostname}: resolves to non-public {address}"
            )
            raise UnsafeUrlError("Webhook URLs must point to a public address.")

        resolved.append(str(ip))

    if not resolved:
        raise UnsafeUrlError("Could not resolve the webhook hostname.")

    return hostname, resolved
