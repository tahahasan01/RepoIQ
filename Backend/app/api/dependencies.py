from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from app.core.security import verify_token
from app.services.auth_service import AuthService
from app.core.logging import get_logger

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
    github_token = current_user.get("github_access_token")
    
    if not github_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub account not connected. Please connect your GitHub account first."
        )
    
    return github_token
