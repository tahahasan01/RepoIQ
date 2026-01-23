from celery import Task
from app.core.celery_app import celery_app
from app.agents.orchestrator import AgentOrchestrator
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.services.token_optimizer import get_token_optimizer
from app.services.cache_service import get_analysis_cache
from app.services.toon_service import get_toon_service
from app.tasks.cache_warming import warm_cache_on_analysis_completion
from app.core.logging import get_logger
from typing import Dict, Any
import asyncio

logger = get_logger(__name__)


# Synchronous version without Celery/Redis
async def run_analysis_sync(repo_id: str, user_id: str, github_token: str, analysis_id: str) -> Dict[str, Any]:
    """Run analysis synchronously without using Celery/Redis"""
    logger.info(f"⚡ Starting synchronous repository analysis: {repo_id} (analysis_id: {analysis_id})")
    
    try:
        result = await _run_analysis(repo_id, user_id, github_token, analysis_id)
        logger.info(f"✅ Repository analysis completed successfully: {repo_id}")
        return result
    except Exception as e:
        logger.error(f"❌ Repository analysis failed for {repo_id}: {type(e).__name__}: {str(e)}")
        logger.exception("Full error traceback:")
        
        # Mark analysis as failed
        try:
            repo_service = RepositoryService()
            await repo_service.update_analysis(analysis_id, {
                "status": "failed",
                "error_message": f"{type(e).__name__}: {str(e)}",
                "completed_at": None
            })
            logger.info(f"Marked analysis {analysis_id} as failed in database")
        except Exception as update_error:
            logger.error(f"Failed to update analysis status: {str(update_error)}")
        
        raise


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
    """Wrapper with overall timeout"""
    try:
        return await asyncio.wait_for(
            _run_analysis_internal(repo_id, user_id, github_token, analysis_id),
            timeout=600.0  # 10 minutes max
        )
    except asyncio.TimeoutError:
        logger.error(f"❌ Analysis timed out after 10 minutes for repo {repo_id}")
        raise Exception("Analysis timed out after 10 minutes. Repository may be too large.")

