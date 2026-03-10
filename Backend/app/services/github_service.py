from github import Github, GithubException
from typing import List, Dict, Any, Optional
from app.core.logging import get_logger
from app.core.config import get_settings
from app.services.redis_service import get_redis_service
import base64
import httpx
import asyncio
import time
from functools import wraps

settings = get_settings()
logger = get_logger(__name__)


def retry_with_backoff(max_retries: int = 3, base_delay: float = 1.0):
    """Decorator for exponential backoff retry on transient failures."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except GithubException as e:
                    # Retry on rate limit (403), server errors (5xx), or timeouts
                    if e.status in [403, 429, 500, 502, 503, 504]:
                        last_exception = e
                        delay = base_delay * (2 ** attempt)
                        logger.warning(f"Retry {attempt + 1}/{max_retries} after {delay}s due to: {e.status}")
                        time.sleep(delay)
                    else:
                        raise
                except (httpx.TimeoutException, httpx.ConnectError) as e:
                    last_exception = e
                    delay = base_delay * (2 ** attempt)
                    logger.warning(f"Retry {attempt + 1}/{max_retries} after {delay}s due to: {type(e).__name__}")
                    time.sleep(delay)
            raise last_exception
        return wrapper
    return decorator


class GitHubService:
    def __init__(self, access_token: str):
        self.client = Github(access_token, per_page=100)  # Optimize pagination
        self.access_token = access_token
        self.user = None
        self.redis = get_redis_service()
        self._rate_limit_remaining = None
        self._rate_limit_reset = None
    
    def _check_rate_limit(self) -> bool:
        """Check GitHub API rate limit - NON-BLOCKING (no sleep)."""
        try:
            # Use cached rate limit if recent (< 60 seconds old)
            if self._rate_limit_remaining is not None and self._rate_limit_reset:
                time_since_check = time.time() - (self._rate_limit_reset - 3600)  # Approximate last check
                if time_since_check < 60 and self._rate_limit_remaining > 10:
                    return True  # Use cached value, skip API call
            
            rate_limit = self.client.get_rate_limit()
            self._rate_limit_remaining = rate_limit.core.remaining
            self._rate_limit_reset = rate_limit.core.reset.timestamp()
            
            if self._rate_limit_remaining < 10:
                wait_time = max(0, self._rate_limit_reset - time.time())
                # NEVER block - just warn and continue or fail fast
                if wait_time >= 60:
                    logger.error(f"❌ Rate limit exhausted ({self._rate_limit_remaining}), reset in {wait_time:.0f}s")
                    return False  # Fail fast instead of blocking
                else:
                    logger.warning(f"⚠️ Rate limit low ({self._rate_limit_remaining}), continuing anyway")
            return True
        except Exception as e:
            logger.warning(f"Failed to check rate limit: {e}")
            return True  # Continue anyway
    
    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def get_user_info(self) -> Dict[str, Any]:
        if not self.user:
            self.user = self.client.get_user()
        
        # Check Redis cache for user info (60 min TTL)
        cache_key = f"github:user:{self.user.login}"
        cached_user = self.redis.get(cache_key)
        if cached_user:
            logger.debug(f"✓ Redis cache hit for user: {self.user.login}")
            return cached_user
        
        # Build user info
        user_info = {
            "username": self.user.login,
            "name": self.user.name,
            "email": self.user.email,
            "avatar_url": self.user.avatar_url,
            "bio": self.user.bio,
            "public_repos": self.user.public_repos
        }
        
        # Cache for 60 minutes
        self.redis.set(cache_key, user_info, ttl=3600)
        return user_info
    
    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def get_repositories(self, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        if not self.user:
            self.user = self.client.get_user()
        
        # Check Redis cache for repositories list (10 min TTL - balanced freshness)
        cache_key = f"github:repos:{self.user.login}:{page}:{per_page}"
        cached_repos = self.redis.get(cache_key)
        if cached_repos:
            logger.debug(f"✓ Redis cache hit for repositories: {self.user.login}")
            return cached_repos
        
        # Check rate limit before making API calls
        if not self._check_rate_limit():
            raise GithubException(403, {"message": "Rate limit exceeded"}, None)
        
        repos = []
        try:
            logger.debug(f"⚡ Fetching repositories from GitHub for: {self.user.login}")
            # Use pagination efficiently - get only what we need
            paginated_repos = self.user.get_repos(sort="updated", direction="desc")
            
            # Iterate with early exit
            for repo in paginated_repos:
                repos.append(self._format_repository(repo))
                if len(repos) >= per_page:
                    break
            
            # Cache for 10 minutes (balanced between freshness and performance)
            self.redis.set(cache_key, repos, ttl=600)
            logger.info(f"✅ Fetched {len(repos)} repositories for {self.user.login}")
            return repos
        except GithubException as e:
            logger.error(f"Failed to fetch repositories: {str(e)}")
            raise
    
    def get_repository(self, repo_id: int) -> Dict[str, Any]:
        try:
            repo = self.client.get_repo(repo_id)
            return self._format_repository(repo)
        except GithubException as e:
            logger.error(f"Failed to fetch repository {repo_id}: {str(e)}")
            raise
    
    def get_repository_by_name(self, full_name: str) -> Dict[str, Any]:
        try:
            repo = self.client.get_repo(full_name)
            return self._format_repository(repo)
        except GithubException as e:
            logger.error(f"Failed to fetch repository {full_name}: {str(e)}")
            raise
    
    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def get_repository_files(self, full_name: str, branch: str = "main", path: str = "") -> List[Dict[str, Any]]:
        """
        Get all files in a repository using the Git Trees API for optimal performance.
        This makes a SINGLE API call to get all files instead of recursive calls.
        """
        # Check Redis cache for file list (60 min TTL - rarely changes)
        cache_key = f"github:files:{full_name}:{branch}"
        cached_files = self.redis.get(cache_key)
        if cached_files:
            logger.debug(f"✓ Redis cache hit for files: {full_name}")
            return cached_files
        
        # Check rate limit
        if not self._check_rate_limit():
            raise GithubException(403, {"message": "Rate limit exceeded"}, None)
        
        try:
            repo = self.client.get_repo(full_name)
            
            # Use Git Trees API with recursive=True for SINGLE API call
            # This is MUCH faster than recursive get_contents calls
            try:
                tree = repo.get_git_tree(branch, recursive=True)
            except GithubException:
                # Fallback to master branch
                try:
                    tree = repo.get_git_tree("master", recursive=True)
                except GithubException as e:
                    logger.error(f"Failed to get tree for {full_name}: {e}")
                    # Fallback to old method if Trees API fails
                    return self._get_files_recursive(full_name, branch, path)
            
            files = []
            for item in tree.tree:
                # Only include files (blobs), not directories (trees)
                if item.type == "blob" and self._is_code_file(item.path):
                    files.append({
                        "path": item.path,
                        "name": item.path.split("/")[-1],
                        "size": item.size or 0,
                        "sha": item.sha,
                        "type": "file"
                    })
            
            # Cache for 60 minutes (files rarely change)
            logger.info(f"✅ Trees API: Fetched {len(files)} files from {full_name} in single call")
            self.redis.set(cache_key, files, ttl=3600)
            
            return files
        except GithubException as e:
            logger.error(f"Failed to fetch repository files: {str(e)}")
            raise
    
    def _get_files_recursive(self, full_name: str, branch: str = "main", path: str = "") -> List[Dict[str, Any]]:
        """Fallback recursive method for fetching files (slower, for compatibility)."""
        try:
            repo = self.client.get_repo(full_name)
            
            try:
                contents = repo.get_contents(path, ref=branch)
            except:
                contents = repo.get_contents(path, ref="master")
            
            files = []
            if not isinstance(contents, list):
                contents = [contents]
            
            for content in contents:
                if content.type == "dir":
                    files.extend(self._get_files_recursive(full_name, branch, content.path))
                else:
                    if self._is_code_file(content.path):
                        files.append({
                            "path": content.path,
                            "name": content.name,
                            "size": content.size,
                            "sha": content.sha,
                            "type": content.type
                        })
            
            return files
        except GithubException as e:
            logger.error(f"Recursive file fetch failed: {str(e)}")
            raise
    
    @retry_with_backoff(max_retries=3, base_delay=0.5)
    def get_file_content(self, full_name: str, file_path: str, branch: str = "main") -> str:
        logger.info(f"📖 Fetching file content: repo={full_name}, file={file_path}, branch={branch}")
        
        # Check Redis cache for file content (30 min TTL)
        cache_key = f"github:content:{full_name}:{branch}:{file_path}"
        cached_content = self.redis.get(cache_key)
        if cached_content:
            logger.debug(f"✓ Redis cache hit for file: {file_path}")
            return cached_content
        
        # Try raw URL first for faster access (bypasses GitHub API rate limits and overhead)
        raw_url = f"https://raw.githubusercontent.com/{full_name}/{branch}/{file_path}"
        
        try:
            response = httpx.get(raw_url, timeout=5.0, follow_redirects=True)
            if response.status_code == 200:
                logger.debug(f"Successfully fetched {file_path} from raw URL (branch: {branch})")
                content = response.text
                # Cache for 30 minutes
                self.redis.set(cache_key, content, ttl=1800)
                return content
            elif response.status_code == 404:
                logger.debug(f"File {file_path} not found on branch {branch} (raw URL)")
        except httpx.HTTPError as e:
            logger.debug(f"Raw URL HTTP error for {file_path}: {str(e)}")
        except Exception as e:
            logger.debug(f"Raw URL fetch failed for {file_path}: {str(e)}")
        
        # Fallback to GitHub API method
        try:
            repo = self.client.get_repo(full_name)
            
            # Try the specified branch first
            try:
                file_content = repo.get_contents(file_path, ref=branch)
                logger.debug(f"Successfully fetched {file_path} from GitHub API (branch: {branch})")
            except GithubException as e:
                if e.status == 404:
                    logger.debug(f"File {file_path} not found on branch {branch}, trying master")
                    # Try master branch if main fails
                    try:
                        file_content = repo.get_contents(file_path, ref="master")
                        logger.debug(f"Successfully fetched {file_path} from GitHub API (branch: master)")
                    except GithubException as master_error:
                        if master_error.status == 404:
                            logger.debug(f"File {file_path} not found on master branch either")
                            # Try raw URL with master branch as last resort
                            raw_url_master = f"https://raw.githubusercontent.com/{full_name}/master/{file_path}"
                            try:
                                response = httpx.get(raw_url_master, timeout=5.0, follow_redirects=True)
                                if response.status_code == 200:
                                    logger.debug(f"Successfully fetched {file_path} from raw URL (branch: master)")
                                    content = response.text
                                    # Cache for 30 minutes
                                    self.redis.set(cache_key, content, ttl=1800)
                                    return content
                            except Exception:
                                pass
                            # File truly doesn't exist - raise 404 error
                            logger.warning(f"❌ File not found after all attempts: {file_path} in repo {full_name}")
                            raise GithubException(404, {"message": f"File not found: {file_path}"}, None)
                        else:
                            raise master_error
                else:
                    raise e
            
            logger.info(f"✅ Successfully fetched {file_path} from {full_name}")
            
            # Decode the content
            if file_content.encoding == "base64":
                content = base64.b64decode(file_content.content).decode('utf-8')
            else:
                content = file_content.decoded_content.decode('utf-8')
            
            # Cache for 30 minutes
            self.redis.set(cache_key, content, ttl=1800)
            return content
                
        except GithubException as e:
            # Preserve GitHub exception with proper status code for upstream handling
            logger.debug(f"GitHub API error for {file_path}: status={e.status}, message={str(e)}")
            raise
        except UnicodeDecodeError:
            logger.warning(f"File {file_path} is not UTF-8 encoded")
            return ""
    
    def get_repository_structure(self, full_name: str, branch: str = "main") -> Dict[str, Any]:
        try:
            repo = self.client.get_repo(full_name)
            
            try:
                tree = repo.get_git_tree(branch, recursive=True)
            except:
                tree = repo.get_git_tree("master", recursive=True)
            
            structure = {}
            
            for item in tree.tree:
                if item.type == "tree":
                    continue
                
                path_parts = item.path.split("/")
                current = structure
                
                for part in path_parts[:-1]:
                    if part not in current:
                        current[part] = {}
                    current = current[part]
                
                current[path_parts[-1]] = item.path
            
            return structure
        except GithubException as e:
            logger.error(f"Failed to fetch repository structure: {str(e)}")
            raise
    
    def create_pull_request(self, repo_full_name: str, title: str, body: str, head: str, base: str = "main") -> Dict[str, Any]:
        try:
            repo = self.client.get_repo(repo_full_name)
            pr = repo.create_pull(title=title, body=body, head=head, base=base)
            
            return {
                "number": pr.number,
                "title": pr.title,
                "url": pr.html_url,
                "state": pr.state
            }
        except GithubException as e:
            logger.error(f"Failed to create pull request: {str(e)}")
            raise
    
    def create_branch(self, repo_full_name: str, branch_name: str, from_branch: str = "main") -> bool:
        try:
            repo = self.client.get_repo(repo_full_name)
            
            try:
                source = repo.get_branch(from_branch)
            except:
                source = repo.get_branch("master")
            
            repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=source.commit.sha)
            return True
        except GithubException as e:
            logger.error(f"Failed to create branch: {str(e)}")
            return False
    
    def update_file(self, repo_full_name: str, file_path: str, content: str, message: str, branch: str = "main") -> bool:
        try:
            repo = self.client.get_repo(repo_full_name)
            
            try:
                file = repo.get_contents(file_path, ref=branch)
                repo.update_file(file.path, message, content, file.sha, branch=branch)
            except:
                repo.create_file(file_path, message, content, branch=branch)
            
            return True
        except GithubException as e:
            logger.error(f"Failed to update file: {str(e)}")
            return False
    
    def _format_repository(self, repo: Any) -> Dict[str, Any]:
        return {
            "id": repo.id,
            "name": repo.name,
            "full_name": repo.full_name,
            "private": repo.private,
            "description": repo.description,
            "url": repo.html_url,
            "language": repo.language,
            "stars": repo.stargazers_count,
            "forks": repo.forks_count,
            "open_issues": repo.open_issues_count,
            "default_branch": repo.default_branch,
            "created_at": repo.created_at,
            "updated_at": repo.updated_at,
            "size": repo.size
        }
    
    def _is_code_file(self, file_path: str) -> bool:
        code_extensions = [
            ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php",
            ".c", ".cpp", ".cs", ".swift", ".kt", ".rs", ".scala", ".r",
            ".sql", ".sh", ".bash", ".yaml", ".yml", ".json", ".xml", ".html", ".css"
        ]
        
        return any(file_path.endswith(ext) for ext in code_extensions)


    def search_data_science_profiles(
        self,
        limit: int = 10,
        sort_by: str = "stars",
    ) -> List[Dict[str, Any]]:
        """
        Search GitHub for top profiles (users/organizations) that have
        data-science related repositories.

        Queries the GitHub Search API for repos with popular data science
        topics, then aggregates results by owner and returns the top
        profiles sorted by ``sort_by`` (stars | followers | repos).

        Results are cached in Redis for 30 minutes to stay within rate limits.
        """

        DATA_SCIENCE_TOPICS = [
            "data-science",
            "machine-learning",
            "deep-learning",
            "scikit-learn",
            "tensorflow",
            "pytorch",
            "pandas",
            "numpy",
            "jupyter-notebook",
            "data-analysis",
            "neural-network",
            "nlp",
            "computer-vision",
            "data-visualization",
        ]

        cache_key = f"github:ds_profiles:{limit}:{sort_by}"
        cached = self.redis.get(cache_key)
        if cached:
            logger.debug("✓ Redis cache hit for data science profiles")
            return cached

        if not self._check_rate_limit():
            raise GithubException(403, {"message": "Rate limit exceeded"}, None)

        # Aggregate repos per owner
        owners: Dict[str, Dict[str, Any]] = {}

        query = " OR ".join(f"topic:{t}" for t in DATA_SCIENCE_TOPICS)
        query += " sort:stars-desc"

        try:
            results = self.client.search_repositories(query, sort="stars", order="desc")

            collected = 0
            for repo in results:
                if collected >= limit * 10:  # Gather more to aggregate meaningfully
                    break

                owner_login = repo.owner.login
                if owner_login not in owners:
                    owners[owner_login] = {
                        "username": owner_login,
                        "name": repo.owner.name or owner_login,
                        "avatar_url": repo.owner.avatar_url,
                        "profile_url": repo.owner.html_url,
                        "type": repo.owner.type,  # "User" or "Organization"
                        "total_stars": 0,
                        "total_forks": 0,
                        "repo_count": 0,
                        "languages": set(),
                        "top_repos": [],
                    }

                owner_data = owners[owner_login]
                owner_data["total_stars"] += repo.stargazers_count
                owner_data["total_forks"] += repo.forks_count
                owner_data["repo_count"] += 1
                if repo.language:
                    owner_data["languages"].add(repo.language)

                owner_data["top_repos"].append({
                    "name": repo.name,
                    "full_name": repo.full_name,
                    "description": repo.description,
                    "url": repo.html_url,
                    "stars": repo.stargazers_count,
                    "forks": repo.forks_count,
                    "language": repo.language,
                    "topics": repo.get_topics()[:5],
                })

                collected += 1

        except GithubException as e:
            logger.error(f"GitHub search failed: {e}")
            raise

        # Fetch follower counts for User-type owners
        for login, data in owners.items():
            if data["type"] == "User":
                try:
                    user = self.client.get_user(login)
                    data["followers"] = user.followers
                    data["bio"] = user.bio
                except Exception:
                    data["followers"] = 0
                    data["bio"] = None
            else:
                data["followers"] = 0
                data["bio"] = None

        # Sort profiles
        def sort_key(item: Dict[str, Any]) -> int:
            if sort_by == "followers":
                return item["followers"]
            if sort_by == "repos":
                return item["repo_count"]
            return item["total_stars"]  # default: stars

        sorted_profiles = sorted(owners.values(), key=sort_key, reverse=True)[:limit]

        # Convert sets to lists for JSON serialization
        for profile in sorted_profiles:
            profile["languages"] = list(profile["languages"])
            # Keep only the top-3 repos per profile
            profile["top_repos"] = sorted(
                profile["top_repos"], key=lambda r: r["stars"], reverse=True
            )[:3]

        self.redis.set(cache_key, sorted_profiles, ttl=1800)
        logger.info(f"✅ Returning {len(sorted_profiles)} data science profiles")
        return sorted_profiles


def create_github_service(access_token: str) -> GitHubService:
    return GitHubService(access_token)
