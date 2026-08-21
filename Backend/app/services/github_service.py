from github import Github, GithubException
from typing import List, Dict, Any, Optional
from app.core.logging import get_logger
from app.core.config import get_settings
from app.services.redis_service import get_redis_service
import base64
import httpx
import time
from functools import wraps

settings = get_settings()
logger = get_logger(__name__)


def _is_empty_repository(exc: GithubException) -> bool:
    """
    Whether this error means "the repository has no commits yet".

    GitHub reports it as 409 from the trees API and 404 from the contents API,
    both with a message saying the repository is empty. It is a perfectly normal
    state for a repo a user owns and clicks Analyze on, so it must produce an
    empty result rather than an exception.
    """
    if exc.status not in (404, 409):
        return False
    data = getattr(exc, "data", None)
    message = str(data.get("message", "")) if isinstance(data, dict) else str(exc)
    return "empty" in message.lower()


def _is_permission_error(exc: GithubException) -> bool:
    """
    Distinguish a permanent 403 from a rate-limit 403.

    GitHub uses 403 for both. A rate limit says "rate limit exceeded" or carries
    a retry-after; a permission denial says "Resource not accessible by
    integration" or "Forbidden". Only the former is worth retrying.
    """
    message = ""
    data = getattr(exc, "data", None)
    if isinstance(data, dict):
        message = str(data.get("message", ""))
    message = (message or str(exc)).lower()

    if "rate limit" in message or "abuse" in message or "secondary rate" in message:
        return False
    return "not accessible" in message or "forbidden" in message or "permission" in message


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
                    # GitHub returns 403 for BOTH rate limiting and permission
                    # denial. Retrying a permission error is pointless - it will
                    # never start working - and costs 7 seconds of backoff before
                    # surfacing the real problem. Observed live: an installation
                    # token calling GET /user retried three times before failing.
                    if e.status == 403 and _is_permission_error(e):
                        logger.error(f"Permission denied by GitHub, not retrying: {e.data}")
                        raise

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
    
    def _is_installation_token(self) -> bool:
        """
        Whether this service holds a GitHub App installation token.

        Installation tokens use the documented `ghs_` prefix. They are NOT user
        tokens: GET /user returns 403 "Resource not accessible by integration",
        so any code path that starts from `client.get_user()` fails outright.
        """
        return bool(self.access_token) and self.access_token.startswith("ghs_")

    def _get_installation_repositories(self, per_page: int = 30) -> List[Dict[str, Any]]:
        """
        Repositories this installation was granted, via /installation/repositories.

        A GitHub App only ever sees the repositories the user selected at install
        time, so there is no "all repos for this user" to enumerate - the
        installation itself is the scope.
        """
        repos: List[Dict[str, Any]] = []
        page = 1

        while len(repos) < per_page:
            response = httpx.get(
                "https://api.github.com/installation/repositories",
                params={"per_page": min(100, per_page - len(repos)), "page": page},
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=30.0,
            )
            if response.status_code != 200:
                raise GithubException(
                    response.status_code,
                    {"message": "Could not list installation repositories"},
                    None,
                )

            batch = response.json().get("repositories", [])
            if not batch:
                break

            repos.extend(self._format_installation_repository(r) for r in batch)
            if len(batch) < 100:
                break
            page += 1

        return repos[:per_page]

    @staticmethod
    def _format_installation_repository(repo: Dict[str, Any]) -> Dict[str, Any]:
        """Shape a REST repository payload like _format_repository does for PyGithub."""
        return {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "private": repo["private"],
            "description": repo.get("description"),
            "url": repo["html_url"],
            "language": repo.get("language"),
            "stars": repo.get("stargazers_count", 0),
            "forks": repo.get("forks_count", 0),
            "open_issues": repo.get("open_issues_count", 0),
            "default_branch": repo.get("default_branch") or "main",
            "created_at": repo.get("created_at"),
            "updated_at": repo.get("updated_at"),
            "size": repo.get("size", 0),
        }

    @retry_with_backoff(max_retries=3, base_delay=1.0)
    def get_repositories(self, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        # GitHub App mode: an installation token cannot call GET /user, so the
        # whole get_user().get_repos() path 403s. Verified against live GitHub:
        # without this branch, sync returns zero repositories and the dashboard
        # is empty after a successful login.
        if self._is_installation_token():
            cache_key = f"github:installrepos:{hash(self.access_token) & 0xffffffff}:{page}:{per_page}"
            cached = self.redis.get(cache_key)
            if cached:
                return cached

            repos = self._get_installation_repositories(per_page=per_page)
            # Short TTL: the user can change which repositories are granted at
            # any time from GitHub, and that must show up quickly.
            self.redis.set(cache_key, repos, ttl=300)
            logger.info(f"✅ Fetched {len(repos)} repositories from the installation")
            return repos

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
            except GithubException as first_error:
                # An empty repository (no commits) is a normal thing for a user
                # to own and click Analyze on. GitHub answers 409 "Git Repository
                # is empty" here and 404 "This repository is empty" from the
                # contents fallback, so without this the whole analysis died with
                # an unhandled GithubException. Verified against a real empty repo.
                if _is_empty_repository(first_error):
                    logger.info(f"{full_name} is empty - nothing to analyse")
                    return []

                # Fallback to master branch
                try:
                    tree = repo.get_git_tree("master", recursive=True)
                except GithubException as e:
                    if _is_empty_repository(e):
                        logger.info(f"{full_name} is empty - nothing to analyse")
                        return []
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
            except GithubException as e:
                if _is_empty_repository(e):
                    return []
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
    
    @retry_with_backoff(max_retries=2, base_delay=0.5)
    def get_default_branch_sha(self, full_name: str, branch: str = "main") -> Optional[str]:
        """
        Head commit SHA for a branch.

        Used to key the analysis cache. Without it every analysis of a repository
        shared one cache entry regardless of what had changed, so re-running after
        a push returned the previous commit's findings.
        """
        cache_key = f"github:head:{full_name}:{branch}"
        cached = self.redis.get(cache_key)
        if cached:
            return cached

        try:
            repo = self.client.get_repo(full_name)
            try:
                sha = repo.get_branch(branch).commit.sha
            except GithubException:
                sha = repo.get_branch(repo.default_branch).commit.sha

            # Short TTL: this is a freshness signal, so a stale one defeats the point.
            self.redis.set(cache_key, sha, ttl=60)
            return sha
        except GithubException as e:
            logger.warning(f"Could not resolve head SHA for {full_name}@{branch}: {e}")
            return None

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


def create_github_service(access_token: str) -> GitHubService:
    return GitHubService(access_token)
