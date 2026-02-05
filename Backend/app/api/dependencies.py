from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from jose import jwt, JWTError, ExpiredSignatureError
from app.core.security import verify_token
from app.core.config import get_settings
from app.services.auth_service import AuthService
from app.core.logging import get_logger
from app.services.encryption_service import decrypt_token, get_encryption_service

security = HTTPBearer()
logger = get_logger(__name__)
settings = get_settings()


def _analyze_token_error(token: str) -> str:
    """
    Analyze a token to determine the specific failure reason.
    Returns a user-friendly error message.
    """
    try:
        # Try to decode without verification to see the payload
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False}  # Skip expiration check to see other issues
        )
        
        # If we get here, token is structurally valid but might be expired
        # Re-check with expiration
        try:
            jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            # Token is valid - shouldn't happen if we're in this function
            return "Token validation failed"
        except ExpiredSignatureError:
            logger.info("Token expired - user needs to refresh or re-login")
            return "Token expired. Please refresh your session."
        except JWTError as e:
            logger.warning(f"Token decode error after structure check: {e}")
            return "Token validation failed"
            
    except ExpiredSignatureError:
        logger.info("Token expired")
        return "Token expired. Please refresh your session."
    except JWTError as e:
        error_str = str(e).lower()
        if "signature" in error_str:
            logger.warning("Token signature verification failed - possible tampering or key mismatch")
            return "Invalid token signature. Please log in again."
        elif "malformed" in error_str or "invalid" in error_str:
            logger.warning(f"Malformed token: {e}")
            return "Invalid token format. Please log in again."
        else:
            logger.warning(f"Token decode failed: {e}")
            return "Token validation failed. Please log in again."
    except Exception as e:
        logger.error(f"Unexpected token analysis error: {type(e).__name__}: {e}")
        return "Authentication error. Please log in again."


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
    
    # SECURITY: Decrypt the token before use
    # Tokens are stored encrypted in the database
    try:
        encryption_service = get_encryption_service()
        
        # Check if token is encrypted (it should be after the security update)
        if encryption_service.is_encrypted(github_token):
            decrypted_token = decrypt_token(github_token)
            logger.debug("✓ GitHub token decrypted successfully")
            return decrypted_token
        else:
            # Token is not encrypted (legacy or already decrypted)
            # This handles backward compatibility during migration
            logger.warning("⚠️ GitHub token appears to be unencrypted - consider re-authenticating")
            return github_token
    except ValueError as e:
        logger.error(f"Failed to decrypt GitHub token: {str(e)}")
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
