from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List
from app.schemas import GitHubRepo, RepositoryResponse
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.api.dependencies import get_current_user, get_github_token

router = APIRouter(prefix="/github", tags=["GitHub"])


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
            detail=str(e)
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
            detail=str(e)
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
        files = await repo_service.get_repository_files(
            repo_id,
            current_user["id"],
            github_token
        )
        return {"files": files}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repositories/{repo_id}/files/content")
async def get_file_content(
    repo_id: str,
    file_path: str = Query(...),
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    try:
        content = await repo_service.get_file_content(
            repo_id,
            current_user["id"],
            file_path,
            github_token
        )
        return {"file_path": file_path, "content": content}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
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
            detail=str(e)
        )
