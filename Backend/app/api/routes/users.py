from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from app.schemas import UserResponse, UserUpdate, PasswordChange
from app.services.auth_service import AuthService
from app.api.dependencies import get_current_user
from app.api.errors import safe_detail
from app.core.concurrency import run_blocking

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
            detail=safe_detail(e)
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

        # Build the set of user ids the caller is allowed to see: everyone who
        # belongs to a team in an organisation the caller belongs to, plus the
        # owners of those organisations.
        org_service = OrganizationService()
        orgs = await org_service.list_user_organizations(current_user["id"])
        org_ids = [o["id"] for o in orgs]

        if not org_ids:
            return []

        visible_ids = {o["owner_id"] for o in orgs if o.get("owner_id")}

        teams_result = await run_blocking(
            db.table("teams").select("id").in_("organization_id", org_ids).execute
        )
        team_ids = [t["id"] for t in (teams_result.data or [])]

        if team_ids:
            members_result = await run_blocking(
                db.table("team_members").select("user_id").in_("team_id", team_ids).execute
            )
            visible_ids.update(m["user_id"] for m in (members_result.data or []))

        visible_ids.discard(current_user["id"])
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
