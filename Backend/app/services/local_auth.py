"""
Local password authentication, replacing Supabase Auth.

Supabase Auth held credentials and issued its own sessions. On plain Postgres
the application owns identity: password hashes live in users.password_hash and
sessions are the JWTs app/core/security.py already issued.

This also removes the defect behind AUDIT.md C-1 by construction. That bug
existed because the supabase client carried the session of whoever last signed
in on the process, so `auth.update_user()` could change the wrong user's
password. There is no session state here at all - every function takes the user
it operates on as an explicit argument.
"""
import base64
import hashlib
from typing import Any, Dict, Optional

import bcrypt

from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)

# Cost factor. Deliberately not tuned down: hashing is meant to be slow, and it
# runs in the threadpool so it does not block the event loop.
_BCRYPT_ROUNDS = 12


def _prepare(password: str) -> bytes:
    """
    Turn a password of any length into exactly 44 bytes for bcrypt.

    bcrypt only considers the first 72 bytes of its input. Older libraries
    silently truncated - so "correct horse battery staple ..." and the same
    string with a different 73rd character onwards were the SAME password.
    Modern bcrypt raises instead, which turns that latent weakness into a
    signup crash for anyone with a long passphrase.

    SHA-256 first, then base64, is the standard fix: the digest is fixed-length
    and well under the limit, so the full password always contributes. base64
    rather than raw digest because a raw digest can contain a NUL byte, which
    bcrypt treats as a terminator - the same truncation bug in another guise.
    """
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


class AuthError(Exception):
    """Authentication failed. Deliberately carries no detail about why."""


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt(_BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    """
    Check a password against a stored hash.

    A missing hash still performs a full verification against a dummy value, so
    an account that exists but has no password (GitHub-only signup) costs the
    same time as one that does. Returning early would leak account existence
    through response timing.
    """
    candidate = _prepare(password)

    if not password_hash:
        bcrypt.checkpw(candidate, _DUMMY_HASH)
        return False

    try:
        return bcrypt.checkpw(candidate, password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # A malformed stored hash is a failed login, not a 500.
        return False


# Pre-computed once so the dummy verification costs the same as a real one.
_DUMMY_HASH = bcrypt.hashpw(
    _prepare("dummy-password-for-constant-time-comparison"),
    bcrypt.gensalt(_BCRYPT_ROUNDS),
)


async def authenticate(db, email: str, password: str) -> Dict[str, Any]:
    """
    Verify credentials and return the user record.

    Raises AuthError for unknown email AND wrong password with the same message,
    so the response cannot be used to enumerate registered addresses.
    """
    result = await run_blocking(
        lambda: db.table("users").select("*").eq("email", email).single().execute()
    )
    user = result.data

    # Always hash, even when the user does not exist - see verify_password.
    stored = user.get("password_hash") if user else None
    ok = await run_blocking(verify_password, password, stored)

    if not user or not ok:
        logger.info("Login rejected")
        raise AuthError("Invalid credentials")

    return user


async def register(
    db, email: str, password: str, full_name: Optional[str] = None
) -> Dict[str, Any]:
    """Create an account. Raises AuthError if the address is already taken."""
    existing = await run_blocking(
        lambda: db.table("users").select("id").eq("email", email).single().execute()
    )
    if existing.data:
        raise AuthError("An account with this email already exists")

    password_hash = await run_blocking(hash_password, password)

    result = await run_blocking(
        lambda: db.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "full_name": full_name,
        }).execute()
    )
    if not result.data:
        raise AuthError("Could not create the account")

    return result.data[0]


async def change_password(
    db, user_id: str, current_password: str, new_password: str
) -> bool:
    """
    Change a password after verifying the current one.

    Addressed to user_id explicitly. The Supabase version took the same
    arguments but ignored current_password and applied the change to whatever
    session the shared client happened to hold (AUDIT.md C-1).
    """
    result = await run_blocking(
        lambda: db.table("users").select("id, password_hash").eq("id", user_id).single().execute()
    )
    user = result.data
    if not user:
        return False

    if not await run_blocking(verify_password, current_password, user.get("password_hash")):
        logger.warning(f"Password change rejected for {user_id[:8]}...: wrong current password")
        return False

    new_hash = await run_blocking(hash_password, new_password)
    await run_blocking(
        lambda: db.table("users").update({"password_hash": new_hash}).eq("id", user_id).execute()
    )

    logger.info(f"Password changed for {user_id[:8]}...")
    return True
