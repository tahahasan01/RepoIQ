from typing import List, Dict, Any, Optional
from datetime import datetime
import re
from app.db.supabase import get_service_db
from app.services.github_service import create_github_service
from app.services.redis_service import get_redis_service
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)


class RepositoryService:
    def __init__(self):
        self.db = get_service_db()
        self.redis = get_redis_service()

    def _is_uuid(self, value: str) -> bool:
        if not value:
            return False
        return bool(re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value))

    async def resolve_repository_id(self, repo_id: str, user_id: str) -> Optional[str]:
        """
        Accept either:
        - internal repository UUID (repositories.id)
        - GitHub numeric repo id (repositories.github_repo_id)

        Returns internal repository UUID, or None if not found.
        """
        try:
            if self._is_uuid(repo_id):
                # verify ownership
                # PERF: this runs on nearly every repo-scoped request. supabase-py
                # is synchronous, so on the event loop it blocks every other
                # in-flight request for the round trip.
                result = await run_blocking(
                    lambda: self.db.table("repositories")
                    .select("id")
                    .eq("id", repo_id)
                    .eq("user_id", user_id)
                    .single()
                    .execute()
                )
                return result.data["id"] if result.data else None

            # try github_repo_id
            try:
                gh_id = int(repo_id)
            except Exception:
                return None

            result = await run_blocking(
                lambda: self.db.table("repositories")
                .select("id")
                .eq("user_id", user_id)
                .eq("github_repo_id", gh_id)
                .single()
                .execute()
            )
            return result.data["id"] if result.data else None
        except Exception:
            return None
    
    async def sync_repositories(self, user_id: str, github_token: str) -> List[Dict[str, Any]]:
        """
        Optimized repository sync using batch operations.
        Reduces N+1 queries by batch-checking existing repos.
        """
        try:
            github_service = create_github_service(github_token)
            # PERF: PyGithub is synchronous and paginates over the network. On the
            # event loop this stalls every other in-flight request for the whole
            # sync, which for a large account is seconds.
            repos = await run_blocking(github_service.get_repositories, per_page=100)
            
            if not repos:
                return []
            
            # OPTIMIZATION: Batch fetch all existing repos for this user in ONE query
            github_repo_ids = [repo["id"] for repo in repos]
            existing_result = await run_blocking(
                lambda: self.db.table("repositories")
                .select("id, github_repo_id")
                .eq("user_id", user_id)
                .in_("github_repo_id", github_repo_ids)
                .execute()
            )
            
            # Build lookup map for O(1) access
            existing_map = {r["github_repo_id"]: r["id"] for r in (existing_result.data or [])}
            
            synced_repos = []
            to_insert = []
            to_update = []
            
            for repo in repos:
                repo_data = {
                    "user_id": user_id,
                    "github_repo_id": repo["id"],
                    "name": repo["name"],
                    "full_name": repo["full_name"],
                    "description": repo["description"],
                    "language": repo["language"],
                    "stars": repo["stars"],
                    "forks": repo["forks"],
                    "open_issues": repo["open_issues"],
                    "default_branch": repo["default_branch"],
                    "is_private": repo["private"],
                    "size": repo["size"],
                    "last_synced": datetime.utcnow().isoformat()
                }
                
                if repo["id"] in existing_map:
                    # Update existing
                    to_update.append((existing_map[repo["id"]], repo_data))
                else:
                    # Insert new
                    to_insert.append(repo_data)
            
            # PERF: one thread hop for the whole write batch, not one per row.
            # The update loop issues a sequential round trip per repository - for
            # an account with 100 repos that is 100 blocking calls, and on the
            # event loop it froze every other request for the duration.
            def _write_batch():
                written = []
                if to_insert:
                    result = self.db.table("repositories").insert(to_insert).execute()
                    written.extend(result.data or [])

                for repo_id, repo_data in to_update:
                    result = self.db.table("repositories").update(repo_data).eq("id", repo_id).execute()
                    if result.data:
                        written.append(result.data[0])
                return written

            synced_repos.extend(await run_blocking(_write_batch))

            if to_insert:
                logger.info(f"✅ Batch inserted {len(to_insert)} new repositories")
            if to_update:
                logger.info(f"✅ Updated {len(to_update)} existing repositories")

            # SECURITY: drop repositories the user can no longer see.
            #
            # Sync only ever inserted and updated, so a repository row survived
            # the user losing access to it upstream - being removed from an org,
            # a repo being deleted or made private. Ownership checks throughout
            # the app are "is there a repositories row with your user_id", so a
            # stale row kept granting access to cached file contents and analysis
            # results for a repository the user no longer has any right to.
            await self._prune_revoked_repositories(user_id, github_repo_ids)
            
            # Invalidate every cached page for this user.
            #
            # This used to enumerate pages 1-5 at per_page 30 and 6 only - so a
            # request for page 6, or any other page size, kept serving pre-sync
            # data until its own TTL expired. invalidate() is SCAN-based, so a
            # prefix sweep here is cheap and, unlike the old KEYS path, does not
            # block Redis.
            self.redis.delete(f"db:repos:{user_id}")
            self.redis.invalidate(f"db:repos:{user_id}:page:*")
            
            return synced_repos
        except Exception as e:
            logger.error(f"Repository sync failed: {str(e)}")
            raise
    
    async def _prune_revoked_repositories(
        self, user_id: str, visible_github_ids: List[int]
    ) -> int:
        """
        Remove this user's repository rows whose GitHub ids were not returned by
        the sync, i.e. repositories they can no longer see.

        Only called with a non-empty sync result. If GitHub returned nothing, that
        is far more likely to be a transient API failure than the user genuinely
        having zero repositories, and deleting everything on that basis would be
        destructive.
        """
        if not visible_github_ids:
            return 0

        try:
            def _prune():
                existing = self.db.table("repositories")\
                    .select("id, github_repo_id")\
                    .eq("user_id", user_id)\
                    .execute()

                visible = set(visible_github_ids)
                stale = [
                    row["id"] for row in (existing.data or [])
                    if row.get("github_repo_id") not in visible
                ]
                if not stale:
                    return []

                self.db.table("repositories")\
                    .delete()\
                    .eq("user_id", user_id)\
                    .in_("id", stale)\
                    .execute()
                return stale

            stale_ids = await run_blocking(_prune)

            for repo_id in stale_ids:
                self.redis.delete(f"db:repo:{repo_id}")
                self.redis.invalidate(f"file:content:{repo_id}:*")
                self.redis.delete(f"files:list:{repo_id}")
                self.redis.delete(f"db:history:{repo_id}")

            if stale_ids:
                logger.info(
                    f"🗑️ Removed {len(stale_ids)} repositories the user no longer has access to"
                )
            return len(stale_ids)
        except Exception as e:
            # Never fail a sync over pruning - the user still wants their list.
            logger.error(f"Failed to prune revoked repositories: {type(e).__name__}: {e}")
            return 0

    async def get_batch_latest_analyses(self, user_id: str) -> Dict[str, Dict[str, Any]]:
        """Fetch all latest analyses for user's repos in a single optimized query"""
        try:
            # Get all repo IDs for this user
            repos_result = (await run_blocking(self.db.table("repositories")\
                .select("id")\
                .eq("user_id", user_id)\
                .execute))
            
            if not repos_result.data:
                return {}
            
            repo_ids = [r["id"] for r in repos_result.data]
            
            # Fetch all latest completed analyses for these repos in one query
            # Using a subquery approach: get max created_at per repo, then fetch those records
            analyses_result = (await run_blocking(self.db.table("analysis_results")\
                .select("*")\
                .in_("repository_id", repo_ids)\
                .eq("status", "completed")\
                .order("created_at", desc=True)\
                .execute))
            
            # Build a map of repo_id -> latest analysis
            analysis_map: Dict[str, Dict[str, Any]] = {}
            for analysis in (analyses_result.data or []):
                repo_id = analysis["repository_id"]
                # Keep only the first (latest) analysis for each repo
                if repo_id not in analysis_map:
                    analysis_map[repo_id] = {
                        "overall_score": analysis.get("overall_score"),
                        "security_score": analysis.get("security_score"),
                        "quality_score": analysis.get("quality_score"),
                        "architecture_score": analysis.get("architecture_score"),
                        "documentation_score": analysis.get("documentation_score"),
                        "completed_at": analysis.get("completed_at"),
                        "analysis_id": analysis["id"],
                        "status": analysis["status"],
                        "total_issues": analysis.get("total_issues", 0)
                    }
            
            return analysis_map
        except Exception as e:
            logger.error(f"Batch analysis fetch failed: {str(e)}")
            return {}
    
    async def get_user_repositories(self, user_id: str, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        """
        Get repositories for a user with analysis data.
        
        OPTIMIZATIONS:
        - Redis cache for first page (most common request after login)
        - Parallel fetch of repos + analyses
        - Only fetch analyses for repos being returned (not all user repos)
        """
        import time
        
        try:
            start_time = time.time()
            offset = (page - 1) * per_page
            
            # Check Redis cache for first page (most common case after login)
            cache_key = f"db:repos:{user_id}:page:{page}:per:{per_page}"
            if page == 1:
                cached_repos = self.redis.get(cache_key)
                if cached_repos:
                    logger.info(f"⚡ INSTANT: Returning {len(cached_repos)} cached repos for user (page {page})")
                    return cached_repos
            
            # Fetch repositories
            logger.info(f"📂 Fetching repositories for user (page {page})...")
            result = (await run_blocking(self.db.table("repositories")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .limit(per_page)\
                .offset(offset)\
                .execute))
            
            repos = result.data or []
            
            if not repos:
                return []
            
            repo_time = time.time()
            logger.info(f"📂 Repo query took {(repo_time - start_time)*1000:.0f}ms, found {len(repos)} repos")
            
            # OPTIMIZATION: Only fetch analyses for the repos we're returning
            # This is faster than fetching all analyses for all user repos
            repo_ids = [repo["id"] for repo in repos]
            
            analyses_result = (await run_blocking(self.db.table("analysis_results")\
                .select("repository_id, overall_score, security_score, quality_score, architecture_score, documentation_score, completed_at, id, status, total_issues")\
                .in_("repository_id", repo_ids)\
                .eq("status", "completed")\
                .order("completed_at", desc=True)\
                .execute))
            
            # Build a map of repo_id -> latest analysis (keep first/latest for each repo)
            analysis_map: Dict[str, Dict[str, Any]] = {}
            for analysis in (analyses_result.data or []):
                repo_id = analysis["repository_id"]
                if repo_id not in analysis_map:
                    analysis_map[repo_id] = {
                        "overall_score": analysis.get("overall_score"),
                        "security_score": analysis.get("security_score"),
                        "quality_score": analysis.get("quality_score"),
                        "architecture_score": analysis.get("architecture_score"),
                        "documentation_score": analysis.get("documentation_score"),
                        "completed_at": analysis.get("completed_at"),
                        "analysis_id": analysis["id"],
                        "status": analysis["status"],
                        "total_issues": analysis.get("total_issues", 0)
                    }
            
            analysis_time = time.time()
            logger.info(f"📊 Analysis query took {(analysis_time - repo_time)*1000:.0f}ms, found {len(analysis_map)} analyses")
            
            # Attach analysis data to repos
            for repo in repos:
                if repo["id"] in analysis_map:
                    analysis = analysis_map[repo["id"]]
                    repo["lastScan"] = analysis.get("completed_at")
                    repo["score"] = analysis.get("overall_score")
                    repo["security_score"] = analysis.get("security_score")
                    repo["quality_score"] = analysis.get("quality_score")
                    repo["architecture_score"] = analysis.get("architecture_score")
                    repo["total_issues"] = analysis.get("total_issues", 0)
                else:
                    repo["lastScan"] = None
                    repo["score"] = None

            # Cache first page for 5 minutes (updated on sync or new analysis)
            if page == 1:
                self.redis.set(cache_key, repos, ttl=300)
                logger.info(f"💾 Cached first page of repos for user")
            
            total_time = time.time()
            logger.info(f"✅ get_user_repositories total: {(total_time - start_time)*1000:.0f}ms")
            
            return repos
        except Exception as e:
            logger.error(f"Get repositories failed: {str(e)}")
            raise
    
    async def get_repository(self, repo_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            resolved_id = await self.resolve_repository_id(repo_id, user_id)
            if not resolved_id:
                return None
            
            # Check Redis cache for repository data (10 min TTL)
            cache_key = f"db:repo:{resolved_id}"
            cached_repo = self.redis.get(cache_key)
            if cached_repo:
                logger.debug(f"✓ Redis cache hit for repository: {resolved_id}")
                return cached_repo

            logger.debug(f"⚡ Fetching repository from DB: {resolved_id}")
            result = await run_blocking(
                lambda: self.db.table("repositories")
                .select("*")
                .eq("id", resolved_id)
                .eq("user_id", user_id)
                .single()
                .execute()
            )
            
            if result.data:
                # Cache for 10 minutes
                self.redis.set(cache_key, result.data, ttl=600)
            
            return result.data
        except Exception as e:
            logger.error(f"Get repository failed: {str(e)}")
            return None
    
    async def update_repository(self, repo_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            logger.info(f"📝 Updating repository {repo_id} with data: {list(data.keys())}")
            result = (await run_blocking(self.db.table("repositories")\
                .update(data)\
                .eq("id", repo_id)\
                .eq("user_id", user_id)\
                .execute))
            
            # Invalidate cache for this repository
            self.redis.delete(f"db:repo:{repo_id}")
            logger.info(f"✅ Repository updated successfully, invalidated cache")
            
            if result.data:
                logger.info(f"   Updated fields: {list(data.keys())}")
                if 'last_analyzed' in data:
                    logger.info(f"   Last analyzed set to: {data['last_analyzed']}")
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"❌ Update repository failed: {str(e)}")
            raise
    
    async def get_repository_files(self, repo_id: str, user_id: str, github_token: str) -> List[Dict[str, Any]]:
        try:
            logger.info(f"📂 get_repository_files called for repo {repo_id}")
            
            # Check Redis cache FIRST for instant loading
            cache_key = f"files:list:{repo_id}"
            cached_files = self.redis.get(cache_key)
            if cached_files:
                logger.info(f"⚡ INSTANT: Returning {len(cached_files)} cached files for repo {repo_id}")
                return cached_files
            
            repo = await self.get_repository(repo_id, user_id)
            if not repo:
                raise Exception("Repository not found")
            
            logger.info(f"🔍 Fetching files from GitHub: {repo['full_name']}")
            github_service = create_github_service(github_token)
            files = await run_blocking(
                github_service.get_repository_files,
                repo["full_name"],
                repo["default_branch"],
            )
            
            # Cache the files for 1 hour
            if files:
                self.redis.set(cache_key, files, ttl=3600)
            
            logger.info(f"✅ Fetched {len(files) if files else 0} files from GitHub")
            return files
        except Exception as e:
            logger.error(f"❌ Get repository files failed: {str(e)}")
            raise
    
    async def get_file_content(self, repo_id: str, user_id: str, file_path: str, github_token: str) -> str:
        try:
            repo = await self.get_repository(repo_id, user_id)
            if not repo:
                raise Exception("Repository not found")
            
            # Normalize file path
            normalized_path = file_path.strip().lstrip('/')
            
            # Check Redis cache first (30 minute TTL for better performance)
            cache_key = f"file:content:{repo_id}:{normalized_path}"
            cached_content = self.redis.get(cache_key)
            if cached_content:
                logger.debug(f"✓ Redis cache hit for file: {normalized_path}")
                return cached_content
            
            # Cache miss - fetch from GitHub
            logger.debug(f"⚡ Fetching file from GitHub: {normalized_path}")
            github_service = create_github_service(github_token)
            content = await run_blocking(
                github_service.get_file_content,
                repo["full_name"],
                normalized_path,
                repo["default_branch"],
            )
            
            # Cache in Redis for 30 minutes (shared across all workers)
            self.redis.set(cache_key, content, ttl=1800)
            logger.debug(f"✓ Cached file in Redis: {normalized_path}")
            
            return content
        except Exception as e:
            logger.error(f"Get file content failed: {str(e)}")
            raise
    
    async def create_analysis(self, repo_id: str) -> str:
        try:
            analysis_data = {
                "repository_id": repo_id,
                "status": "pending",
                "started_at": datetime.utcnow().isoformat()
            }
            
            result = (await run_blocking(self.db.table("analysis_results").insert(analysis_data).execute))
            
            return result.data[0]["id"]
        except Exception as e:
            logger.error(f"Create analysis failed: {str(e)}")
            raise
    
    async def update_analysis(self, analysis_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = (await run_blocking(self.db.table("analysis_results")\
                .update(data)\
                .eq("id", analysis_id)\
                .execute))
            
            # If analysis completed, invalidate history cache for this repository
            if result.data and data.get("status") == "completed":
                repo_id = result.data[0].get("repository_id")
                if repo_id:
                    self.redis.delete(f"db:history:{repo_id}")
                    logger.debug(f"✓ Invalidated cache for analysis history: {repo_id}")
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Update analysis failed: {str(e)}")
            raise
    
    async def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = (await run_blocking(self.db.table("analysis_results")\
                .select("*")\
                .eq("id", analysis_id)\
                .single()\
                .execute))
            
            return result.data
        except Exception as e:
            logger.error(f"Get analysis failed: {str(e)}")
            return None
    
    async def get_latest_analysis(self, repo_id: str) -> Optional[Dict[str, Any]]:
        try:
            # CRITICAL: Only return COMPLETED analyses, ordered by completion time (not creation time!)
            # PERF: polled by the dashboard while an analysis runs, so this is one
            # of the highest-frequency queries in the app.
            result = await run_blocking(
                lambda: self.db.table("analysis_results")
                .select("*")
                .eq("repository_id", repo_id)
                .eq("status", "completed")
                .order("completed_at", desc=True)
                .limit(1)
                .execute()
            )
            
            logger.info(f"[get_latest_analysis] repo_id={repo_id}, found={len(result.data) if result.data else 0} COMPLETED results")
            if result.data:
                analysis = result.data[0]
                logger.info(f"[get_latest_analysis] ✅ Latest COMPLETED analysis: id={analysis.get('id')}, completed_at={analysis.get('completed_at')}, status={analysis.get('status')}, total_issues={analysis.get('total_issues', 0)}")
                logger.info(f"[get_latest_analysis]    Scores: overall={analysis.get('overall_score')}, security={analysis.get('security_score')}, quality={analysis.get('quality_score')}")
            else:
                logger.warning(f"[get_latest_analysis] ⚠️ No COMPLETED analysis found for repo {repo_id}")
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"❌ Get latest analysis failed: {str(e)}")
            logger.exception("Full traceback:")
            return None
    
    async def get_analysis_history(self, repo_id: str, skip_cache: bool = False) -> List[Dict[str, Any]]:
        try:
            cache_key = f"db:history:{repo_id}"
            
            # Check Redis cache for analysis history (5 min TTL - updated when new analysis completes)
            if not skip_cache:
                cached_history = self.redis.get(cache_key)
                if cached_history:
                    logger.debug(f"✓ Redis cache hit for analysis history: {repo_id}, count={len(cached_history)}")
                    return cached_history
            else:
                # Invalidate cache if skip_cache is True
                self.redis.delete(cache_key)
                logger.debug(f"🗑️ Invalidated history cache for: {repo_id}")
            
            logger.info(f"⚡ Fetching analysis history from DB: {repo_id}")
            result = (await run_blocking(self.db.table("analysis_results")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .eq("status", "completed")\
                .order("completed_at", desc=True)\
                .limit(20)\
                .execute))
            
            history_count = len(result.data) if result.data else 0
            logger.info(f"📊 Found {history_count} completed analyses for repo {repo_id}")
            
            if result.data:
                # Cache for 5 minutes
                self.redis.set(cache_key, result.data, ttl=300)
            
            return result.data or []
        except Exception as e:
            logger.error(f"Get analysis history failed: {str(e)}")
            raise
    
    async def save_issues(self, analysis_id: str, issues: List[Dict[str, Any]]) -> bool:
        try:
            logger.info(f"💾 Saving {len(issues)} issues for analysis {analysis_id}")
            
            if not issues:
                logger.warning(f"⚠️ No issues to save for analysis {analysis_id}")
                return True
            
            # Database schema constraint: agent_type can only be 'security', 'quality', 'architecture', 'documentation'
            ALLOWED_AGENT_TYPES = {'security', 'quality', 'architecture', 'documentation'}
            AGENT_TYPE_MAPPING = {
                'best_practices': 'quality',  # Map best practices to quality (closest match)
                'performance': 'quality',
                'testing': 'quality',
                'unknown': 'quality'
            }
            
            issue_records = []
            for idx, issue in enumerate(issues):
                # Determine agent_type based on category if not provided
                agent_type = issue.get("agent_type")
                if not agent_type:
                    category = issue.get("category", "").lower()
                    if "security" in category or "vulnerability" in category or "injection" in category:
                        agent_type = "security"
                    elif "architecture" in category or "design" in category:
                        agent_type = "architecture"
                    elif "document" in category or "comment" in category:
                        agent_type = "documentation"
                    elif "best_practice" in category or "rate_limit" in category or "cache" in category or "debounce" in category:
                        agent_type = "quality"  # Best practices are quality issues
                    else:
                        agent_type = "quality"  # Default to quality
                
                # Map to allowed database values
                if agent_type not in ALLOWED_AGENT_TYPES:
                    original_type = agent_type
                    agent_type = AGENT_TYPE_MAPPING.get(agent_type, 'quality')
                    logger.debug(f"Mapped agent_type '{original_type}' → '{agent_type}' for database constraint")
                
                issue_data = {
                    "analysis_id": analysis_id,
                    "agent_type": agent_type,
                    "severity": issue.get("severity", "low"),
                    "category": issue.get("category", "Other"),
                    "file_path": issue.get("file_path", ""),
                    "line_number": issue.get("line_number", 1),
                    "description": issue.get("description", "No description provided"),
                    "suggestion": issue.get("suggestion", ""),
                    "auto_fixable": issue.get("auto_fixable", False)
                }
                issue_records.append(issue_data)
                
                # Log first 3 issues for debugging
                if idx < 3:
                    logger.info(f"  Issue {idx+1}: [{issue_data['severity']}] {issue_data['category']} ({agent_type}) in {issue_data['file_path']}")
            
            if issue_records:
                logger.info(f"📝 Inserting {len(issue_records)} issues into database...")
                result = (await run_blocking(self.db.table("issues").insert(issue_records).execute))
                logger.info(f"✅ Successfully saved {len(issue_records)} issues to database")
                logger.info(f"   Database insert result: {len(result.data) if result.data else 0} rows inserted")
            
            return True
        except Exception as e:
            logger.error(f"❌ Save issues failed: {str(e)}")
            logger.exception("Full traceback:")
            return False
    
    async def get_issues(
        self, 
        analysis_id: str, 
        page: int = 1, 
        per_page: int = 100,
        severity: Optional[str] = None,
        agent_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get issues for an analysis with optional pagination and filtering.
        
        Args:
            analysis_id: Analysis ID to fetch issues for
            page: Page number (1-indexed)
            per_page: Items per page (max 500)
            severity: Optional filter by severity (critical, high, medium, low)
            agent_type: Optional filter by agent type
        """
        try:
            # Limit per_page to prevent excessive data transfer
            per_page = min(per_page, 500)
            
            # Build cache key with filters
            cache_key = f"db:issues:{analysis_id}"
            if page == 1 and per_page >= 100 and not severity and not agent_type:
                # Only use cache for unfiltered, first page requests
                cached_issues = self.redis.get(cache_key)
                if cached_issues:
                    logger.debug(f"✓ Redis cache hit for issues: {analysis_id}")
                    return cached_issues
            
            logger.debug(f"⚡ Fetching issues from DB: {analysis_id}")
            
            # Build query with filters
            query = self.db.table("issues").select("*").eq("analysis_id", analysis_id)
            
            # Apply optional filters
            if severity:
                query = query.eq("severity", severity)
            if agent_type:
                query = query.eq("agent_type", agent_type)
            
            # Order by severity (critical first) using database ordering
            # This leverages the idx_issues_analysis_severity index
            query = query.order("severity", desc=False)  # critical comes first alphabetically
            
            # Apply pagination
            offset = (page - 1) * per_page
            query = query.limit(per_page).offset(offset)
            
            result = await run_blocking(query.execute)
            
            issues = result.data or []
            logger.info(f"[get_issues] Found {len(issues)} issues for analysis {analysis_id} (page {page})")
            
            # Sort by severity in Python for correct order
            severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
            issues.sort(key=lambda x: severity_order.get(x.get('severity', 'low'), 4))
            
            # Cache full first page for 60 minutes (immutable data)
            if page == 1 and per_page >= 100 and not severity and not agent_type and issues:
                self.redis.set(cache_key, issues, ttl=3600)
            
            return issues
        except Exception as e:
            logger.error(f"Get issues failed: {str(e)}")
            raise
    
    async def get_issues_count(self, analysis_id: str) -> Dict[str, int]:
        """Get issue counts by severity for an analysis."""
        try:
            cache_key = f"db:issues_count:{analysis_id}"
            cached_count = self.redis.get(cache_key)
            if cached_count:
                return cached_count
            
            result = (await run_blocking(self.db.table("issues")\
                .select("severity")\
                .eq("analysis_id", analysis_id)\
                .execute))
            
            counts = {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
            for issue in (result.data or []):
                severity = issue.get('severity', 'low')
                counts[severity] = counts.get(severity, 0) + 1
                counts['total'] += 1
            
            # Cache for 60 minutes
            self.redis.set(cache_key, counts, ttl=3600)
            return counts
        except Exception as e:
            logger.error(f"Get issues count failed: {str(e)}")
            return {'total': 0, 'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
    
    async def save_improvement_roadmap(self, repo_id: str, roadmap: Dict[str, Any]) -> bool:
        try:
            roadmap_data = {
                "repository_id": repo_id,
                "priority_order": roadmap.get("priority_order", []),
                "quick_wins": roadmap.get("quick_wins", []),
                "medium_term": roadmap.get("medium_term", []),
                "long_term": roadmap.get("long_term", []),
                "estimated_impact": roadmap.get("estimated_impact", {})
            }
            
            (await run_blocking(self.db.table("improvement_roadmaps").insert(roadmap_data).execute))
            
            return True
        except Exception as e:
            logger.error(f"Save roadmap failed: {str(e)}")
            return False
    
    async def get_improvement_roadmap(self, repo_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = (await run_blocking(self.db.table("improvement_roadmaps")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute))
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Get roadmap failed: {str(e)}")
            return None
