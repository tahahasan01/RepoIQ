from fastapi import APIRouter, HTTPException, status, Depends, Query
from loguru import logger
from typing import List, Dict, Any, Optional
from app.api.dependencies import get_current_user, get_github_token
from app.services.developer_analytics_service import DeveloperAnalyticsService
from app.services.ownership_service import OwnershipService
from app.api.errors import safe_detail

router = APIRouter(prefix="/developers", tags=["Developers"])


@router.get("/performance/{user_id}", response_model=Dict[str, Any])
async def get_developer_performance(
    user_id: str,
    repository_id: Optional[str] = Query(None),
    period_days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get developer performance metrics."""
    try:
        # Users can only view their own performance or if they have access to the repository
        if user_id != current_user["id"] and repository_id:
            from app.services.repository_service import RepositoryService
            repo_service = RepositoryService()
            repo = await repo_service.get_repository(repository_id, current_user["id"])
            if not repo:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this repository"
                )
        
        service = DeveloperAnalyticsService()
        performance = await service.get_developer_performance(
            user_id=user_id,
            repository_id=repository_id,
            period_days=period_days
        )
        
        if not performance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Developer performance data not found"
            )
        
        return performance
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting developer performance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/organization/{org_id}", response_model=List[Dict[str, Any]])
async def get_organization_developers(
    org_id: str,
    period_days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all developers in an organization with their metrics."""
    try:
        service = DeveloperAnalyticsService()
        developers = await service.get_organization_developers(
            organization_id=org_id,
            user_id=current_user["id"],
            period_days=period_days
        )
        return developers
    except Exception as e:
        logger.error(f"Error getting organization developers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/contributors", response_model=List[Dict[str, Any]])
async def get_repository_contributors(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all contributors to a repository."""
    try:
        service = DeveloperAnalyticsService()
        contributors = await service.get_repository_contributors(repo_id, current_user["id"])
        return contributors
    except Exception as e:
        logger.error(f"Error getting repository contributors: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/repositories/{repo_id}/track-contributions")
async def track_repository_contributions(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
) -> Dict[str, Any]:
    """Track developer contributions for a repository."""
    try:
        service = DeveloperAnalyticsService()
        success = await service.track_developer_contributions(
            repository_id=repo_id,
            github_token=github_token
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to track contributions"
            )
        
        return {"success": True, "repository_id": repo_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error tracking contributions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/ownership", response_model=Dict[str, List[Dict[str, Any]]])
async def get_repository_ownership(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, List[Dict[str, Any]]]:
    """Get code ownership map for a repository."""
    try:
        service = OwnershipService()
        ownership = await service.get_repository_ownership(repo_id, current_user["id"])
        return ownership
    except Exception as e:
        logger.error(f"Error getting repository ownership: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/ownership/health", response_model=Dict[str, Any])
async def get_ownership_health(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get ownership health scores for a repository."""
    try:
        service = OwnershipService()
        health = await service.get_ownership_health(repo_id, current_user["id"])
        return health
    except Exception as e:
        logger.error(f"Error getting ownership health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/issues/{issue_id}/blame", response_model=List[Dict[str, Any]])
async def get_issue_blame(
    issue_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get blame information for an issue."""
    try:
        service = OwnershipService()
        blame = await service.get_issue_blame(issue_id, current_user["id"])
        return blame
    except Exception as e:
        logger.error(f"Error getting issue blame: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/orphaned-code", response_model=List[Dict[str, Any]])
async def get_orphaned_code(
    repo_id: str,
    days_threshold: int = Query(90, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get files with no active owner (orphaned code)."""
    try:
        service = OwnershipService()
        orphaned = await service.get_orphaned_code(repo_id, current_user["id"], days_threshold)
        return orphaned
    except Exception as e:
        logger.error(f"Error getting orphaned code: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/repositories/{repo_id}/analyze-ownership")
async def analyze_code_ownership(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
) -> Dict[str, Any]:
    """Analyze code ownership for a repository."""
    try:
        service = OwnershipService()
        success = await service.analyze_code_ownership(
            repository_id=repo_id,
            github_token=github_token
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to analyze code ownership"
            )
        
        return {"success": True, "repository_id": repo_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing code ownership: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )
