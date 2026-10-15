from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from typing import Any, Dict

from app.api.dependencies import get_current_user
from app.api.errors import safe_detail
from app.services.team_insights_service import TeamInsightsService

router = APIRouter(prefix="/teams", tags=["Teams"])


@router.get("/{team_id}/summary", response_model=Dict[str, Any])
async def get_team_summary(
    team_id: str,
    period_days: int = Query(30, ge=7, le=365),
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    The team page in one call:
      team, period_days,
      metrics: {total_repositories, overall_score, total_issues, critical_issues,
                team_size, velocity (findings resolved in the last 30 days)},
      trends: [{date, average_score, average_issues}],
      repositories: [{id, name, full_name, language, is_private, owner_id,
                      latest_analysis: {overall_score, security_score, ...,
                      total_issues, critical_issues, completed_at} | null}],
      members: [{user_id, role, joined_at, user, total_commits, total_lines_added,
                 total_lines_removed, total_issues_introduced,
                 issues_per_100_commits, repositories}]
    Member figures count this team's repositories only.
    """
    try:
        summary = await TeamInsightsService().get_summary(team_id, current_user["id"], period_days)
    except Exception as e:
        logger.error(f"Error building team summary: {type(e).__name__}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=safe_detail(e))
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return summary


@router.delete("/{team_id}/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_repository(
    team_id: str,
    repo_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a repository from a team. Its owner or a team admin may."""
    try:
        removed = await TeamInsightsService().unassign_repository(team_id, repo_id, current_user["id"])
    except Exception as e:
        logger.error(f"Error unassigning repository: {type(e).__name__}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=safe_detail(e))
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository is not assigned to this team, or you cannot remove it",
        )
