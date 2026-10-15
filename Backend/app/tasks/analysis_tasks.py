from celery import Task
from app.core.celery_app import celery_app
from app.agents.orchestrator import AgentOrchestrator
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.services.token_optimizer import get_token_optimizer
from app.services.toon_service import get_toon_service
from app.services.incremental_analysis import partition_files, record_batch_findings
from app.services.redis_service import get_redis_service
from app.core.concurrency import run_blocking
from app.core.config import get_settings
from app.core.logging import get_logger
from typing import Dict, Any
import asyncio

logger = get_logger(__name__)
settings = get_settings()

# ─── Cancellation mechanism ─────────────────────────────────────────────────
# Backed by Redis, not a module-level set.
#
# The previous implementation relied on "BackgroundTasks run in the same process
# as the FastAPI server". That holds for a single worker and nothing else: with
# WORKERS=4 or more than one instance, a cancel request only worked if it landed
# on the process running the analysis, and otherwise did nothing while telling
# the user it had succeeded.
from app.services.analysis_registry import (
    is_cancelled,
    clear_cancellation,
    clear_running,
)


def _check_cancelled(analysis_id: str):
    """Raise if this analysis has been cancelled. Call at key checkpoints."""
    if is_cancelled(analysis_id):
        clear_cancellation(analysis_id)
        logger.info(f"[cancellation] Analysis {analysis_id} detected cancellation — aborting")
        raise AnalysisCancelled(analysis_id)


class AnalysisCancelled(Exception):
    """Raised when an analysis is cancelled by the user."""
    def __init__(self, analysis_id: str):
        self.analysis_id = analysis_id
        super().__init__(f"Analysis {analysis_id} was cancelled by the user")
# ─────────────────────────────────────────────────────────────────────────────


# Synchronous version without Celery/Redis
async def run_analysis_sync(repo_id: str, user_id: str, github_token: str, analysis_id: str) -> Dict[str, Any]:
    """
    Run an analysis in-process.

    The running marker is cleared in every exit path. It previously was not
    cleared on success at all, so `_running_analyses` grew unboundedly and each
    completed analysis left a stale entry that caused the NEXT analysis start to
    "cancel" an already-finished one.
    """
    logger.info(f"⚡ Starting synchronous repository analysis: {repo_id} (analysis_id: {analysis_id})")

    try:
        result = await _run_analysis(repo_id, user_id, github_token, analysis_id)
        logger.info(f"✅ Repository analysis completed successfully: {repo_id}")
        return result
    except AnalysisCancelled:
        # User pressed cancel — mark as cancelled in DB and stop gracefully
        logger.info(f"🛑 Analysis {analysis_id} was cancelled by user for repo {repo_id}")
        try:
            repo_service = RepositoryService()
            await repo_service.update_analysis(analysis_id, {
                "status": "cancelled",
                "error_message": "Cancelled by user"
            })
        except Exception as update_error:
            logger.error(f"Failed to update cancelled analysis status: {str(update_error)}")
        # Clean up the cancellation flag in case it wasn't cleared
        clear_cancellation(analysis_id)
        return {"analysis_id": analysis_id, "status": "cancelled"}
    except Exception as e:
        logger.error(f"❌ Repository analysis failed for {repo_id}: {type(e).__name__}: {str(e)}")
        logger.exception("Full error traceback:")
        
        # Mark analysis as failed
        try:
            repo_service = RepositoryService()
            await repo_service.update_analysis(analysis_id, {
                "status": "failed",
                # A failure the user can act on ("check your API key") is
                # shown as written. Everything else keeps the class name, which
                # is what makes an unexpected bug diagnosable from the record.
                "error_message": (
                    str(e) if getattr(e, "user_facing", False)
                    else f"{type(e).__name__}: {str(e)}"
                ),
                "completed_at": None
            })
            logger.info(f"Marked analysis {analysis_id} as failed in database")
        except Exception as update_error:
            logger.error(f"Failed to update analysis status: {str(update_error)}")

        raise
    finally:
        # Every exit path - success, cancellation, failure - releases the slot.
        clear_running(user_id, analysis_id)


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
def analyze_repository_task(self, repo_id: str, user_id: str, analysis_id: str):
    """
    SECURITY: takes user_id, not github_token. Celery serialises task arguments
    into the Redis broker, so a token passed here would sit in the queue in
    plaintext - readable by anything with Redis access, including the
    unauthenticated Flower dashboard. The worker resolves and decrypts the token
    itself, in memory, at the moment it needs it.
    """
    logger.info(f"Starting repository analysis: {repo_id}")

    try:
        result = asyncio.run(_run_analysis_for_user(repo_id, user_id, analysis_id))
        logger.info(f"Repository analysis completed: {repo_id}")
        return result
    except Exception as e:
        logger.error(f"Repository analysis failed: {str(e)}")
        raise


