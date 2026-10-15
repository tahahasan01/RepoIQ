from github import Github, GithubException
from typing import List, Dict, Any, Optional, Tuple
from app.core.logging import get_logger
from app.core.config import get_settings
from app.services.redis_service import get_redis_service
import base64
import httpx
import time
from functools import wraps

settings = get_settings()
logger = get_logger(__name__)

_BLAME_QUERY = """
query($owner: String!, $name: String!, $expression: String!, $path: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) {
      ... on Commit {
        blame(path: $path) {
          ranges {
            startingLine
            endingLine
            commit { committedDate author { user { login } } }
          }
        }
      }
    }
  }
}
"""


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


class GitHubWriteError(Exception):
    """A write to GitHub (branch, commit, pull request) failed. Message is user-facing."""

    user_facing = True

    def __init__(self, message: str, permission: bool = False):
        super().__init__(message)
        self.permission = permission


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

    def _rest_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _get_installation_repositories(self, limit: int) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Repositories this installation was granted, via /installation/repositories.

        A GitHub App only ever sees the repositories the user selected at install
        time, so there is no "all repos for this user" to enumerate - the
        installation itself is the scope. Returns (repositories, complete).
        """
        repos: List[Dict[str, Any]] = []
        total = None
        page = 1

        while len(repos) < limit:
            response = httpx.get(
                "https://api.github.com/installation/repositories",
                params={"per_page": 100, "page": page},
                headers=self._rest_headers(),
                timeout=30.0,
            )
            if response.status_code != 200:
                raise GithubException(
                    response.status_code,
                    {"message": "Could not list installation repositories"},
                    None,
                )

            body = response.json()
            total = body.get("total_count", total)
            batch = body.get("repositories", [])
            repos.extend(self._format_installation_repository(r) for r in batch)
            if len(batch) < 100:
                break
            page += 1

        repos = repos[:limit]
        complete = total is None or len(repos) >= total
        return repos, complete

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
    def list_all_repositories(self, limit: int) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Every repository this token can see, up to `limit`.

        Returns (repositories, complete). `complete` is False when the account
        has more than `limit` repositories, and callers must then treat the list
        as partial. Sync deletes rows for repositories it did not see, and it
        used to see at most 100 - so any account with more lost the rest, with
        their analyses, issues and chat, on every sync.

        Not cached: a sync is the user asking for fresh data.
        """
        # GitHub App mode: an installation token cannot call GET /user, so the
        # get_user().get_repos() path 403s. Verified against live GitHub:
        # without this branch, sync returns zero repositories and the dashboard
        # is empty after a successful login.
        if self._is_installation_token():
            repos, complete = self._get_installation_repositories(limit)
            logger.info(f"Fetched {len(repos)} repositories from the installation (complete={complete})")
            return repos, complete

        if not self._check_rate_limit():
            raise GithubException(403, {"message": "Rate limit exceeded"}, None)

        if not self.user:
            self.user = self.client.get_user()

        repos: List[Dict[str, Any]] = []
        complete = True
        for repo in self.user.get_repos(sort="updated", direction="desc"):
            if len(repos) >= limit:
                complete = False
                break
            repos.append(self._format_repository(repo))

        logger.info(f"Fetched {len(repos)} repositories for {self.user.login} (complete={complete})")
        return repos, complete

    def get_contributor_weekly_stats(self, full_name: str) -> Optional[List[Dict[str, Any]]]:
        """
        Weekly commits, additions and deletions per author, in ONE request.

        GET /repos/{owner}/{repo}/stats/contributors. The previous approach
        walked every commit and read commit.stats, which costs one API request
        per commit. Returns None while GitHub is still computing the statistics
        (HTTP 202) - ask again shortly - and [] for an empty repository.
        """
        response = httpx.get(
            f"https://api.github.com/repos/{full_name}/stats/contributors",
            headers=self._rest_headers(),
            timeout=30.0,
        )
        if response.status_code == 202:
            return None
        if response.status_code == 204:
            return []
        if response.status_code != 200:
            raise GithubException(
                response.status_code, {"message": "Could not read contributor statistics"}, None
            )

        stats = []
        for entry in response.json() or []:
            author = entry.get("author") or {}
            stats.append({
                "login": author.get("login"),
                "weeks": [
                    {"week_start": w["w"], "additions": w["a"], "deletions": w["d"], "commits": w["c"]}
                    for w in entry.get("weeks", [])
                ],
            })
        return stats

    def get_file_blame(self, full_name: str, branch: str, path: str) -> List[Dict[str, Any]]:
        """
        Line ranges of a file with the author and date of the commit behind each.

        The REST API has no blame endpoint (PyGithub has no get_blame), so this
        is GraphQL. Returns [{"start", "end", "login", "committed_at"}]; login is
        None for commits whose author has no GitHub account.
        """
        owner, name = full_name.split("/", 1)
        response = httpx.post(
            "https://api.github.com/graphql",
            json={"query": _BLAME_QUERY, "variables": {
                "owner": owner, "name": name, "expression": branch, "path": path,
            }},
            headers=self._rest_headers(),
            timeout=30.0,
        )
        if response.status_code != 200:
            raise GithubException(response.status_code, {"message": "Blame request failed"}, None)

        body = response.json()
        if body.get("errors"):
            raise GithubException(422, {"message": str(body["errors"][0].get("message"))}, None)

        commit = ((body.get("data") or {}).get("repository") or {}).get("object") or {}
        ranges = ((commit.get("blame") or {}).get("ranges")) or []
        result = []
        for r in ranges:
            c = r.get("commit") or {}
            user = ((c.get("author") or {}).get("user")) or {}
            result.append({
                "start": r["startingLine"],
                "end": r["endingLine"],
                "login": user.get("login"),
                "committed_at": c.get("committedDate"),
            })
        return result

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
    
    def _write_error(self, action: str, e: GithubException) -> "GitHubWriteError":
        if e.status in (403, 404) and (e.status == 404 or _is_permission_error(e)):
            # GitHub answers 404 rather than 403 for some writes the token may not
            # make, so both mean "not allowed" here.
            return GitHubWriteError(
                "RepoIQ does not have write access to this repository. In the GitHub App's "
                "settings, set the repository permission 'Contents' to 'Read and write', then "
                "approve the updated permissions for this installation.",
                permission=True,
            )
        return GitHubWriteError(f"GitHub rejected the {action} (HTTP {e.status})")

    def get_branch_head(self, repo_full_name: str, branch: str) -> str:
        return self.client.get_repo(repo_full_name).get_branch(branch).commit.sha

    def get_file_at(self, repo_full_name: str, file_path: str, ref: str) -> Optional[str]:
        """
        A file's exact content at commit `ref`. Deliberately uncached.

        Auto-fix commits onto a branch cut from `ref`; building the change from
        a cached copy older than `ref` would silently revert whatever was pushed
        in between. None when the file is missing or not UTF-8 text.
        """
        try:
            item = self.client.get_repo(repo_full_name).get_contents(file_path, ref=ref)
        except GithubException as e:
            if e.status == 404:
                return None
            raise
        if isinstance(item, list):
            return None
        try:
            return item.decoded_content.decode("utf-8")
        except UnicodeDecodeError:
            return None

    def create_pull_request(self, repo_full_name: str, title: str, body: str, head: str, base: str = "main") -> Dict[str, Any]:
        try:
            repo = self.client.get_repo(repo_full_name)
            pr = repo.create_pull(title=title, body=body, head=head, base=base)
            return {"number": pr.number, "title": pr.title, "url": pr.html_url, "state": pr.state}
        except GithubException as e:
            logger.error(f"Failed to create pull request: {e.status}")
            raise self._write_error("pull request", e) from e

    def create_branch(self, repo_full_name: str, branch_name: str, from_branch: str) -> str:
        """
        Create `branch_name` at the head of `from_branch`. Returns the base SHA.

        Raises GitHubWriteError. This used to swallow every failure and return
        False - including "no write permission" - and the caller ignored it, so
        the next step failed with an unrelated error.
        """
        try:
            repo = self.client.get_repo(repo_full_name)
            sha = repo.get_branch(from_branch).commit.sha
            repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sha)
            return sha
        except GithubException as e:
            logger.error(f"Failed to create branch: {e.status}")
            raise self._write_error("branch creation", e) from e

    def update_file(self, repo_full_name: str, file_path: str, content: str, message: str, branch: str) -> None:
        """
        Commit new content for an EXISTING file on `branch`.

        Raises GitHubWriteError. This used to fall back to create_file after any
        error at all, so a transient failure reading the file could commit a
        second copy, and a permission error was reported as success.
        """
        try:
            repo = self.client.get_repo(repo_full_name)
            existing = repo.get_contents(file_path, ref=branch)
            repo.update_file(existing.path, message, content, existing.sha, branch=branch)
        except GithubException as e:
            logger.error(f"Failed to update {file_path}: {e.status}")
            raise self._write_error("commit", e) from e

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
