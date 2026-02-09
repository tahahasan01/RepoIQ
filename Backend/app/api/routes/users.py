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


@router.get("/search")
async def search_users(
    query: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Search for users by name, username, or email. Returns limited public info."""
    from app.db.supabase import get_service_db
    from app.core.logging import get_logger
    
    logger = get_logger(__name__)
    
    if not query or len(query.strip()) < 2:
        return []
    
    try:
        db = get_service_db()
        search_term = f"%{query.strip()}%"
        
        # Search by email, full_name, or github_username
        # Try each field separately and combine results
        results = []
        seen_ids = set()
        
        # Search by email
        email_result = db.table("users").select("id, email, full_name, github_username, avatar_url").ilike("email", search_term).limit(limit).execute()
        for user in (email_result.data or []):
            if user["id"] not in seen_ids:
                results.append(user)
                seen_ids.add(user["id"])
        
        # Search by full_name (if we haven't reached limit)
        if len(results) < limit:
            name_result = db.table("users").select("id, email, full_name, github_username, avatar_url").not_.is_("full_name", "null").ilike("full_name", search_term).limit(limit - len(results)).execute()
            for user in (name_result.data or []):
                if user["id"] not in seen_ids:
                    results.append(user)
                    seen_ids.add(user["id"])
        
        # Search by github_username (if we haven't reached limit)
        if len(results) < limit:
            username_result = db.table("users").select("id, email, full_name, github_username, avatar_url").not_.is_("github_username", "null").ilike("github_username", search_term).limit(limit - len(results)).execute()
            for user in (username_result.data or []):
                if user["id"] not in seen_ids:
                    results.append(user)
                    seen_ids.add(user["id"])
        
        result = type('obj', (object,), {'data': results})()
        
        # Filter out sensitive data and return safe user info
        users = []
        for user in (result.data or []):
            users.append({
                "id": user.get("id"),
                "email": user.get("email"),
                "full_name": user.get("full_name"),
                "github_username": user.get("github_username"),
                "avatar_url": user.get("avatar_url"),
            })
        
        return users
    except Exception as e:
        logger.error(f"Error searching users: {e}")
        return []
