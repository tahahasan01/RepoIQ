from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import UserCreate, UserResponse, TokenResponse
from app.services.auth_service import AuthService
from app.api.dependencies import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
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


@router.post("/github/callback", response_model=TokenResponse)
async def github_callback(callback_data: GitHubCallbackRequest):
    auth_service = AuthService()
    
    try:
        result = await auth_service.github_oauth(callback_data.code)
        
        return TokenResponse(
            access_token=result["access_token"],
            refresh_token=result["refresh_token"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
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
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    return current_user
