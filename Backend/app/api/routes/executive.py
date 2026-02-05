from fastapi import APIRouter, HTTPException, status, Depends, Query
from loguru import logger
from typing import List, Dict, Any
from app.api.dependencies import get_current_user
from app.services.business_metrics_service import BusinessMetricsService
from app.services.team_comparison_service import TeamComparisonService

router = APIRouter(prefix="/executive", tags=["Executive Dashboard"])


@router.get("/organizations/{org_id}/overview", response_model=Dict[str, Any])
async def get_organization_overview(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get high-level organization overview metrics."""
    try:
        service = BusinessMetricsService()
        overview = await service.get_organization_overview(org_id, current_user["id"])
        
        if not overview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found or you don't have access"
            )
        
        return overview
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting organization overview: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/organizations/{org_id}/risk-score", response_model=Dict[str, Any])
async def get_business_risk_score(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get business risk score for organization."""
    try:
        service = BusinessMetricsService()
        risk = await service.get_business_risk_score(org_id, current_user["id"])
        return risk
    except Exception as e:
        logger.error(f"Error getting business risk score: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/organizations/{org_id}/risk-areas", response_model=List[Dict[str, Any]])
async def get_top_risk_areas(
    org_id: str,
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get top risk areas (repositories/files with most critical issues)."""
    try:
        service = BusinessMetricsService()
        risk_areas = await service.get_top_risk_areas(org_id, current_user["id"], limit)
        return risk_areas
    except Exception as e:
        logger.error(f"Error getting top risk areas: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/organizations/{org_id}/compliance", response_model=Dict[str, Any])
async def get_compliance_status(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get compliance status checklist."""
    try:
        service = BusinessMetricsService()
        compliance = await service.get_compliance_status(org_id, current_user["id"])
        return compliance
    except Exception as e:
        logger.error(f"Error getting compliance status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/organizations/{org_id}/teams/compare", response_model=List[Dict[str, Any]])
async def compare_teams(
    org_id: str,
    team_ids: List[str] = Query(None),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Compare teams side-by-side."""
    try:
        service = TeamComparisonService()
        comparison = await service.compare_teams(org_id, current_user["id"], team_ids)
        return comparison
    except Exception as e:
        logger.error(f"Error comparing teams: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/organizations/{org_id}/teams/leaderboard", response_model=List[Dict[str, Any]])
async def get_team_leaderboard(
    org_id: str,
    metric: str = Query("overall_score", regex="^(overall_score|velocity|total_issues|critical_issues)$"),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get team leaderboard ranked by metric."""
    try:
        service = TeamComparisonService()
        leaderboard = await service.get_team_leaderboard(org_id, current_user["id"], metric)
        return leaderboard
    except Exception as e:
        logger.error(f"Error getting team leaderboard: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/teams/{team_id}/trends", response_model=List[Dict[str, Any]])
async def get_team_health_trends(
    team_id: str,
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get team health trends over time."""
    try:
        service = TeamComparisonService()
        trends = await service.get_team_health_trends(team_id, current_user["id"], days)
        return trends
    except Exception as e:
        logger.error(f"Error getting team health trends: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
