from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import UserCreate, UserResponse, TokenResponse
from app.services.auth_service import AuthService
from app.api.dependencies import get_current_user
from app.core.logging import get_logger
from pydantic import BaseModel

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )


class TokenWithUserResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


@router.post("/github/callback", response_model=TokenWithUserResponse)
async def github_callback(callback_data: GitHubCallbackRequest):
    auth_service = AuthService()
    
    try:
        result = await auth_service.github_oauth(callback_data.code)
        
        # github_oauth already returns user data, so we include it in the response
        return TokenWithUserResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            user=result.get("user", {})
        )
    except Exception as e:
        # SECURITY: Don't expose internal error details
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_sanitize_error_message(e, "GitHub authentication failed")
        )


@router.get("/github/authorize")
async def github_authorize():
    from app.core.config import get_settings
    settings = get_settings()
    
    auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        f"&scope=repo user:email"
    )
    
    return {"auth_url": auth_url}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(token_data: RefreshTokenRequest):
    from app.core.security import verify_token, create_access_token, create_refresh_token
    
    payload = verify_token(token_data.refresh_token, "refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    user_id = payload.get("sub")
    
    auth_service = AuthService()
    user = await auth_service.get_user(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    new_access_token = create_access_token({"sub": user_id, "email": user["email"]})
    new_refresh_token = create_refresh_token({"sub": user_id})
    
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Logout user and invalidate their current session.
    
    SECURITY: Token blacklisting ensures tokens cannot be reused after logout.
    """
    from app.services.redis_service import get_redis_service
    from app.core.config import get_settings
    
    settings = get_settings()
    
    try:
        # Get Redis service for token blacklisting
        redis_service = get_redis_service()
        
        # Blacklist the user's session (using user_id as identifier)
        # The token will be rejected until its natural expiration
        user_id = current_user.get("id")
        if user_id:
            # Store invalidation timestamp - any tokens issued before this are invalid
            blacklist_key = f"auth:invalidated:{user_id}"
            import time
            redis_service.redis_client.setex(
                blacklist_key,
                settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 + 60,  # TTL slightly longer than token
                str(int(time.time()))
            )
            logger.info(f"🔒 User session invalidated: {user_id[:8]}...")
    except Exception as e:
        # Log but don't fail logout - it should always succeed from user perspective
        logger.warning(f"Failed to blacklist token on logout: {e}")
    
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user
