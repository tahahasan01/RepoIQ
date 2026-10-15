from fastapi import APIRouter, HTTPException, status, Depends, Query
from loguru import logger
from typing import List, Dict, Any, Optional
from app.api.dependencies import get_current_user, get_github_token
from app.services.developer_analytics_service import DeveloperAnalyticsService
from app.services.ownership_service import OwnershipService, DEFAULT_ORPHAN_DAYS
from app.api.errors import safe_detail

router = APIRouter(prefix="/developers", tags=["Developers"])


def _server_error(e: Exception, what: str) -> HTTPException:
    logger.error(f"Error {what}: {type(e).__name__}: {e}")
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=safe_detail(e))


async def _require_repository(repo_id: str, user_id: str) -> Dict[str, Any]:
    from app.services.repository_service import RepositoryService

    repo = await RepositoryService().get_repository(repo_id, user_id)
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    return repo


@router.get("/performance/{user_id}", response_model=Dict[str, Any])
async def get_developer_performance(
    user_id: str,
    repository_id: Optional[str] = Query(None),
    period_days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    A developer's contribution totals.

    SECURITY: another person's figures are visible only to someone who shares
    an organization with them. This previously checked access only when
    repository_id was passed, so omitting it returned anyone's metrics to any
    signed-in user.
    """
    try:
        if user_id != current_user["id"]:
            from app.services.organization_service import OrganizationService

            colleagues = await OrganizationService().get_colleague_ids(current_user["id"])
            if user_id not in colleagues:
                # 404, not 403: whether a user id exists is not the caller's business.
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Developer not found")

        if repository_id:
            repository_id = (await _require_repository(repository_id, current_user["id"]))["id"]

        return await DeveloperAnalyticsService().get_developer_performance(
            user_id=user_id, viewer_id=current_user["id"],
            repository_id=repository_id, period_days=period_days,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "getting developer performance")


@router.get("/organization/{org_id}", response_model=List[Dict[str, Any]])
async def get_organization_developers(
    org_id: str,
    period_days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """All developers in an organization the caller belongs to, with totals."""
    try:
        return await DeveloperAnalyticsService().get_organization_developers(
            organization_id=org_id, user_id=current_user["id"], period_days=period_days
        )
    except Exception as e:
        raise _server_error(e, "getting organization developers")


@router.get("/repositories/{repo_id}/contributors", response_model=List[Dict[str, Any]])
async def get_repository_contributors(
    repo_id: str,
    period_days: int = Query(90, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Contributors to a repository, busiest first."""
    try:
        await _require_repository(repo_id, current_user["id"])
        return await DeveloperAnalyticsService().get_repository_contributors(
            repo_id, current_user["id"], period_days
        )
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "getting repository contributors")


@router.post("/repositories/{repo_id}/insights/refresh")
async def refresh_repository_insights(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
) -> Dict[str, Any]:
    """
    Recompute contributions, code ownership and issue blame now.

    These refresh automatically after every analysis; this is for a repository
    analysed before that existed, or after a burst of commits. It reads the
    files the latest analysis reviewed, so it needs one.

    Replaces /track-contributions and /analyze-ownership, which could never
    succeed (both treated a dict as a PyGithub repository object) and checked
    no ownership at all.
    """
    from app.core.concurrency import run_blocking
    from app.db.postgres import get_service_db
    from app.services.repository_insights import refresh_repository_insights as refresh

    try:
        repo = await _require_repository(repo_id, current_user["id"])
        db = get_service_db()
        latest = (await run_blocking(
            db.table("analysis_results").select("id").eq("repository_id", repo["id"])
            .eq("status", "completed").order("completed_at", desc=True).limit(1).execute
        )).data
        if not latest:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analyze this repository first - insights are built from the files an analysis reviewed.",
            )

        issues = (await run_blocking(
            db.table("issues").select("file_path").eq("analysis_id", latest[0]["id"]).execute
        )).data or []
        paths = sorted({i["file_path"] for i in issues if i.get("file_path")})

        summary = await refresh(repo, github_token, latest[0]["id"], paths)
        return {"success": True, "repository_id": repo["id"], **summary}
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "refreshing repository insights")


@router.get("/repositories/{repo_id}/ownership", response_model=Dict[str, List[Dict[str, Any]]])
async def get_repository_ownership(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, List[Dict[str, Any]]]:
    """Code ownership map: file path -> owners, largest share first."""
    try:
        await _require_repository(repo_id, current_user["id"])
        return await OwnershipService().get_repository_ownership(repo_id, current_user["id"])
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "getting repository ownership")


@router.get("/repositories/{repo_id}/ownership/health", response_model=Dict[str, Any])
async def get_ownership_health(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Ownership health for a repository."""
    try:
        await _require_repository(repo_id, current_user["id"])
        return await OwnershipService().get_ownership_health(repo_id, current_user["id"])
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "getting ownership health")


@router.get("/issues/{issue_id}/blame", response_model=List[Dict[str, Any]])
async def get_issue_blame(
    issue_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Who introduced the line a finding points at."""
    try:
        return await OwnershipService().get_issue_blame(issue_id, current_user["id"])
    except Exception as e:
        raise _server_error(e, "getting issue blame")


@router.get("/repositories/{repo_id}/orphaned-code", response_model=List[Dict[str, Any]])
async def get_orphaned_code(
    repo_id: str,
    days_threshold: int = Query(DEFAULT_ORPHAN_DAYS, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Files no current owner has committed to within the threshold."""
    try:
        await _require_repository(repo_id, current_user["id"])
        return await OwnershipService().get_orphaned_code(repo_id, current_user["id"], days_threshold)
    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "getting orphaned code")