async def _run_analysis_for_user(repo_id: str, user_id: str, analysis_id: str) -> Dict[str, Any]:
    """Resolve the caller's GitHub token inside the worker, then run the analysis."""
    from app.services.github_token import resolve_github_token_for_user

    github_token = await resolve_github_token_for_user(user_id)
    return await _run_analysis(repo_id, user_id, github_token, analysis_id)


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
    orchestrator = AgentOrchestrator(user_id=user_id)
    token_optimizer = get_token_optimizer()
    toon_service = get_toon_service()
    
    await repo_service.update_analysis(analysis_id, {
        "status": "in_progress"
    })
    
    # ── Cancellation checkpoint 1: before starting real work ──
    _check_cancelled(analysis_id)
    
    # repo_id is expected to be internal UUID, but be defensive in case a GitHub numeric id is passed
    repo = await repo_service.get_repository(repo_id, user_id)
    if not repo:
        raise Exception("Repository not found")
    
    github_service = create_github_service(github_token)
    
    # Record which commit this analysis reviewed.
    #
    # There used to be a second, whole-analysis cache keyed on this SHA. It was
    # redundant - per-file findings are cached by blob SHA (incremental
    # analysis), so re-analysing unchanged code already costs no model calls -
    # and it was broken: a cache hit wrote the scores and counts onto the new
    # analysis but never saved its issues, so the UI showed "16 issues" over an
    # empty list.
    commit_sha = None
    try:
        commit_sha = await run_blocking(
            github_service.get_default_branch_sha,
            repo["full_name"],
            repo["default_branch"],
        )
    except Exception as e:
        logger.warning(f"Could not resolve commit SHA: {e}")

    # ── Cancellation checkpoint 2: before fetching files from GitHub ──
    _check_cancelled(analysis_id)
    
    logger.info(f"Fetching repository files for {repo['full_name']}")
    # Fetch ALL files from repository with increased timeout for large repos
    try:
        # Increased timeout to 90 seconds for large repositories
        files = await asyncio.wait_for(
            asyncio.to_thread(github_service.get_repository_files, repo["full_name"], repo["default_branch"]),
            timeout=90.0
        )
        logger.info(f"✅ Successfully fetched {len(files)} files from GitHub")
        
        # IMPORTANT: Cache files for instant loading on Files page
        redis = get_redis_service()
        redis.set(f"files:list:{repo_id}", files, ttl=3600)
        logger.info(f"⚡ Pre-cached {len(files)} files for instant dashboard loading")
        
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
    
    # HONESTY: the analysis reads a SAMPLE of the repository, not all of it.
    #
    # This limit was hardcoded at 15 and reported nowhere. For any real
    # repository that means the "overall score", "security score" and issue
    # counts shown in the UI as an assessment of the repository were computed
    # from well under 1% of it, with nothing telling the user so.
    #
    # The limit stays (a full-repository pass needs the incremental,
    # blob-SHA-keyed design in Phase 4.1), but it is now configurable and the
    # sample size travels with the result so the UI can disclose it.
    MAX_FILES = settings.ANALYSIS_MAX_FILES
    MAX_FILE_SIZE = settings.ANALYSIS_MAX_FILE_BYTES

    files_eligible = len(code_files_list)
    if files_eligible > MAX_FILES:
        logger.info(f"Limiting analysis from {files_eligible} to {MAX_FILES} most important files")
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
                    "content": content,
                    # The git blob SHA is a content hash. Carrying it here is what
                    # makes incremental analysis possible: unchanged content means
                    # last run's findings are still exactly correct.
                    "sha": file.get("sha"),
                }
        except asyncio.TimeoutError:
            logger.warning(f"⏱️ Timeout fetching {file['path']} (20s limit)")
            return None
        except Exception as e:
            logger.warning(f"Failed to fetch {file['path']}: {str(e)}")
            return None
    
    # Fetch ALL files in parallel (maximum speed!)
    # Increased from batch_size=5 to fetch all at once
    logger.info(f"⚡ Fetching {len(code_files_list)} files in parallel...")
    results = await asyncio.gather(
        *[fetch_file_content(f, idx+1, len(code_files_list)) for idx, f in enumerate(code_files_list)],
        return_exceptions=True
    )
    code_files = [r for r in results if r is not None and not isinstance(r, Exception)]

    logger.info(f"Successfully loaded {len(code_files)} code files (parallel fetch)")

    # INCREMENTAL: skip files whose content has been analysed before.
    #
    # Findings are cached by git blob SHA, so a file unchanged since any previous
    # analysis - of this repo or any other - costs nothing. A typical push
    # touches a handful of files, so re-analysis is near-free and coverage stops
    # being limited by what a single run can afford.
    files_to_analyse, reused_findings, unchanged_files = partition_files(code_files)

    if unchanged_files:
        logger.info(
            f"♻️ Incremental: {len(unchanged_files)} of {len(code_files)} files unchanged "
            f"({len(reused_findings)} findings reused, {len(files_to_analyse)} to analyse)"
        )

    files_reused = len(unchanged_files)
    code_files_full = code_files
    code_files = files_to_analyse
    
    # Fetch structure IN PARALLEL with TOON compression for maximum speed
    logger.info("Compressing files and fetching structure in parallel...")
    
    async def compress_files():
        compressed = toon_service.compress_analysis_request(code_files, {
            "language": repo.get("language"),
            "repo_name": repo["name"]
        })
        return compressed
    
    async def get_structure():
        return await asyncio.to_thread(
            github_service.get_repository_structure, 
            repo["full_name"], 
            repo["default_branch"]
        )
    
    # Run both in parallel
    compressed_toon, structure = await asyncio.gather(
        compress_files(),
        get_structure()
    )
    
    # Calculate token savings
    original_size = sum(len(f["content"]) for f in code_files)
    compressed_size = len(compressed_toon)
    savings_pct = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0
    logger.info(f"TOON compression: {original_size:,} → {compressed_size:,} chars ({savings_pct:.1f}% reduction)")
    
    all_file_paths = [f["path"] for f in files]
    
    project_context = {
        "project_structure": structure,
        "all_files": all_file_paths,
        "language": repo.get("language"),
        "repo_name": repo["name"]
    }
    
    # ── Cancellation checkpoint 3: before AI analysis (most expensive step) ──
    _check_cancelled(analysis_id)
    
    # Run analysis with TOON-compressed content
    if code_files:
        logger.info(f"Running AI analysis on {len(code_files)} changed files...")
        analysis_result = await orchestrator.analyze_repository(code_files, project_context, user_id=user_id)

        # Cache this run's findings against the content that produced them, so the
        # next analysis of any repository containing these exact files is free.
        # Files that produced nothing are cached as empty on purpose - "this
        # content is clean" is just as reusable.
        record_batch_findings(code_files, analysis_result.get("issues", []))
    else:
        # Every file was unchanged. No model call needed at all.
        logger.info("♻️ All files unchanged - reusing cached findings, no AI call")
        analysis_result = orchestrator.empty_result()

    # Merge findings recovered from the incremental cache back in, so the result
    # covers the whole sample rather than only the changed part of it.
    if reused_findings:
        analysis_result["issues"] = list(analysis_result.get("issues", [])) + reused_findings
        analysis_result = orchestrator.recalculate_totals(analysis_result)

    # Report coverage over the full sample, not just what was re-analysed.
    analysis_result["files_analyzed"] = len(code_files_full)
    analysis_result["files_reused"] = files_reused

    # Track token usage
    total_tokens = token_optimizer.count_tokens(compressed_toon)
    token_optimizer.track_usage("analysis", total_tokens, user_id)
    logger.info(f"Analysis used approximately {total_tokens:,} tokens (TOON-optimized)")
    
    # ── Cancellation checkpoint 4: before saving results ──
    _check_cancelled(analysis_id)
    
    # Save results to DB
    await repo_service.save_issues(analysis_id, analysis_result["issues"])

    from datetime import datetime
    await repo_service.update_analysis(analysis_id, {
        "status": "completed",
        "overall_score": analysis_result["overall_score"],
        "security_score": analysis_result["security_score"],
        "quality_score": analysis_result["quality_score"],
        "architecture_score": analysis_result["architecture_score"],
        "documentation_score": analysis_result["documentation_score"],
        "total_issues": analysis_result["total_issues"],
        "critical_issues": analysis_result["critical_issues"],
        "high_issues": analysis_result["high_issues"],
        "medium_issues": analysis_result["medium_issues"],
        "low_issues": analysis_result["low_issues"],
        "files_analyzed": analysis_result["files_analyzed"],
        # Sample-size disclosure: files_eligible is how many code files the
        # repository actually has, files_analyzed is how many were read, and
        # files_reused how many of those came from the per-file cache.
        "files_eligible": files_eligible,
        "files_reused": files_reused,
        "commit_sha": commit_sha,
        "completed_at": datetime.utcnow().isoformat()
    })

    await repo_service.update_repository(repo_id, user_id, {
        "last_analyzed": datetime.utcnow().isoformat()
    })

    # Invalidate history cache IMMEDIATELY so the new analysis shows in history.
    try:
        get_redis_service().delete(f"db:history:{repo_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate history cache (non-critical): {e}")

    # The analysis is complete and visible from here on. Everything below adds
    # to it, and none of it may turn a finished review into a failed one.
    await _run_followups(
        repo=repo,
        github_token=github_token,
        analysis_id=analysis_id,
        issues=analysis_result["issues"],
        analysed_paths=[f["path"] for f in code_files_full],
        orchestrator=orchestrator,
        repo_service=repo_service,
    )

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


