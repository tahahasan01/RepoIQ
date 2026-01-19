from celery import Task
from app.core.celery_app import celery_app
from app.agents.orchestrator import AgentOrchestrator
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.core.logging import get_logger
from typing import Dict, Any
import asyncio

logger = get_logger(__name__)


class CallbackTask(Task):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(f"Task {task_id} failed: {str(exc)}")
        
        analysis_id = kwargs.get("analysis_id")
        if analysis_id:
            asyncio.run(self._mark_analysis_failed(analysis_id, str(exc)))
    
    async def _mark_analysis_failed(self, analysis_id: str, error: str):
        try:
            repo_service = RepositoryService()
            await repo_service.update_analysis(analysis_id, {
                "status": "failed",
                "error_message": error,
                "completed_at": None
            })
        except Exception as e:
            logger.error(f"Failed to mark analysis as failed: {str(e)}")


@celery_app.task(base=CallbackTask, bind=True, name="analyze_repository")
def analyze_repository_task(self, repo_id: str, user_id: str, github_token: str, analysis_id: str):
    logger.info(f"Starting repository analysis: {repo_id}")
    
    try:
        result = asyncio.run(_run_analysis(repo_id, user_id, github_token, analysis_id))
        logger.info(f"Repository analysis completed: {repo_id}")
        return result
    except Exception as e:
        logger.error(f"Repository analysis failed: {str(e)}")
        raise


async def _run_analysis(repo_id: str, user_id: str, github_token: str, analysis_id: str) -> Dict[str, Any]:
    repo_service = RepositoryService()
    orchestrator = AgentOrchestrator()
    
    await repo_service.update_analysis(analysis_id, {
        "status": "in_progress"
    })
    
    repo = await repo_service.get_repository(repo_id, user_id)
    if not repo:
        raise Exception("Repository not found")
    
    github_service = create_github_service(github_token)
    
    files = github_service.get_repository_files(repo["full_name"], repo["default_branch"])
    
    code_files = []
    for file in files[:50]:
        try:
            content = github_service.get_file_content(
                repo["full_name"],
                file["path"],
                repo["default_branch"]
            )
            
            if content:
                code_files.append({
                    "path": file["path"],
                    "content": content
                })
        except Exception as e:
            logger.warning(f"Failed to fetch file {file['path']}: {str(e)}")
            continue
    
    all_file_paths = [f["path"] for f in files]
    structure = github_service.get_repository_structure(repo["full_name"], repo["default_branch"])
    
    project_context = {
        "project_structure": structure,
        "all_files": all_file_paths,
        "language": repo.get("language"),
        "repo_name": repo["name"]
    }
    
    analysis_result = await orchestrator.analyze_repository(code_files, project_context)
    
    await repo_service.save_issues(analysis_id, analysis_result["issues"])
    
    roadmap = await orchestrator.generate_improvement_roadmap(analysis_result["issues"])
    await repo_service.save_improvement_roadmap(repo_id, roadmap)
    
    from datetime import datetime
    await repo_service.update_analysis(analysis_id, {
        "status": "completed",
        "overall_score": analysis_result["overall_score"],
        "security_score": analysis_result["security_score"],
        "quality_score": analysis_result["quality_score"],
        "architecture_score": analysis_result["architecture_score"],
        "documentation_score": analysis_result.get("documentation_score", 100),
        "total_issues": analysis_result["total_issues"],
        "critical_issues": analysis_result["critical_issues"],
        "high_issues": analysis_result["high_issues"],
        "medium_issues": analysis_result["medium_issues"],
        "low_issues": analysis_result["low_issues"],
        "files_analyzed": analysis_result["files_analyzed"],
        "completed_at": datetime.utcnow().isoformat()
    })
    
    await repo_service.update_repository(repo_id, user_id, {
        "last_analyzed": datetime.utcnow().isoformat()
    })
    
    return {
        "analysis_id": analysis_id,
        "status": "completed",
        "scores": {
            "overall": analysis_result["overall_score"],
            "security": analysis_result["security_score"],
            "quality": analysis_result["quality_score"],
            "architecture": analysis_result["architecture_score"]
        }
    }


@celery_app.task(name="auto_fix_issues")
def auto_fix_issues_task(repo_id: str, user_id: str, github_token: str, issue_ids: list):
    logger.info(f"Starting auto-fix for repository: {repo_id}")
    
    try:
        result = asyncio.run(_run_auto_fix(repo_id, user_id, github_token, issue_ids))
        logger.info(f"Auto-fix completed: {repo_id}")
        return result
    except Exception as e:
        logger.error(f"Auto-fix failed: {str(e)}")
        raise


async def _run_auto_fix(repo_id: str, user_id: str, github_token: str, issue_ids: list) -> Dict[str, Any]:
    repo_service = RepositoryService()
    orchestrator = AgentOrchestrator()
    
    repo = await repo_service.get_repository(repo_id, user_id)
    if not repo:
        raise Exception("Repository not found")
    
    github_service = create_github_service(github_token)
    
    latest_analysis = await repo_service.get_latest_analysis(repo_id)
    if not latest_analysis:
        raise Exception("No analysis found")
    
    issues = await repo_service.get_issues(latest_analysis["id"])
    
    issues_to_fix = [issue for issue in issues if issue["id"] in issue_ids]
    
    code_files = {}
    for issue in issues_to_fix:
        file_path = issue["file_path"]
        if file_path not in code_files:
            content = github_service.get_file_content(repo["full_name"], file_path, repo["default_branch"])
            code_files[file_path] = content
    
    fixes = await orchestrator.auto_fix_issues(issues_to_fix, code_files)
    
    branch_name = f"autofix-{latest_analysis['id'][:8]}"
    github_service.create_branch(repo["full_name"], branch_name, repo["default_branch"])
    
    for fix in fixes:
        github_service.update_file(
            repo["full_name"],
            fix["file_path"],
            fix["fixed_code"],
            f"Auto-fix: {fix['description']}",
            branch_name
        )
    
    if fixes:
        pr = github_service.create_pull_request(
            repo["full_name"],
            f"Auto-fix: {len(fixes)} issues",
            f"This PR contains automated fixes for {len(fixes)} issues detected by CodeRabbit AI.",
            branch_name,
            repo["default_branch"]
        )
    
    return {
        "fixed_count": len(fixes),
        "branch": branch_name,
        "pull_request": pr if fixes else None
    }
