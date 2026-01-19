from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from app.schemas import UserResponse, UserUpdate, PasswordChange
from app.services.auth_service import AuthService
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_user)
):
    auth_service = AuthService()
    
    try:
        data = {}
        if update_data.full_name is not None:
            data["full_name"] = update_data.full_name
        if update_data.bio is not None:
            data["bio"] = update_data.bio
        if update_data.avatar_url is not None:
            data["avatar_url"] = update_data.avatar_url
        
        updated_user = await auth_service.update_user(current_user["id"], data)
        return updated_user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed"
        )
    
    if file.size > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size must be less than 5MB"
        )
    
    auth_service = AuthService()
    
    try:
        file_data = await file.read()
        avatar_url = await auth_service.upload_avatar(
            current_user["id"],
            file_data,
            file.filename
        )
        
        return {"avatar_url": avatar_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/me/password")
async def change_password(
    password_data: PasswordChange,
    current_user: dict = Depends(get_current_user)
):
    auth_service = AuthService()
    
    success = await auth_service.change_password(
        current_user["id"],
        password_data.current_password,
        password_data.new_password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to change password"
        )
    
    return {"message": "Password changed successfully"}


@router.delete("/me")
async def delete_account(current_user: dict = Depends(get_current_user)):
    auth_service = AuthService()
    
    success = await auth_service.delete_user(current_user["id"])
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account"
        )
    
    return {"message": "Account deleted successfully"}
