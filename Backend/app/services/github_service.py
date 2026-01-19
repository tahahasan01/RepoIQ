from github import Github, GithubException
from typing import List, Dict, Any, Optional
from app.core.logging import get_logger
from app.core.config import get_settings
import base64

settings = get_settings()
logger = get_logger(__name__)


class GitHubService:
    def __init__(self, access_token: str):
        self.client = Github(access_token)
        self.user = None
        
    def get_user_info(self) -> Dict[str, Any]:
        if not self.user:
            self.user = self.client.get_user()
        
        return {
            "username": self.user.login,
            "name": self.user.name,
            "email": self.user.email,
            "avatar_url": self.user.avatar_url,
            "bio": self.user.bio,
            "public_repos": self.user.public_repos
        }
    
    def get_repositories(self, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        if not self.user:
            self.user = self.client.get_user()
        
        repos = []
        try:
            for repo in self.user.get_repos(sort="updated", direction="desc"):
                repos.append(self._format_repository(repo))
                
                if len(repos) >= per_page:
                    break
            
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
            
            return files
        except GithubException as e:
            logger.error(f"Failed to fetch repository files: {str(e)}")
            raise
    
    def get_file_content(self, full_name: str, file_path: str, branch: str = "main") -> str:
        try:
            repo = self.client.get_repo(full_name)
            
            try:
                file_content = repo.get_contents(file_path, ref=branch)
            except:
                file_content = repo.get_contents(file_path, ref="master")
            
            if file_content.encoding == "base64":
                return base64.b64decode(file_content.content).decode('utf-8')
            else:
                return file_content.decoded_content.decode('utf-8')
        except GithubException as e:
            logger.error(f"Failed to fetch file content: {str(e)}")
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
