from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks, Query
from loguru import logger
from app.schemas import AutoFixRequest
from app.services.repository_service import RepositoryService
from app.tasks.analysis_tasks import analyze_repository_task, auto_fix_issues_task
from app.api.dependencies import get_current_user, get_github_token
from app.api.errors import safe_detail

router = APIRouter(prefix="/analysis", tags=["Analysis"])

# Track currently running analysis per user
_running_analyses: dict[str, str] = {}  # user_id -> analysis_id


@router.post("/repositories/{repo_id}/analyze")
async def start_analysis(
    repo_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    logger.info(f"[start_analysis] User {current_user['id']} requesting analysis for repo {repo_id}")
    
    # Cancel any existing running analysis for this user
    user_id = current_user['id']
    if user_id in _running_analyses:
        previous_analysis_id = _running_analyses[user_id]
        logger.info(f"[start_analysis] Cancelling previous analysis {previous_analysis_id}")
        try:
            await repo_service.update_analysis(previous_analysis_id, {
                "status": "cancelled",
                "error_message": "Cancelled: New analysis started"
            })
            logger.info(f"[start_analysis] ✅ Cancelled previous analysis {previous_analysis_id}")
        except Exception as e:
            logger.warning(f"[start_analysis] Failed to cancel previous analysis: {str(e)}")
    
    # Validate repository access
    try:
        repo = await repo_service.get_repository(repo_id, current_user["id"])
        if not repo:
            logger.warning(f"[start_analysis] Repository {repo_id} not found for user {current_user['id']}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found"
            )
        logger.info(f"[start_analysis] Found repository: {repo['name']} (ID: {repo['id']})")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[start_analysis] Error fetching repository: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to fetch repository")
        )
    
    # Create analysis record
    try:
        analysis_id = await repo_service.create_analysis(repo["id"])
        logger.info(f"[start_analysis] Created analysis record: {analysis_id}")
    except Exception as e:
        logger.error(f"[start_analysis] Failed to create analysis record: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to create analysis record")
        )
    
    # Add background task
    try:
        from app.tasks.analysis_tasks import run_analysis_sync
        background_tasks.add_task(
            run_analysis_sync,
            repo_id=repo["id"],
            user_id=current_user["id"],
            github_token=github_token,
            analysis_id=analysis_id
        )
        logger.info(f"[start_analysis] ✅ Background task added for analysis {analysis_id}")
        
        # Track this as the current running analysis
        _running_analyses[user_id] = analysis_id
        
        return {
            "analysis_id": analysis_id,
            "repository_id": repo["id"],
            "repository_name": repo["name"],
            "status": "in_progress",
            "message": "Analysis started successfully. Check status using the results endpoint.",
            "estimated_time_seconds": 60
        }
    except Exception as e:
        logger.error(f"[start_analysis] ❌ Failed to add background task: {str(e)}")
        # Mark analysis as failed since background task couldn't start
        try:
            await repo_service.update_analysis(analysis_id, {
                "status": "failed",
                "error_message": f"Failed to start background task: {str(e)}"
            })
        except:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to start analysis task")
        )


@router.get("/batch/results")
async def get_batch_analysis_results(
    current_user: dict = Depends(get_current_user)
):
    """Fetch latest analysis results for all user repositories in one optimized request"""
    repo_service = RepositoryService()
    
    try:
        # Use optimized single-query batch fetch
        analysis_map = await repo_service.get_batch_latest_analyses(current_user["id"])
        
        logger.info(f"[batch/results] Fetched {len(analysis_map)} analyses for user {current_user['id']}")
        
        return {"results": analysis_map}
    except Exception as e:
        logger.error(f"Batch analysis fetch failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/results")
