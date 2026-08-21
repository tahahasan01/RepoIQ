from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List
import re
from github import GithubException
from app.schemas import RepositoryResponse
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.api.dependencies import get_current_user, get_github_token
from app.services.auth_service import AuthService
from app.core.logging import get_logger
from app.api.errors import safe_detail

logger = get_logger(__name__)
router = APIRouter(prefix="/github", tags=["GitHub"])


def validate_file_path(file_path: str) -> str:
    """
    SECURITY: Validate and sanitize file path to prevent path traversal attacks.
    
    Raises HTTPException if path is invalid or contains traversal attempts.
    Returns sanitized path.
    """
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File path is required"
        )
    
    # Normalize the path - remove leading/trailing whitespace and leading slashes
    # (leading slashes are safe in repo context, they just mean "from repo root")
    normalized_path = file_path.strip().lstrip('/').lstrip('\\')
    
    # SECURITY: Block path traversal attempts
    traversal_patterns = [
        r'\.\.',        # Parent directory traversal
        r'^[a-zA-Z]:',  # Windows drive letter (absolute system path)
        r'~',           # Home directory
        r'\x00',        # Null byte injection
    ]
    
    for pattern in traversal_patterns:
        if re.search(pattern, normalized_path):
            logger.warning(f"🚫 Path traversal attempt blocked: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file path: path traversal not allowed"
            )
    
    # SECURITY: Block potentially dangerous file extensions
    dangerous_extensions = ['.env', '.pem', '.key', '.secret', '.credentials']
    lower_path = normalized_path.lower()
    for ext in dangerous_extensions:
        if lower_path.endswith(ext) or f'{ext}.' in lower_path:
            logger.warning(f"🚫 Access to sensitive file blocked: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to this file type is not allowed"
            )
    
    return normalized_path


@router.get("/connected")
async def check_connection(current_user: dict = Depends(get_current_user)):
    return {
        "connected": current_user.get("github_connected", False),
        "username": current_user.get("github_username")
    }


@router.post("/sync")
async def sync_repositories(
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    try:
        repos = await repo_service.sync_repositories(current_user["id"], github_token)
        return {
            "synced_count": len(repos),
            "repositories": repos
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories", response_model=List[RepositoryResponse])
async def get_repositories(
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    
    try:
        repos = await repo_service.get_user_repositories(
            current_user["id"],
            page=page,
            per_page=per_page
        )
        return repos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    return repo


@router.get("/repositories/{repo_id}/files")
async def get_repository_files(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    try:
        logger.info(f"📂 Fetching files for repository: {repo_id}")
        files = await repo_service.get_repository_files(
            repo_id,
            current_user["id"],
            github_token
        )
        logger.info(f"✅ Returning {len(files) if files else 0} files")
        return {"files": files}
    except Exception as e:
        logger.error(f"❌ Failed to fetch repository files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/files/content")
async def get_file_content(
    repo_id: str,
    file_path: str = Query(..., description="Path to file within repository"),
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    # SECURITY: Validate file path to prevent traversal attacks
    validated_path = validate_file_path(file_path)
    
    try:
        content = await repo_service.get_file_content(
            repo_id,
            current_user["id"],
            validated_path,
            github_token
        )
        return {"file_path": validated_path, "content": content}
    except GithubException as e:
        # File doesn't exist or GitHub API error
        if e.status == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {file_path}"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "GitHub API error")
        )
    except Exception as e:
        # Check if error message indicates file not found
        error_msg = str(e).lower()
        if "not found" in error_msg or "404" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {file_path}"
            )
        # Other server errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/user/info")
async def get_github_user_info(
    github_token: str = Depends(get_github_token)
):
    try:
        github_service = create_github_service(github_token)
        user_info = github_service.get_user_info()
        return user_info
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )

@router.post("/disconnect")
async def disconnect_github(
    current_user: dict = Depends(get_current_user)
):
    """Disconnect the user's GitHub account by clearing stored tokens and username."""
    auth_service = AuthService()
    try:
        await auth_service.update_user(current_user["id"], {
            "github_connected": False,
            "github_access_token": None,
            "github_username": None,
            "avatar_url": None
        })
        return {"message": "GitHub disconnected"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )
