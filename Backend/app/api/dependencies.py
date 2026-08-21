import secrets as _secrets
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from jose import jwt, JWTError, ExpiredSignatureError
from app.core.security import verify_token
from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.core.logging import get_logger
from app.services.encryption_service import decrypt_token, get_encryption_service
from app.services.session_revocation import is_token_revoked

security = HTTPBearer()
logger = get_logger(__name__)
settings = get_settings()

# One message for every non-expiry auth failure, so the response cannot be used
# to classify why a token was rejected.
GENERIC_AUTH_ERROR = "Invalid or expired credentials. Please log in again."


async def require_admin(x_admin_key: Optional[str] = Header(None)) -> bool:
    """
    Gate for operational endpoints (metrics, cache stats, cache invalidation).

    SECURITY: these endpoints were previously unauthenticated. Cache invalidation
    in particular accepts a glob pattern, so an anonymous caller could flush every
    tenant's cache and stall Redis.

    If ADMIN_API_KEY is unset the endpoints are disabled entirely (404) rather than
    left open - failing closed is the only safe default for an ops surface.
    """
    configured = settings.ADMIN_API_KEY

    if not configured:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found"
        )

    if not x_admin_key or not _secrets.compare_digest(x_admin_key, configured):
        logger.warning("Rejected admin request with missing or invalid X-Admin-Key")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found"
        )

    return True


def _analyze_token_error(token: str) -> str:
    """
    Determine why a token failed, log the detail, and return a message for the client.

    SECURITY: the returned message distinguishes only "expired" from "everything
    else". It used to report "Invalid token signature" separately from "Invalid
    token format", which is a forgery oracle - an attacker brute-forcing the
    signing key can tell a structurally-valid-but-wrongly-signed token from a
    malformed one and use that to steer their search.

    "Expired" stays distinguishable on purpose: the SPA needs it to decide whether
    to attempt a refresh, and it reveals nothing an attacker cannot read from the
    token's own `exp` claim.
    """
    try:
        jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        logger.warning("Token failed verification but decodes cleanly")
        return GENERIC_AUTH_ERROR
    except ExpiredSignatureError:
        logger.info("Token expired - user needs to refresh or re-login")
        return "Token expired. Please refresh your session."
    except JWTError as e:
        # Full detail to the logs, single generic message to the client.
        logger.warning(f"Token rejected: {type(e).__name__}: {e}")
        return GENERIC_AUTH_ERROR
    except Exception as e:
        logger.error(f"Unexpected token analysis error: {type(e).__name__}: {e}")
        return GENERIC_AUTH_ERROR


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    token = credentials.credentials
    
    # First, verify the token
    payload = verify_token(token, "access")
    if not payload:
        # Token verification failed - analyze why for better error message
        error_detail = _analyze_token_error(token)
        logger.info(f"Token verification failed: {error_detail}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail,
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    user_id = payload.get("sub")
    if not user_id:
        logger.warning("Token missing 'sub' claim")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user identifier",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # SECURITY: signature validity is not enough. Logout records a revocation
    # watermark; without this check a token stayed usable for its full lifetime
    # after the user logged out.
    if is_token_revoked(user_id, payload.get("iat")):
        logger.info(f"Rejected revoked token for user {user_id[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    auth_service = AuthService()
    user = await auth_service.get_user(user_id)
    
    if not user:
        logger.warning(f"User not found for token sub: {user_id[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return user


async def get_optional_user(
    authorization: Optional[str] = Header(None)
) -> Optional[dict]:
    if not authorization:
        return None
    
    try:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
            payload = verify_token(token, "access")
            
            if payload:
                user_id = payload.get("sub")
                if is_token_revoked(user_id, payload.get("iat")):
                    return None
                auth_service = AuthService()
                return await auth_service.get_user(user_id)
    except Exception as e:
        logger.warning(f"Optional auth failed: {str(e)}")
    
    return None


def get_github_token(current_user: dict = Depends(get_current_user)) -> str:
    """
    Get and decrypt the GitHub access token for the current user.
    
    The token is stored encrypted in the database for security.
    This function decrypts it before returning for API use.
    """
    github_token = current_user.get("github_access_token")
    
    if not github_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub account not connected. Please connect your GitHub account first."
        )
    
    # SECURITY: Decrypt the token before use.
    # Shared with the worker path via app.services.github_token so the two cannot
    # drift apart in how they handle legacy plaintext rows.
    from app.services.github_token import decrypt_stored_token, GitHubTokenUnavailable

    try:
        return decrypt_stored_token(github_token)
    except (ValueError, GitHubTokenUnavailable) as e:
        logger.error(f"Failed to decrypt GitHub token: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="GitHub authentication expired or corrupted. Please reconnect your GitHub account."
        )
    except Exception as e:
        logger.error(f"Unexpected error decrypting GitHub token: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process GitHub authentication. Please try again."
        )
