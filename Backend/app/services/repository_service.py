from typing import List, Dict, Any, Optional
from datetime import datetime
from app.db.supabase import get_service_db
from app.services.github_service import create_github_service
from app.core.logging import get_logger

logger = get_logger(__name__)


class RepositoryService:
    def __init__(self):
        self.db = get_service_db()
    
    async def sync_repositories(self, user_id: str, github_token: str) -> List[Dict[str, Any]]:
        try:
            github_service = create_github_service(github_token)
            repos = github_service.get_repositories(per_page=100)
            
            synced_repos = []
            
            for repo in repos:
                existing = self.db.table("repositories").select("*").eq("user_id", user_id).eq("github_repo_id", repo["id"]).execute()
                
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
                
                if existing.data:
                    result = self.db.table("repositories").update(repo_data).eq("id", existing.data[0]["id"]).execute()
                    synced_repos.append(result.data[0])
                else:
                    result = self.db.table("repositories").insert(repo_data).execute()
                    synced_repos.append(result.data[0])
            
            return synced_repos
        except Exception as e:
            logger.error(f"Repository sync failed: {str(e)}")
            raise
    
    async def get_user_repositories(self, user_id: str, page: int = 1, per_page: int = 30) -> List[Dict[str, Any]]:
        try:
            offset = (page - 1) * per_page
            
            result = self.db.table("repositories")\
                .select("*")\
                .eq("user_id", user_id)\
                .order("updated_at", desc=True)\
                .limit(per_page)\
                .offset(offset)\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get repositories failed: {str(e)}")
            raise
    
    async def get_repository(self, repo_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = self.db.table("repositories")\
                .select("*")\
                .eq("id", repo_id)\
                .eq("user_id", user_id)\
                .single()\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get repository failed: {str(e)}")
            return None
    
    async def update_repository(self, repo_id: str, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = self.db.table("repositories")\
                .update(data)\
                .eq("id", repo_id)\
                .eq("user_id", user_id)\
                .execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Update repository failed: {str(e)}")
            raise
    
    async def get_repository_files(self, repo_id: str, user_id: str, github_token: str) -> List[Dict[str, Any]]:
        try:
            repo = await self.get_repository(repo_id, user_id)
            if not repo:
                raise Exception("Repository not found")
            
            github_service = create_github_service(github_token)
            files = github_service.get_repository_files(repo["full_name"], repo["default_branch"])
            
            return files
        except Exception as e:
            logger.error(f"Get repository files failed: {str(e)}")
            raise
    
    async def get_file_content(self, repo_id: str, user_id: str, file_path: str, github_token: str) -> str:
        try:
            repo = await self.get_repository(repo_id, user_id)
            if not repo:
                raise Exception("Repository not found")
            
            github_service = create_github_service(github_token)
            content = github_service.get_file_content(repo["full_name"], file_path, repo["default_branch"])
            
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
            
            result = self.db.table("analysis_results").insert(analysis_data).execute()
            
            return result.data[0]["id"]
        except Exception as e:
            logger.error(f"Create analysis failed: {str(e)}")
            raise
    
    async def update_analysis(self, analysis_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = self.db.table("analysis_results")\
                .update(data)\
                .eq("id", analysis_id)\
                .execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Update analysis failed: {str(e)}")
            raise
    
    async def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = self.db.table("analysis_results")\
                .select("*")\
                .eq("id", analysis_id)\
                .single()\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get analysis failed: {str(e)}")
            return None
    
    async def get_latest_analysis(self, repo_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = self.db.table("analysis_results")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Get latest analysis failed: {str(e)}")
            return None
    
    async def get_analysis_history(self, repo_id: str) -> List[Dict[str, Any]]:
        try:
            result = self.db.table("analysis_results")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .eq("status", "completed")\
                .order("completed_at", desc=True)\
                .limit(20)\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get analysis history failed: {str(e)}")
            raise
    
    async def save_issues(self, analysis_id: str, issues: List[Dict[str, Any]]) -> bool:
        try:
            issue_records = []
            for issue in issues:
                issue_data = {
                    "analysis_id": analysis_id,
                    "agent_type": issue.get("agent_type", "unknown"),
                    "severity": issue.get("severity", "low"),
                    "category": issue.get("category", "unknown"),
                    "file_path": issue.get("file_path", ""),
                    "line_number": issue.get("line_number"),
                    "description": issue.get("description", ""),
                    "suggestion": issue.get("suggestion"),
                    "auto_fixable": issue.get("auto_fixable", False)
                }
                issue_records.append(issue_data)
            
            if issue_records:
                self.db.table("issues").insert(issue_records).execute()
            
            return True
        except Exception as e:
            logger.error(f"Save issues failed: {str(e)}")
            return False
    
    async def get_issues(self, analysis_id: str) -> List[Dict[str, Any]]:
        try:
            result = self.db.table("issues")\
                .select("*")\
                .eq("analysis_id", analysis_id)\
                .order("severity")\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get issues failed: {str(e)}")
            raise
    
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
            
            self.db.table("improvement_roadmaps").insert(roadmap_data).execute()
            
            return True
        except Exception as e:
            logger.error(f"Save roadmap failed: {str(e)}")
            return False
    
    async def get_improvement_roadmap(self, repo_id: str) -> Optional[Dict[str, Any]]:
        try:
            result = self.db.table("improvement_roadmaps")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Get roadmap failed: {str(e)}")
            return None
