from github import Github, GithubException
from typing import List, Dict, Any, Optional
from app.core.logging import get_logger
from app.core.config import get_settings
from app.services.redis_service import get_redis_service
import base64
import httpx

settings = get_settings()
logger = get_logger(__name__)


class GitHubService:
    def __init__(self, access_token: str):
        self.client = Github(access_token)
        self.user = None
        self.redis = get_redis_service()
        
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
    
    def get_repositories(self, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        if not self.user:
            self.user = self.client.get_user()
        
        # Check Redis cache for repositories list (5 min TTL - frequently updated)
        cache_key = f"github:repos:{self.user.login}:{page}:{per_page}"
        cached_repos = self.redis.get(cache_key)
        if cached_repos:
            logger.debug(f"✓ Redis cache hit for repositories: {self.user.login}")
            return cached_repos
        
        repos = []
        try:
            logger.debug(f"⚡ Fetching repositories from GitHub for: {self.user.login}")
            for repo in self.user.get_repos(sort="updated", direction="desc"):
                repos.append(self._format_repository(repo))
                
                if len(repos) >= per_page:
                    break
            
            # Cache for 5 minutes
            self.redis.set(cache_key, repos, ttl=300)
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
    
    def get_repository_files(self, full_name: str, branch: str = "main", path: str = "") -> List[Dict[str, Any]]:
        # Check Redis cache for file list (30 min TTL - rarely changes)
        # Only cache the root path to avoid too many cache keys
        if path == "":
            cache_key = f"github:files:{full_name}:{branch}"
            cached_files = self.redis.get(cache_key)
            if cached_files:
                logger.debug(f"✓ Redis cache hit for files: {full_name}")
                return cached_files
        
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
                    files.extend(self.get_repository_files(full_name, branch, content.path))
                else:
                    if self._is_code_file(content.path):
                        files.append({
                            "path": content.path,
                            "name": content.name,
                            "size": content.size,
                            "sha": content.sha,
                            "type": content.type
                        })
            
            # Cache root file list for 30 minutes
            if path == "":
                logger.debug(f"⚡ Caching file list for: {full_name}")
                self.redis.set(cache_key, files, ttl=1800)
            
            return files
        except GithubException as e:
            logger.error(f"Failed to fetch repository files: {str(e)}")
            raise
    
    def get_file_content(self, full_name: str, file_path: str, branch: str = "main") -> str:
        import httpx
        
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


def create_github_service(access_token: str) -> GitHubService:
    return GitHubService(access_token)
