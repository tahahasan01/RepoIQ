from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.db.postgres import get_service_db
from app.services.github_service import create_github_service
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

logger = get_logger(__name__)


class OwnershipService:
    def __init__(self):
        self.db = get_service_db()

    async def analyze_code_ownership(
        self,
        repository_id: str,
        github_token: str,
        file_path: Optional[str] = None
    ) -> bool:
        """Analyze code ownership for a repository using GitHub blame data."""
        try:
            github_service = create_github_service(github_token)
            
            # Get repository info
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repository_id).single().execute))
            if not repo_result.data:
                return False
            
            repo = repo_result.data
            github_repo = github_service.get_repository(repo["github_repo_id"])
            
            # Get files to analyze
            if file_path:
                files_to_analyze = [file_path]
            else:
                # Get all files from repository (simplified - would need recursive tree traversal)
                try:
                    tree = github_repo.get_git_tree(repo["default_branch"], recursive=True)
                    files_to_analyze = [item.path for item in tree.tree if item.type == "blob"]
                except Exception:
                    logger.warning(f"Could not get file tree for {repository_id}, skipping ownership analysis")
                    return False
            
            # Analyze ownership for each file
            default_branch = repo["default_branch"]
            for file_path_item in files_to_analyze:
                try:
                    await self._analyze_file_ownership(github_repo, repository_id, file_path_item, default_branch)
                except Exception as e:
                    logger.warning(f"Error analyzing ownership for {file_path_item}: {e}")
                    continue
            
            logger.info(f"Analyzed code ownership for {len(files_to_analyze)} files in repository {repository_id}")
            return True
        except Exception as e:
            logger.error(f"Error analyzing code ownership: {e}")
            return False

    async def _analyze_file_ownership(
        self,
        github_repo,
        repository_id: str,
        file_path: str,
        default_branch: str
    ):
        """Analyze ownership for a single file using git blame."""
        try:
            # Get blame data
            blame_data = github_repo.get_blame(default_branch, file_path)
            
            # Count lines by author
            author_lines = {}
            total_lines = 0
            
            for commit_group in blame_data:
                author = commit_group.commit.author
                if author:
                    author_login = author.login
                    lines_count = len(commit_group.ranges)
                    
                    if author_login not in author_lines:
                        author_lines[author_login] = 0
                    
                    author_lines[author_login] += lines_count
                    total_lines += lines_count
            
            # Get user IDs and store ownership
            for github_username, lines_owned in author_lines.items():
                user_result = (await run_blocking(self.db.table("users").select("id").eq("github_username", github_username).single().execute))
                if user_result.data:
                    user_id = user_result.data["id"]
                    ownership_percentage = (lines_owned / total_lines * 100) if total_lines > 0 else 0
                    
                    # Upsert ownership record
                    (await run_blocking(self.db.table("code_ownership").upsert({
                        "repository_id": repository_id,
                        "file_path": file_path,
                        "user_id": user_id,
                        "ownership_percentage": round(ownership_percentage, 2),
                        "lines_owned": lines_owned,
                        "last_modified": datetime.utcnow().isoformat()
                    }, on_conflict="repository_id,file_path,user_id").execute))
        except Exception as e:
            logger.warning(f"Error analyzing file ownership for {file_path}: {e}")

    async def get_repository_ownership(
        self,
        repository_id: str,
        user_id: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get ownership map for a repository."""
        try:
            # Verify access
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repository_id).single().execute))
            if not repo_result.data or repo_result.data["user_id"] != user_id:
                return {}
            
            # Get ownership data
            # SECURITY: explicit column allowlist. users(*) returns the ENTIRE user row -
            # including github_access_token and email - for every joined developer.
            # Same defect as AUDIT.md C-4 (fixed in team_service); these call sites
            # were missed by the original audit and found by the static tenant scan.
            result = (await run_blocking(self.db.table("code_ownership").select(
                f"*, users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("repository_id", repository_id).execute))
            ownership_data = result.data or []
            
            # Group by file
            ownership_map = {}
            for record in ownership_data:
                file_path = record["file_path"]
                if file_path not in ownership_map:
                    ownership_map[file_path] = []
                
                ownership_map[file_path].append({
                    "user_id": record["user_id"],
                    "user": record.get("users"),
                    "ownership_percentage": record["ownership_percentage"],
                    "lines_owned": record["lines_owned"],
                    "last_modified": record["last_modified"]
                })
            
            return ownership_map
        except Exception as e:
            logger.error(f"Error getting repository ownership: {e}")
            return {}

    async def get_ownership_health(
        self,
        repository_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Get ownership health scores for a repository."""
        try:
            ownership_map = await self.get_repository_ownership(repository_id, user_id)
            
            if not ownership_map:
                return {
                    "health_score": 0,
                    "total_files": 0,
                    "orphaned_files": 0,
                    "high_concentration_files": 0,
                    "average_owners_per_file": 0
                }
            
            total_files = len(ownership_map)
            orphaned_files = 0
            high_concentration_files = 0
            total_owners = 0
            
            for file_path, owners in ownership_map.items():
                total_owners += len(owners)
                
                # Check for orphaned files (no active owner in last 90 days)
                has_recent_owner = False
                for owner in owners:
                    if owner.get("last_modified"):
                        last_modified = datetime.fromisoformat(owner["last_modified"].replace("Z", "+00:00"))
                        days_since = (datetime.utcnow() - last_modified.replace(tzinfo=None)).days
                        if days_since < 90:
                            has_recent_owner = True
                            break
                
                if not has_recent_owner:
                    orphaned_files += 1
                
                # Check for high concentration (one person owns >80%)
                if len(owners) > 0:
                    max_ownership = max(o["ownership_percentage"] for o in owners)
                    if max_ownership > 80:
                        high_concentration_files += 1
            
            average_owners_per_file = total_owners / total_files if total_files > 0 else 0
            
            # Calculate health score (0-100)
            health_score = 100
            if total_files > 0:
                orphaned_ratio = orphaned_files / total_files
                concentration_ratio = high_concentration_files / total_files
                
                # Deduct points for orphaned files and high concentration
                health_score -= (orphaned_ratio * 30)  # Up to 30 points for orphaned files
                health_score -= (concentration_ratio * 20)  # Up to 20 points for concentration
                health_score = max(0, health_score)
            
            return {
                "health_score": round(health_score, 2),
                "total_files": total_files,
                "orphaned_files": orphaned_files,
                "high_concentration_files": high_concentration_files,
                "average_owners_per_file": round(average_owners_per_file, 2)
            }
        except Exception as e:
            logger.error(f"Error getting ownership health: {e}")
            return {}

    async def get_issue_blame(
        self,
        issue_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Get blame information for an issue."""
        try:
            # Verify access
            issue_result = (await run_blocking(self.db.table("issues").select("*, analysis_results(*)").eq("id", issue_id).single().execute))
            if not issue_result.data:
                return []
            
            issue = issue_result.data
            analysis = issue.get("analysis_results", {})
            repo_id = analysis.get("repository_id")
            
            if not repo_id:
                return []
            
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repo_id).single().execute))
            if not repo_result.data or repo_result.data["user_id"] != user_id:
                return []
            
            # Get blame records
            # SECURITY: explicit column allowlist. users(*) returns the ENTIRE user row -
            # including github_access_token and email - for every joined developer.
            # Same defect as AUDIT.md C-4 (fixed in team_service); these call sites
            # were missed by the original audit and found by the static tenant scan.
            result = (await run_blocking(self.db.table("issue_blame").select(
                f"*, users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("issue_id", issue_id).execute))
            return result.data or []
        except Exception as e:
            logger.error(f"Error getting issue blame: {e}")
            return []

    async def get_orphaned_code(
        self,
        repository_id: str,
        user_id: str,
        days_threshold: int = 90
    ) -> List[Dict[str, Any]]:
        """Get files with no active owner (orphaned code)."""
        try:
            # Verify access
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repository_id).single().execute))
            if not repo_result.data or repo_result.data["user_id"] != user_id:
                return []
            
            # Get all files with ownership
            ownership_result = (await run_blocking(self.db.table("code_ownership").select("*").eq("repository_id", repository_id).execute))
            ownership_data = ownership_result.data or []
            
            # Group by file
            file_owners = {}
            for record in ownership_data:
                file_path = record["file_path"]
                if file_path not in file_owners:
                    file_owners[file_path] = []
                file_owners[file_path].append(record)
            
            # Find orphaned files
            orphaned_files = []
            threshold_date = datetime.utcnow() - timedelta(days=days_threshold)
            
            for file_path, owners in file_owners.items():
                has_recent_owner = False
                for owner in owners:
                    if owner.get("last_modified"):
                        last_modified = datetime.fromisoformat(owner["last_modified"].replace("Z", "+00:00"))
                        if last_modified.replace(tzinfo=None) >= threshold_date:
                            has_recent_owner = True
                            break
                
                if not has_recent_owner:
                    orphaned_files.append({
                        "file_path": file_path,
                        "last_modified": max([o.get("last_modified", "") for o in owners], default=""),
                        "owners": [{"user_id": o["user_id"], "ownership_percentage": o["ownership_percentage"]} for o in owners]
                    })
            
            return orphaned_files
        except Exception as e:
            logger.error(f"Error getting orphaned code: {e}")
            return []
