from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from app.core.security import verify_token
from app.services.auth_service import AuthService
from app.core.logging import get_logger
from app.services.encryption_service import decrypt_token, get_encryption_service

security = HTTPBearer()
logger = get_logger(__name__)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    token = credentials.credentials
    
    payload = verify_token(token, "access")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    auth_service = AuthService()
    user = await auth_service.get_user(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
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
