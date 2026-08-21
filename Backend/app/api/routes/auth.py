from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import UserCreate, UserResponse, TokenResponse, PublicUser
from app.services.auth_service import AuthService
from app.api.dependencies import get_current_user
from app.core.logging import get_logger
from pydantic import BaseModel
from typing import Optional

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _sanitize_error_message(error: Exception, default_message: str = "An error occurred") -> str:
    """
    SECURITY: Sanitize error messages to avoid leaking internal details.
    Only expose safe, user-friendly error messages.
    """
    error_str = str(error).lower()
    
    # Map known errors to user-friendly messages
    if "duplicate" in error_str or "already exists" in error_str:
        return "An account with this email already exists"
    if "invalid" in error_str or "credentials" in error_str:
        return "Invalid credentials"
    if "not found" in error_str:
        return "Resource not found"
    if "expired" in error_str or "already used" in error_str or "verification code" in error_str:
        return "GitHub authorization expired. Please click 'Login with GitHub' again to get a fresh authorization."
    if "rate limit" in error_str:
        return "Too many requests. Please try again later"
    if "redirect_uri_mismatch" in error_str or "redirect uri" in error_str:
        return "GitHub OAuth configuration error. Please contact support."
    if "client_credentials" in error_str or "client secret" in error_str:
        return "GitHub OAuth configuration error. Please check server configuration."
    if "github" in error_str and "access" in error_str:
        return "Failed to connect to GitHub. Please try again"
    
    # Log the actual error for debugging
    logger.error(f"Auth error (sanitized for response): {error}")
    
    return default_message


class LoginRequest(BaseModel):
    email: str
    password: str


class GitHubCallbackRequest(BaseModel):
    code: str
    # Optional for one release so sessions started before this change can still
    # complete. Make it required once clients are updated - see AUDIT.md H-11.
    state: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate):
    auth_service = AuthService()
    
    try:
        result = await auth_service.signup(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name
        )
        
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"]
        )
    except Exception as e:
        # SECURITY: Don't expose internal error details
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_sanitize_error_message(e, "Failed to create account")
        )


@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest):
    auth_service = AuthService()
    
    try:
        result = await auth_service.login(
            email=login_data.email,
            password=login_data.password
        )
        
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"]
        )
    except Exception as e:
        # Log the real cause; return an indistinguishable message either way so
        # the response cannot separate "no such account" from "wrong password".
        logger.info(f"Login failed: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )


class TokenWithUserResponse(BaseModel):
    access_token: str
    refresh_token: str
    # SECURITY: PublicUser, not dict. A bare `dict` is passed through unfiltered by
    # FastAPI, and github_oauth() returns the raw users row - which carries
    # github_access_token. That token was being handed to the SPA and stored in
    # localStorage under "user".
    user: PublicUser


@router.post("/github/callback", response_model=TokenWithUserResponse)
async def github_callback(callback_data: GitHubCallbackRequest):
    from app.services.oauth_state import consume_state

    # SECURITY: verify the CSRF nonce before spending the authorization code.
    # `state` is optional on the request model for one release so in-flight logins
    # started against the previous build still complete; when it is supplied it
    # must be valid.
    if callback_data.state is not None and not consume_state(callback_data.state):
        logger.warning("GitHub OAuth callback rejected: invalid or replayed state")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This login link is no longer valid. Please start a new GitHub login."
        )

    auth_service = AuthService()

    try:
        result = await auth_service.github_oauth(callback_data.code)

        # github_oauth already returns user data, so we include it in the response
        return TokenWithUserResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=PublicUser.from_record(result.get("user"))
        )
    except Exception as e:
        # SECURITY: Don't expose internal error details
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_sanitize_error_message(e, "GitHub authentication failed")
        )


@router.get("/github/authorize")
async def github_authorize():
    """
    Build the GitHub authorization URL.

    SECURITY: issues a single-use `state` nonce, held server-side for 10 minutes
    and verified in the callback. Without it the callback accepts any `code`,
    which is login-CSRF: an attacker can make a victim's browser complete an OAuth
    flow against the attacker's GitHub account (or bind the attacker's account to
    the victim's session).

    Scope comes from settings.GITHUB_OAUTH_SCOPES and includes `repo`. An earlier
    pass narrowed this to `read:user user:email` on the reasoning that an analysis
    tool should not hold write access. That was wrong and would have broken the
    product: OAuth Apps have no read-only private-repository scope, so `repo` is
    the minimum that can read a private repo at all, and auto-fix additionally
    needs write access to open pull requests. See the note on
    Settings.GITHUB_OAUTH_SCOPES, and the GitHub App migration that would actually
    deliver least privilege.
    """
    from urllib.parse import urlencode
    from app.core.config import get_settings
    from app.services.oauth_state import issue_state

    settings = get_settings()
    state = issue_state()

    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": settings.GITHUB_OAUTH_SCOPES,
        "state": state,
    }

    auth_url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"

    return {"auth_url": auth_url, "state": state}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token_data: RefreshTokenRequest):
    """
    Exchange a refresh token for a new token pair.

    SECURITY: the presented token is checked against the revocation watermark and
    against the currently-registered jti. Presenting a superseded refresh token is
    treated as replay of a stolen credential and revokes every session for that
    user. Previously this endpoint validated only the signature, so a captured
    refresh token was good for seven days with no way to invalidate it.
    """
    from app.core.security import verify_token, create_access_token, create_refresh_token
    from app.services.session_revocation import (
        is_token_revoked,
        consume_refresh_token,
        register_refresh_token,
    )

    payload = verify_token(token_data.refresh_token, "refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    if is_token_revoked(user_id, payload.get("iat")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please log in again."
        )

    if not consume_refresh_token(user_id, payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please log in again."
        )

    auth_service = AuthService()
    user = await auth_service.get_user(user_id)

    if not user:
        # 404 here distinguishes "valid token, unknown user" from "bad token",
        # which is a small enumeration signal. 401 keeps the two indistinguishable.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has ended. Please log in again."
        )

    new_access_token = create_access_token({"sub": user_id, "email": user["email"]})
    new_refresh_token = create_refresh_token({"sub": user_id})

    # Register the replacement before returning it, so the token we just handed
    # out is the only one that will be accepted next time.
    new_payload = verify_token(new_refresh_token, "refresh") or {}
    register_refresh_token(user_id, new_payload.get("jti"))

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Log out and revoke every token currently issued to this user.

    SECURITY: this endpoint used to call `redis_service.redis_client`, an attribute
    that does not exist, inside a broad try/except - so it always reported success
    while doing nothing. It now writes a revocation watermark that
    get_current_user() checks on every request, and reports honestly when that
    write fails.
    """
    from app.services.session_revocation import revoke_user_sessions

    user_id = current_user.get("id")
    revoked = revoke_user_sessions(user_id) if user_id else False

    if not revoked:
        # Telling the user they are logged out when their tokens are still live
        # is the kind of lie that ends up in an incident report.
        logger.error(f"Logout could not revoke sessions for user {str(user_id)[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Could not fully end your session because a backend service is "
                "unavailable. Your tokens may remain valid until they expire. "
                "Please try again."
            )
        )

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user