async def _run_analysis_internal(repo_id: str, user_id: str, github_token: str, analysis_id: str) -> Dict[str, Any]:
    repo_service = RepositoryService()
    orchestrator = AgentOrchestrator()
    token_optimizer = get_token_optimizer()
    cache_service = get_analysis_cache()
    toon_service = get_toon_service()
    
    await repo_service.update_analysis(analysis_id, {
        "status": "in_progress"
    })
    
    # repo_id is expected to be internal UUID, but be defensive in case a GitHub numeric id is passed
    repo = await repo_service.get_repository(repo_id, user_id)
    if not repo:
        raise Exception("Repository not found")
    
    github_service = create_github_service(github_token)
    
    # Check cache first
    commit_sha = None  # TODO: Get actual commit SHA from GitHub API
    cached_result = cache_service.get_cached_analysis(repo_id, commit_sha)
    if cached_result:
        logger.info(f"Using cached analysis for repo {repo_id}")
        # Update DB with cached results
        from datetime import datetime
        await repo_service.update_analysis(analysis_id, {
            "status": "completed",
            "overall_score": cached_result["overall_score"],
            "security_score": cached_result["security_score"],
            "quality_score": cached_result["quality_score"],
            "architecture_score": cached_result["architecture_score"],
            "documentation_score": cached_result.get("documentation_score", 100),
            "total_issues": cached_result["total_issues"],
            "critical_issues": cached_result["critical_issues"],
            "high_issues": cached_result["high_issues"],
            "medium_issues": cached_result["medium_issues"],
            "low_issues": cached_result["low_issues"],
            "files_analyzed": cached_result["files_analyzed"],
            "completed_at": datetime.utcnow().isoformat()
        })
        return cached_result
    
    logger.info(f"Fetching repository files for {repo['full_name']}")
    # Fetch ALL files from repository with increased timeout for large repos
    try:
        # Increased timeout to 90 seconds for large repositories
        files = await asyncio.wait_for(
            asyncio.to_thread(github_service.get_repository_files, repo["full_name"], repo["default_branch"]),
            timeout=90.0
        )
        logger.info(f"✅ Successfully fetched {len(files)} files from GitHub")
    except asyncio.TimeoutError:
        logger.error(f"❌ Timeout fetching files from GitHub (90s limit exceeded)")
        raise Exception("Repository file fetch timed out after 90 seconds. Repository is very large or GitHub API is slow. Try analyzing a smaller repository.")
    except Exception as e:
        logger.error(f"❌ Failed to fetch repository files: {str(e)}")
        raise
    
    # Filter for code files only
    def is_code_file(path: str) -> bool:
        """Filter for actual code files, skip UI libraries and tests."""
        # Only skip documentation and config files
        skip_extensions = ['.md', '.txt', '.json', '.yml', '.yaml', 
                          '.toml', '.ini', '.cfg', '.lock', '.log']
        skip_files = ['.gitignore', 'LICENSE', 'Dockerfile', 'Makefile',
                     'requirements.txt', 'package.json', 'package-lock.json']
        
        # Skip entire directories
        skip_dirs = ['node_modules', 'dist', 'build', '__pycache__', '.git',
                    'components/ui', 'src/components/ui',  # shadcn/ui components
                    'frontend/src/components/ui',  # UI library components
                    'tests', 'test', '__tests__',  # Test files
                    '.venv', 'venv', 'env']
        
        # Check if path contains skip directory
        for skip_dir in skip_dirs:
            if f'/{skip_dir}/' in path or path.startswith(skip_dir + '/'):
                return False
        
        filename = path.split('/')[-1]
        
        # Skip by filename
        if filename in skip_files:
            return False
        
        # Skip by extension
        if any(path.endswith(ext) for ext in skip_extensions):
            return False
        
        # Skip hidden files and directories
        if any(part.startswith('.') for part in path.split('/')):
            return False
        
        # Skip test files
        if 'test_' in filename or filename.endswith('_test.py') or filename.endswith('.test.ts') or filename.endswith('.spec.ts'):
            return False
        
        # Include SQL, HTML, CSS, and other web files (important for security analysis)
        return True
    
    code_files_list = [f for f in files if is_code_file(f["path"])]
    
    # Prioritize important files (main app code first)
    def file_priority(file_path: str) -> int:
        path_lower = file_path.lower()
        # High priority: main app/api/service code
        if any(x in path_lower for x in ['/api/', '/service', '/controller', '/model', '/handler']):
            return 0
        # Medium priority: other source code
        if any(x in path_lower for x in ['src/', 'app/', 'backend/', 'server/']):
            return 1
        # Lower priority: frontend components
        return 2
    
    code_files_list.sort(key=lambda f: file_priority(f["path"]))
    
    # Limit to maximum 15 files for analysis (balance between thoroughness and speed)
    MAX_FILES = 15
    MAX_FILE_SIZE = 50 * 1024
    
    if len(code_files_list) > MAX_FILES:
        logger.info(f"Limiting analysis from {len(code_files_list)} to {MAX_FILES} most important files")
        code_files_list = code_files_list[:MAX_FILES]
    
    logger.info(f"Found {len(files)} total files, analyzing {len(code_files_list)} important code files")
    
    # Add detailed logging
    logger.info(f"📊 File breakdown: {len(files)} total, {len(code_files_list)} code files selected")
    if len(code_files_list) == 0:
        logger.warning("⚠️ No code files found to analyze!")
    
    # Fetch content for ALL code files IN PARALLEL (much faster!)
    async def fetch_file_content(file, idx, total):
        try:
            logger.info(f"[{idx}/{total}] Fetching: {file['path']}")
            
            # Increased timeout to 20 seconds per file for reliability
            content = await asyncio.wait_for(
                asyncio.to_thread(
                    github_service.get_file_content,
                    repo["full_name"],
                    file["path"],
                    repo["default_branch"]
                ),
                timeout=20.0
            )
            
            if content:
                # Skip very large files to speed up analysis
                if len(content) > MAX_FILE_SIZE:
                    logger.info(f"Skipping large file {file['path']} ({len(content):,} chars)")
                    return None
                    
                return {
                    "path": file["path"],
                    "content": content
                }
        except asyncio.TimeoutError:
            logger.warning(f"⏱️ Timeout fetching {file['path']} (20s limit)")
            return None
        except Exception as e:
            logger.warning(f"Failed to fetch {file['path']}: {str(e)}")
            return None
    
    # Fetch files in parallel batches of 5 (much faster than sequential!)
    # asyncio already imported at module level
    code_files = []
    batch_size = 5
    for i in range(0, len(code_files_list), batch_size):
        batch = code_files_list[i:i+batch_size]
        results = await asyncio.gather(
            *[fetch_file_content(f, i+idx+1, len(code_files_list)) for idx, f in enumerate(batch)],
            return_exceptions=True
        )
        code_files.extend([r for r in results if r is not None and not isinstance(r, Exception)])
    
    logger.info(f"Successfully loaded {len(code_files)} code files (parallel fetch)")
    
    # Use TOON to compress files for analysis
    logger.info("Compressing files using TOON format...")
    compressed_toon = toon_service.compress_analysis_request(code_files, {
        "language": repo.get("language"),
        "repo_name": repo["name"]
    })
    
    # Calculate token savings
    original_size = sum(len(f["content"]) for f in code_files)
    compressed_size = len(compressed_toon)
    savings_pct = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0
    logger.info(f"TOON compression: {original_size:,} → {compressed_size:,} chars ({savings_pct:.1f}% reduction)")
    
    all_file_paths = [f["path"] for f in files]
    structure = github_service.get_repository_structure(repo["full_name"], repo["default_branch"])
    
    project_context = {
        "project_structure": structure,
        "all_files": all_file_paths,
        "language": repo.get("language"),
        "repo_name": repo["name"]
    }
    
    # Run analysis with TOON-compressed content
    logger.info(f"Running AI analysis on {len(code_files)} files...")
    analysis_result = await orchestrator.analyze_repository(code_files, project_context)
    
    # Track token usage
    total_tokens = token_optimizer.count_tokens(compressed_toon)
    token_optimizer.track_usage("analysis", total_tokens, user_id)
    logger.info(f"Analysis used approximately {total_tokens:,} tokens (TOON-optimized)")
    
    # Save results to DB
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
    
    # CRITICAL: Invalidate API response cache for /results endpoint
    # The cache middleware caches this endpoint for 60 min, but we need fresh data after analysis
    redis_service = cache_service.redis
    # Delete ALL cached /results responses for this repo (we don't know the exact cache key due to user hash)
    cache_pattern = f"api:response:*repositories/{repo_id}/results*"
    try:
        # Use scan to find and delete matching keys
        for key in redis_service.redis_client.scan_iter(match=cache_pattern):
            redis_service.redis_client.delete(key)
            logger.info(f"🗑️ Invalidated cached API response: {key.decode() if isinstance(key, bytes) else key}")
    except Exception as e:
        logger.warning(f"Failed to invalidate API cache (non-critical): {e}")
    
    # Cache the results (7 days - analysis rarely changes unless code changes)
    file_paths = [f["path"] for f in code_files]
    cache_service.cache_analysis(
        repo_id,
        analysis_result,
        commit_sha,
        file_paths,
        ttl=3600 * 24 * 7  # 7 days
    )
    
    # Warm cache for frequently accessed data (issues, README, history)
    try:
        await warm_cache_on_analysis_completion(analysis_id, repo_id, user_id, github_token)
    except Exception as e:
        logger.warning(f"Cache warming failed (non-critical): {e}")
    
    logger.info(f"✓ Analysis complete: {len(code_files)} files, {analysis_result['total_issues']} issues found")
    
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
    
    latest_analysis = await repo_service.get_latest_analysis(repo["id"])
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
        # Defensive access: some fix objects may not include a description
        fix_desc = fix.get("description") if isinstance(fix, dict) else None
        commit_message = f"Auto-fix: {fix_desc}" if fix_desc else "Auto-fix: code improvements"
        github_service.update_file(
            repo["full_name"],
            fix.get("file_path") if isinstance(fix, dict) else None,
            fix.get("fixed_code") if isinstance(fix, dict) else None,
            commit_message,
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
