from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import AutoFixRequest
from app.services.repository_service import RepositoryService
from app.tasks.analysis_tasks import analyze_repository_task, auto_fix_issues_task
from app.api.dependencies import get_current_user, get_github_token

router = APIRouter(prefix="/analysis", tags=["Analysis"])


@router.post("/repositories/{repo_id}/analyze")
async def start_analysis(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        analysis_id = await repo_service.create_analysis(repo_id)
        
        analyze_repository_task.delay(
            repo_id=repo_id,
            user_id=current_user["id"],
            github_token=github_token,
            analysis_id=analysis_id
        )
        
        return {
            "analysis_id": analysis_id,
            "status": "pending",
            "message": "Analysis started. This may take a few minutes."
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repositories/{repo_id}/results")
async def get_analysis_results(
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
    
    analysis = await repo_service.get_latest_analysis(repo_id)
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis found. Please start an analysis first."
        )
    
    issues = []
    if analysis["status"] == "completed":
        issues = await repo_service.get_issues(analysis["id"])
    
    return {
        "id": analysis["id"],
        "repository_id": repo_id,
        "status": analysis["status"],
        "overall_score": analysis.get("overall_score"),
        "security_score": analysis.get("security_score"),
        "quality_score": analysis.get("quality_score"),
        "architecture_score": analysis.get("architecture_score"),
        "documentation_score": analysis.get("documentation_score"),
        "total_issues": analysis.get("total_issues", 0),
        "critical_issues": analysis.get("critical_issues", 0),
        "high_issues": analysis.get("high_issues", 0),
        "medium_issues": analysis.get("medium_issues", 0),
        "low_issues": analysis.get("low_issues", 0),
        "issues": issues,
        "started_at": analysis["started_at"],
        "completed_at": analysis.get("completed_at"),
        "error_message": analysis.get("error_message")
    }


@router.get("/repositories/{repo_id}/history")
async def get_analysis_history(
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
    
    try:
        history = await repo_service.get_analysis_history(repo_id)
        
        return {
            "repository_id": repo_id,
            "total_analyses": len(history),
            "history": [
                {
                    "id": item["id"],
                    "overall_score": item.get("overall_score", 0),
                    "security_score": item.get("security_score", 0),
                    "quality_score": item.get("quality_score", 0),
                    "architecture_score": item.get("architecture_score", 0),
                    "total_issues": item.get("total_issues", 0),
                    "completed_at": item.get("completed_at")
                }
                for item in history
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/repositories/{repo_id}/fix")
async def auto_fix_issues(
    repo_id: str,
    fix_request: AutoFixRequest,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        auto_fix_issues_task.delay(
            repo_id=repo_id,
            user_id=current_user["id"],
            github_token=github_token,
            issue_ids=fix_request.issue_ids
        )
        
        return {
            "message": "Auto-fix started. Check the repository for a new pull request.",
            "issue_count": len(fix_request.issue_ids)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repositories/{repo_id}/roadmap")
async def get_improvement_roadmap(
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
    
    roadmap = await repo_service.get_improvement_roadmap(repo_id)
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No roadmap found. Please complete an analysis first."
        )
    
    return roadmap