async def get_analysis_results(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
):
    from app.services.redis_service import get_redis_service
    
    repo_service = RepositoryService()
    redis = get_redis_service()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    # Check for cached analysis result FIRST for instant loading
    cached_analysis = redis.get(f"analysis:result:{repo['id']}")
    if cached_analysis:
        logger.info(f"[get_analysis_results] ⚡ INSTANT: Using cached analysis for repo {repo_id}")
        # Still need to get the latest analysis to ensure freshness
        pass
    
    analysis = await repo_service.get_latest_analysis(repo["id"])
    logger.info(f"[get_analysis_results] repo_id={repo_id} (resolved={repo['id']}), analysis={analysis}")
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analysis found. Please start an analysis first."
        )
    
    issues = []
    if analysis["status"] == "completed":
        issues = await repo_service.get_issues(analysis["id"])
        logger.info(f"[get_analysis_results] Found {len(issues)} issues for analysis {analysis['id']}")
        if issues:
            logger.info(f"[get_analysis_results] Sample issue: {issues[0] if issues else 'none'}")
    else:
        logger.warning(f"[get_analysis_results] Analysis status is {analysis['status']}, not returning issues")
    
    result = {
        "id": analysis["id"],
        "repository_id": repo["id"],
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
    logger.info(f"[get_analysis_results] Returning result with {len(result['issues'])} issues, scores: overall={result['overall_score']}, security={result['security_score']}")
    return result


@router.get("/{analysis_id}/issues")
async def get_analysis_issues(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    analysis = await repo_service.get_analysis(analysis_id)
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )

    # Ensure the analysis belongs to the current user
    repo = await repo_service.get_repository(analysis["repository_id"], current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )

    issues = await repo_service.get_issues(analysis_id)
    return issues


@router.get("/{analysis_id}")
async def get_analysis_by_id(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific analysis by its ID"""
    repo_service = RepositoryService()
    
    try:
        analysis = await repo_service.get_analysis(analysis_id)
        
        if not analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis not found"
            )
        
        # Verify user owns the repository
        repo = await repo_service.get_repository(analysis["repository_id"], current_user["id"])
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        
        # Get issues for this analysis
        issues = await repo_service.get_issues(analysis_id)
        analysis["issues"] = issues
        
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get analysis by ID failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/{analysis_id}/cancel")
async def cancel_analysis(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a running analysis"""
    repo_service = RepositoryService()
    
    try:
        analysis = await repo_service.get_analysis(analysis_id)
        
        if not analysis:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Analysis not found"
            )
        
        # Verify user owns the repository
        repo = await repo_service.get_repository(analysis["repository_id"], current_user["id"])
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        
        # Only cancel if in progress
        if analysis["status"] not in ["in_progress", "starting"]:
            return {
                "message": f"Analysis is already {analysis['status']}, cannot cancel",
                "status": analysis["status"]
            }
        
        # Signal the running background task to stop at the next checkpoint
        from app.tasks.analysis_tasks import request_cancellation
        request_cancellation(analysis_id)
        
        # Mark as cancelled in DB
        await repo_service.update_analysis(analysis_id, {
            "status": "cancelled",
            "error_message": "Cancelled by user"
        })
        
        # Remove from running analyses if it's the current one
        user_id = current_user["id"]
        if user_id in _running_analyses and _running_analyses[user_id] == analysis_id:
            del _running_analyses[user_id]
        
        logger.info(f"[cancel_analysis] ✅ Cancelled analysis {analysis_id}")
        
        return {
            "message": "Analysis cancelled successfully",
            "analysis_id": analysis_id,
            "status": "cancelled"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel analysis failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/repositories/{repo_id}/history")
async def get_analysis_history(
    repo_id: str,
    refresh: bool = Query(False, description="Force refresh from database, bypassing cache"),
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
        logger.info(f"[get_analysis_history] Fetching history for repo {repo_id}, refresh={refresh}")
        history = await repo_service.get_analysis_history(repo["id"], skip_cache=refresh)
        
        # Ensure history is a list
        if not history:
            history = []
        
        logger.info(f"[get_analysis_history] Found {len(history)} analyses for repo {repo_id}")
        
        return {
            "repository_id": repo["id"],
            "total_analyses": len(history),
            "history": [
                {
                    "id": item["id"],
                    "overall_score": item.get("overall_score", 0),
                    "security_score": item.get("security_score", 0),
                    "quality_score": item.get("quality_score", 0),
                    "architecture_score": item.get("architecture_score", 0),
                    "total_issues": item.get("total_issues", 0),
                    "completed_at": item.get("completed_at"),
                    "status": item.get("status", "completed")
                }
                for item in history
            ]
        }
    except Exception as e:
        logger.error(f"[get_analysis_history] Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/repositories/{repo_id}/fix")
async def auto_fix_issues(
    repo_id: str,
    fix_request: AutoFixRequest,
    current_user: dict = Depends(get_current_user),
    # Kept as a dependency purely as a precondition check: it 403s when the user
    # has no connected GitHub account, before we queue work that would fail in
    # the worker. The value is deliberately unused - the worker resolves its own.
    _github_connected: str = Depends(get_github_token)
):
    repo_service = RepositoryService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        # SECURITY: no github_token here. Celery kwargs are serialised into the
        # Redis broker in plaintext; the worker resolves and decrypts the token
        # from user_id instead. See app/services/github_token.py.
        auto_fix_issues_task.delay(
            repo_id=repo["id"],
            user_id=current_user["id"],
            issue_ids=fix_request.issue_ids
        )
        
        return {
            "message": "Auto-fix started. Check the repository for a new pull request.",
            "issue_count": len(fix_request.issue_ids)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
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
    
    roadmap = await repo_service.get_improvement_roadmap(repo["id"])
    if not roadmap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No roadmap found. Please complete an analysis first."
        )
    
    return roadmap


@router.get("/repositories/{repo_id}/architecture")
async def get_architecture_diagram(
    repo_id: str,
    current_user: dict = Depends(get_current_user),
    github_token: str = Depends(get_github_token)
):
    """Generate an architecture diagram based on the repository's file structure."""
    from app.agents.documentation_agent import DocumentationAgent
    from app.services.github_service import GitHubService
    
    repo_service = RepositoryService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        # Get file list from GitHub
        github_service = GitHubService(github_token)
        files = await github_service.get_repository_files(repo["full_name"])
        
        if not files:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No files found in repository"
            )
        
        # Extract file paths
        file_paths = [f.get("path", f.get("name", "")) for f in files if isinstance(f, dict)]
        if not file_paths:
            file_paths = [str(f) for f in files]
        
        logger.info(f"[get_architecture_diagram] Generating diagram for {len(file_paths)} files")
        
        # Generate architecture diagram
        doc_agent = DocumentationAgent()
        diagram = await doc_agent.generate_architecture_diagram(
            files=file_paths,
            repo_name=repo.get("name", "Repository")
        )
        
        return {
            "repository_id": repo_id,
            "repository_name": repo.get("name"),
            "diagram": diagram,
            "file_count": len(file_paths)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_architecture_diagram] Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to generate architecture diagram")
        )