# Each follow-up gets its own budget, so a slow GitHub call cannot hold a
# worker for long after the analysis itself is done.
_FOLLOWUP_TIMEOUT_SECONDS = 120


async def _run_followups(
    repo, github_token, analysis_id, issues, analysed_paths, orchestrator, repo_service
) -> None:
    """
    Post-analysis work, each step best-effort and awaited.

    Awaited, not fired with asyncio.create_task: under Celery the task body runs
    inside asyncio.run(), which cancels anything still pending when it returns.
    The cache-warming task launched that way never completed in a worker.
    """
    from app.services.repository_insights import mark_resolved_issues, refresh_repository_insights

    async def roadmap():
        await repo_service.save_improvement_roadmap(
            repo["id"], await orchestrator.generate_improvement_roadmap(issues)
        )

    steps = [
        ("improvement roadmap", roadmap),
        ("resolved-issue detection", lambda: mark_resolved_issues(repo["id"], analysis_id, analysed_paths)),
        ("developer insights", lambda: refresh_repository_insights(repo, github_token, analysis_id, analysed_paths)),
    ]
    for name, step in steps:
        try:
            await asyncio.wait_for(step(), timeout=_FOLLOWUP_TIMEOUT_SECONDS)
        except Exception as e:
            logger.warning(f"Post-analysis {name} failed (analysis unaffected): {type(e).__name__}: {e}")
