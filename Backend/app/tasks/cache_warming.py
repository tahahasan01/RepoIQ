"""
Cache warming tasks for pre-populating cache with frequently accessed data.
"""
from typing import List, Dict, Any
from app.services.repository_service import RepositoryService
from app.services.github_service import create_github_service
from app.services.redis_service import get_redis_service
from app.core.logging import get_logger

logger = get_logger(__name__)


async def warm_cache_on_login(user_id: str, github_token: str):
    """
    Pre-fetch and cache user's repositories on login.
    
    Args:
        user_id: User identifier
        github_token: GitHub access token
    """
    try:
        logger.info(f"🔥 Warming cache for user: {user_id}")
        
        # Pre-fetch repositories list
        github_service = create_github_service(github_token)
        repos = github_service.get_repositories(per_page=30)
        
        logger.info(f"✓ Pre-cached {len(repos)} repositories for user: {user_id}")
        return True
    except Exception as e:
        logger.error(f"Cache warming failed for user {user_id}: {e}")
        return False


async def warm_cache_on_repo_selection(
    repo_id: str,
    user_id: str,
    github_token: str
):
    """
    Pre-fetch and cache repository files and latest analysis on repo selection.
    
    Args:
        repo_id: Repository identifier
        user_id: User identifier
        github_token: GitHub access token
    """
    try:
        logger.info(f"🔥 Warming cache for repository: {repo_id}")
        
        repo_service = RepositoryService()
        github_service = create_github_service(github_token)
        
        # Pre-fetch repository data
        repo = await repo_service.get_repository(repo_id, user_id)
        if not repo:
            logger.warning(f"Repository not found: {repo_id}")
            return False
        
        # Pre-fetch file list
        try:
            files = github_service.get_repository_files(
                repo["full_name"],
                repo["default_branch"]
            )
            logger.info(f"✓ Pre-cached {len(files)} files for repo: {repo['full_name']}")
        except Exception as e:
            logger.warning(f"Failed to pre-cache files: {e}")
        
        # Pre-fetch latest analysis
        try:
            latest_analysis = await repo_service.get_latest_analysis(repo_id)
            if latest_analysis:
                # Pre-fetch issues for this analysis
                issues = await repo_service.get_issues(latest_analysis["id"])
                logger.info(f"✓ Pre-cached {len(issues)} issues for analysis: {latest_analysis['id']}")
        except Exception as e:
            logger.warning(f"Failed to pre-cache analysis: {e}")
        
        # Pre-fetch analysis history
        try:
            history = await repo_service.get_analysis_history(repo_id)
            logger.info(f"✓ Pre-cached {len(history)} analysis history records")
        except Exception as e:
            logger.warning(f"Failed to pre-cache history: {e}")
        
        logger.info(f"✓ Cache warming completed for repository: {repo['full_name']}")
        return True
    except Exception as e:
        logger.error(f"Cache warming failed for repo {repo_id}: {e}")
        return False


