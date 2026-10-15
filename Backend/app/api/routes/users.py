from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from app.schemas import (
    PasswordChange,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
    UserUpdate,
)
from app.services.auth_service import AuthService
from app.services.user_settings_service import get_user_settings, update_user_settings
from app.api.dependencies import get_current_user
from app.api.errors import safe_detail
from app.core.concurrency import run_blocking

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    has_password = await AuthService().has_password(current_user["id"])
    return {**current_user, "has_password": has_password}


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
            detail=safe_detail(e)
        )


@router.get("/me/settings", response_model=UserSettingsResponse)
async def get_my_settings(current_user: dict = Depends(get_current_user)):
    """
    The caller's notification preferences.

    Response 200: {"email_notifications": bool, "security_alerts": bool,
                   "weekly_digest": bool, "alert_score_threshold": int (0-100),
                   "auto_analyze_new_repos": bool, "updated_at": ISO 8601 | null}
    A user who never saved gets the defaults with updated_at null.

    These are preferences read by the alert checks; storing them does not by
    itself send anything (there is no email or Slack delivery in this backend).
    """
    try:
        return await get_user_settings(current_user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to load settings", context="get_my_settings"),
        )


@router.put("/me/settings", response_model=UserSettingsResponse)
async def update_my_settings(
    update: UserSettingsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Partially update the caller's notification preferences.

    Request: any subset of {"email_notifications": bool, "security_alerts": bool,
             "weekly_digest": bool, "alert_score_threshold": int 0-100,
             "auto_analyze_new_repos": bool}. Omitted fields are unchanged.
    Response 200: the full settings, as GET /users/me/settings.
    422 for a wrong type (strict: "true" or 1 is not a bool), a threshold
    outside 0-100, an explicit null, or an unknown field.
    """
    try:
        return await update_user_settings(current_user["id"], update.changes())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to save settings", context="update_my_settings"),
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
            detail=safe_detail(e)
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
        # Deliberately does not distinguish "wrong current password" from other
        # failures - the caller is already authenticated, but a precise message
        # would still confirm the account's password to a session hijacker.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not change password. Check your current password and try again."
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
    """
    Search for users the caller already shares an organisation with.

    SECURITY: this endpoint previously searched the entire users table and returned
    each match's email address, so any authenticated user could harvest the whole
    platform directory with `?query=@`. It is now restricted to co-members of the
    caller's organisations, email is no longer returned, and LIKE wildcards in the
    query are escaped so `%` cannot enumerate.
    """
    from app.db.postgres import get_service_db
    from app.core.logging import get_logger
    from app.services.organization_service import OrganizationService
    from app.services.team_service import escape_like

    logger = get_logger(__name__)

    cleaned = (query or "").strip()
    if len(cleaned) < 2:
        return []

    limit = max(1, min(limit, 25))

    try:
        db = get_service_db()
        search_term = f"%{escape_like(cleaned)}%"

        # Only people the caller shares an organisation with are visible.
        visible_ids = await OrganizationService().get_colleague_ids(current_user["id"])
        if not visible_ids:
            return []

        columns = "id, full_name, github_username, avatar_url"
        results = []
        seen_ids = set()

        for field in ("full_name", "github_username"):
            if len(results) >= limit:
                break

            field_result = await run_blocking(
                db.table("users")
                .select(columns)
                .in_("id", list(visible_ids))
                .not_.is_(field, "null")
                .ilike(field, search_term)
                .limit(limit - len(results))
                .execute
            )

            for user in (field_result.data or []):
                if user["id"] not in seen_ids:
                    results.append(user)
                    seen_ids.add(user["id"])

        return results
    except Exception as e:
        logger.error(f"Error searching users: {type(e).__name__}: {e}")
        return []
