from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.db.postgres import get_service_db
from app.services.github_service import create_github_service
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

logger = get_logger(__name__)


class DeveloperAnalyticsService:
    def __init__(self):
        self.db = get_service_db()

    async def track_developer_contributions(
        self,
        repository_id: str,
        github_token: str,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None
    ) -> bool:
        """Track developer contributions for a repository using GitHub API."""
        try:
            github_service = create_github_service(github_token)
            
            # Get repository info
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repository_id).single().execute))
            if not repo_result.data:
                return False
            
            repo = repo_result.data
            github_repo = github_service.get_repository(repo["github_repo_id"])
            
            # Default to last 30 days if period not specified
            if not period_end:
                period_end = datetime.utcnow()
            if not period_start:
                period_start = period_end - timedelta(days=30)
            
            # Get commits in the period
            commits = github_repo.get_commits(since=period_start, until=period_end)
            
            # Aggregate by author
            contributions = {}
            
            for commit in commits:
                author = commit.author
                if not author:
                    continue
                
                author_login = author.login
                
                if author_login not in contributions:
                    contributions[author_login] = {
                        "commits_count": 0,
                        "lines_added": 0,
                        "lines_removed": 0,
                        "files_changed": 0
                    }
                
                contributions[author_login]["commits_count"] += 1
                
                # Get commit stats
                try:
                    stats = commit.stats
                    contributions[author_login]["lines_added"] += stats.additions
                    contributions[author_login]["lines_removed"] += stats.deletions
                    contributions[author_login]["files_changed"] += stats.total
                except Exception:
                    pass
            
            # Get user IDs for GitHub usernames
            for github_username, stats in contributions.items():
                user_result = (await run_blocking(self.db.table("users").select("id").eq("github_username", github_username).single().execute))
                if user_result.data:
                    user_id = user_result.data["id"]
                    
                    # Get issues introduced/fixed (simplified - would need more sophisticated tracking)
                    issues_introduced = await self._count_issues_introduced(repository_id, user_id, period_start, period_end)
                    issues_fixed = await self._count_issues_fixed(repository_id, user_id, period_start, period_end)
                    
                    # Upsert contribution record
                    (await run_blocking(self.db.table("developer_contributions").upsert({
                        "user_id": user_id,
                        "repository_id": repository_id,
                        "period_start": period_start.isoformat(),
                        "period_end": period_end.isoformat(),
                        "commits_count": stats["commits_count"],
                        "lines_added": stats["lines_added"],
                        "lines_removed": stats["lines_removed"],
                        "files_changed": stats["files_changed"],
                        "issues_introduced": issues_introduced,
                        "issues_fixed": issues_fixed
                    }, on_conflict="user_id,repository_id,period_start,period_end").execute))
            
            logger.info(f"Tracked contributions for {len(contributions)} developers in repository {repository_id}")
            return True
        except Exception as e:
            logger.error(f"Error tracking developer contributions: {e}")
            return False

    async def _count_issues_introduced(
        self,
        repository_id: str,
        user_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> int:
        """Count issues introduced by developer (simplified - uses issue_blame table)."""
        try:
            # Get analyses in period
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("id").eq("repository_id", repository_id).gte("started_at", period_start.isoformat()).lte("started_at", period_end.isoformat()).execute))
            analysis_ids = [a["id"] for a in (analyses_result.data or [])]
            
            if not analysis_ids:
                return 0
            
            # Count issues blamed on this user
            issues_result = (await run_blocking(self.db.table("issues").select("id").in_("analysis_id", analysis_ids).execute))
            issue_ids = [i["id"] for i in (issues_result.data or [])]
            
            if not issue_ids:
                return 0
            
            blame_result = (await run_blocking(self.db.table("issue_blame").select("id").in_("issue_id", issue_ids).eq("user_id", user_id).eq("blame_type", "introduced").execute))
            return len(blame_result.data or [])
        except Exception:
            return 0

    async def _count_issues_fixed(
        self,
        repository_id: str,
        user_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> int:
        """Count issues fixed by developer."""
        try:
            analyses_result = (await run_blocking(self.db.table("analysis_results").select("id").eq("repository_id", repository_id).gte("started_at", period_start.isoformat()).lte("started_at", period_end.isoformat()).execute))
            analysis_ids = [a["id"] for a in (analyses_result.data or [])]
            
            if not analysis_ids:
                return 0
            
            issues_result = (await run_blocking(self.db.table("issues").select("id").in_("analysis_id", analysis_ids).eq("fixed", True).gte("fix_applied_at", period_start.isoformat()).lte("fix_applied_at", period_end.isoformat()).execute))
            
            # Check if fixes were applied by this user (would need to track fix_applied_by)
            # For now, return count of fixed issues in period
            return len(issues_result.data or [])
        except Exception:
            return 0

    async def get_developer_performance(
        self,
        user_id: str,
        repository_id: Optional[str] = None,
        period_days: int = 30
    ) -> Dict[str, Any]:
        """Get developer performance metrics."""
        try:
            period_end = datetime.utcnow()
            period_start = period_end - timedelta(days=period_days)
            
            query = self.db.table("developer_contributions").select("*").eq("user_id", user_id).gte("period_end", period_start.isoformat())
            
            if repository_id:
                query = query.eq("repository_id", repository_id)
            
            result = (await run_blocking(query.execute))
            contributions = result.data or []
            
            # Aggregate metrics
            total_commits = sum(c["commits_count"] for c in contributions)
            total_lines_added = sum(c["lines_added"] for c in contributions)
            total_lines_removed = sum(c["lines_removed"] for c in contributions)
            total_issues_introduced = sum(c["issues_introduced"] for c in contributions)
            total_issues_fixed = sum(c["issues_fixed"] for c in contributions)
            
            # Calculate risk score (higher is riskier)
            risk_score = 0
            if total_commits > 0:
                issue_rate = total_issues_introduced / total_commits
                risk_score = min(100, issue_rate * 100)
            
            # Calculate quality score (higher is better)
            quality_score = 100
            if total_issues_introduced > 0:
                fix_ratio = total_issues_fixed / total_issues_introduced if total_issues_introduced > 0 else 0
                quality_score = min(100, fix_ratio * 50 + 50)  # Scale to 0-100
            
            return {
                "user_id": user_id,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "total_commits": total_commits,
                "total_lines_added": total_lines_added,
                "total_lines_removed": total_lines_removed,
                "total_issues_introduced": total_issues_introduced,
                "total_issues_fixed": total_issues_fixed,
                "risk_score": round(risk_score, 2),
                "quality_score": round(quality_score, 2),
                "repositories": len(set(c["repository_id"] for c in contributions))
            }
        except Exception as e:
            logger.error(f"Error getting developer performance: {e}")
            return {}

    async def get_organization_developers(
        self,
        organization_id: str,
        user_id: str,
        period_days: int = 30
    ) -> List[Dict[str, Any]]:
        """Get all developers in an organization with their metrics."""
        try:
            # Verify user has access
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, user_id)
            if not org:
                return []
            
            # Get all teams in organization
            teams_result = (await run_blocking(self.db.table("teams").select("id").eq("organization_id", organization_id).execute))
            team_ids = [t["id"] for t in (teams_result.data or [])]
            
            if not team_ids:
                return []
            
            # Get all team members
            members_result = (await run_blocking(self.db.table("team_members").select("user_id").in_("team_id", team_ids).execute))
            user_ids = list(set([m["user_id"] for m in (members_result.data or [])]))
            
            if not user_ids:
                return []
            
            # Get performance for each developer
            developers = []
            for uid in user_ids:
                performance = await self.get_developer_performance(uid, period_days=period_days)
                if performance:
                    # Get user info
                    user_result = (await run_blocking(self.db.table("users").select("id, full_name, github_username, avatar_url").eq("id", uid).single().execute))
                    if user_result.data:
                        performance.update(user_result.data)
                        developers.append(performance)
            
            return developers
        except Exception as e:
            logger.error(f"Error getting organization developers: {e}")
            return []

    async def get_repository_contributors(
        self,
        repository_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Get all contributors to a repository."""
        try:
            # Verify access
            repo_result = (await run_blocking(self.db.table("repositories").select("*").eq("id", repository_id).single().execute))
            if not repo_result.data or repo_result.data["user_id"] != user_id:
                return []
            
            # Get contributions
            # SECURITY: explicit column allowlist. users(*) returns the ENTIRE user row -
            # including github_access_token and email - for every joined developer.
            # Same defect as AUDIT.md C-4 (fixed in team_service); these call sites
            # were missed by the original audit and found by the static tenant scan.
            result = (await run_blocking(self.db.table("developer_contributions").select(
                f"*, users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("repository_id", repository_id).execute))
            contributions = result.data or []
            
            # Aggregate by user
            contributors_map = {}
            for contrib in contributions:
                uid = contrib["user_id"]
                if uid not in contributors_map:
                    contributors_map[uid] = {
                        "user_id": uid,
                        "user": contrib.get("users"),
                        "total_commits": 0,
                        "total_lines_added": 0,
                        "total_lines_removed": 0,
                        "total_issues_introduced": 0,
                        "total_issues_fixed": 0
                    }
                
                contributors_map[uid]["total_commits"] += contrib["commits_count"]
                contributors_map[uid]["total_lines_added"] += contrib["lines_added"]
                contributors_map[uid]["total_lines_removed"] += contrib["lines_removed"]
                contributors_map[uid]["total_issues_introduced"] += contrib["issues_introduced"]
                contributors_map[uid]["total_issues_fixed"] += contrib["issues_fixed"]
            
            return list(contributors_map.values())
        except Exception as e:
            logger.error(f"Error getting repository contributors: {e}")
            return []