async def warm_cache_on_analysis_completion(
    analysis_id: str,
    repo_id: str,
    user_id: str,
    github_token: str
):
    """
    Pre-fetch and cache ALL dashboard data after analysis completes.
    This ensures Files, Dashboard, and Documentation load INSTANTLY.
    
    Args:
        analysis_id: Analysis identifier
        repo_id: Repository identifier
        user_id: User identifier
        github_token: GitHub access token
    """
    import asyncio
    
    try:
        logger.info(f"🔥 FAST cache warming after analysis: {analysis_id}")
        
        repo_service = RepositoryService()
        github_service = create_github_service(github_token)
        redis_service = get_redis_service()
        
        # Pre-fetch repository data FIRST (needed for other calls)
        repo = await repo_service.get_repository(repo_id, user_id)
        if not repo:
            logger.warning(f"Repository not found: {repo_id}")
            return False
        
        # Run ALL cache warming in parallel for maximum speed
        async def cache_issues():
            issues = await repo_service.get_issues(analysis_id)
            logger.info(f"✓ Pre-cached {len(issues)} issues")
            return issues
        
        async def cache_files():
            try:
                files = github_service.get_repository_files(
                    repo["full_name"],
                    repo["default_branch"]
                )
                # Cache files list in Redis for instant loading
                redis_service.set(f"files:list:{repo_id}", files, ttl=3600)
                logger.info(f"✓ Pre-cached {len(files)} files list")
                return files
            except Exception as e:
                logger.warning(f"Failed to cache files: {e}")
                return []
        
        async def cache_readme():
            try:
                readme_variations = ["README.md", "readme.md", "Readme.md", "README"]
                for readme_name in readme_variations:
                    try:
                        content = github_service.get_file_content(
                            repo["full_name"],
                            readme_name,
                            repo["default_branch"]
                        )
                        if content:
                            logger.info(f"✓ Pre-cached README: {readme_name}")
                            return content
                    except:
                        continue
            except Exception as e:
                logger.warning(f"Failed to cache README: {e}")
            return None
        
        async def cache_history():
            redis_service.delete(f"db:history:{repo_id}")
            history = await repo_service.get_analysis_history(repo_id)
            logger.info(f"✓ Pre-cached {len(history)} history records")
            return history
        
        async def cache_analysis():
            # Cache the analysis result itself
            analysis = await repo_service.get_analysis(analysis_id)
            if analysis:
                redis_service.set(f"analysis:result:{repo_id}", analysis, ttl=3600)
                logger.info(f"✓ Pre-cached analysis result")
            return analysis
        
        # Execute ALL in parallel
        await asyncio.gather(
            cache_issues(),
            cache_files(),
            cache_readme(),
            cache_history(),
            cache_analysis(),
            return_exceptions=True
        )
        
        logger.info(f"✓ ⚡ FAST cache warming completed for: {repo['full_name']}")
        return True
    except Exception as e:
        logger.error(f"Cache warming failed for analysis {analysis_id}: {e}")
        return False


async def warm_cache_for_top_files(
    repo_id: str,
    user_id: str,
    github_token: str,
    top_n: int = 10
):
    """
    Pre-fetch content for the most commonly accessed files.
    
    Args:
        repo_id: Repository identifier
        user_id: User identifier
        github_token: GitHub access token
        top_n: Number of top files to pre-cache
    """
    try:
        logger.info(f"🔥 Warming cache for top {top_n} files in repo: {repo_id}")
        
        repo_service = RepositoryService()
        github_service = create_github_service(github_token)
        
        repo = await repo_service.get_repository(repo_id, user_id)
        if not repo:
            return False
        
        # Get all files
        files = github_service.get_repository_files(
            repo["full_name"],
            repo["default_branch"]
        )
        
        # Sort by size (smaller files first - likely to be viewed)
        # and prioritize common important files
        important_patterns = ["readme", "main", "index", "app", "config"]
        
        def file_priority(file_info):
            path_lower = file_info["path"].lower()
            # Boost priority for important file patterns
            priority = 0
            for pattern in important_patterns:
                if pattern in path_lower:
                    priority += 100
            # Smaller files get higher priority (more likely to be viewed)
            return priority - file_info.get("size", 0)
        
        sorted_files = sorted(files, key=file_priority, reverse=True)[:top_n]
        
        # Pre-fetch content for these files
        cached_count = 0
        for file_info in sorted_files:
            try:
                await repo_service.get_file_content(
                    repo_id,
                    user_id,
                    file_info["path"],
                    github_token
                )
                cached_count += 1
            except Exception as e:
                logger.debug(f"Failed to cache file {file_info['path']}: {e}")
        
        logger.info(f"✓ Pre-cached content for {cached_count}/{top_n} files")
        return True
    except Exception as e:
        logger.error(f"Cache warming for top files failed: {e}")
        return False


# Scheduled cache refresh (can be called periodically via Celery/APScheduler)
async def refresh_active_repositories_cache():
    """
    Refresh cache for recently active repositories.
    This should be run as a scheduled task (e.g., hourly).
    """
    try:
        logger.info("🔄 Starting scheduled cache refresh for active repositories")
        
        # TODO: Implement logic to identify "active" repositories
        # (e.g., those accessed in the last 24 hours)
        # For now, this is a placeholder
        
        logger.info("✓ Scheduled cache refresh completed")
        return True
    except Exception as e:
        logger.error(f"Scheduled cache refresh failed: {e}")
        return False
