from typing import List, Dict, Any, Optional
from app.db.postgres import get_service_db
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)


class OrganizationService:
    def __init__(self):
        self.db = get_service_db()

    async def create_organization(
        self,
        name: str,
        owner_id: str,
        plan_type: str = "free"
    ) -> Dict[str, Any]:
        """Create a new organization."""
        try:
            result = (await run_blocking(self.db.table("organizations").insert({
                "name": name,
                "owner_id": owner_id,
                "plan_type": plan_type
            }).execute))
            
            if result.data:
                logger.info(f"Created organization {result.data[0]['id']} for owner {owner_id}")
                return result.data[0]
            raise Exception("Failed to create organization")
        except Exception as e:
            logger.error(f"Error creating organization: {e}")
            raise

    async def get_organization(self, org_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get organization by ID if user has access."""
        try:
            result = (await run_blocking(self.db.table("organizations").select("*").eq("id", org_id).execute))
            
            if result.data:
                org = result.data[0]
                # Check if user is owner or member
                if org["owner_id"] == user_id:
                    return org
                
                # Check if user is member of any team in this org
                teams_result = (await run_blocking(self.db.table("teams").select("id").eq("organization_id", org_id).execute))
                team_ids = [t["id"] for t in (teams_result.data or [])]
                
                if team_ids:
                    member_check = (await run_blocking(self.db.table("team_members").select("user_id").in_("team_id", team_ids).eq("user_id", user_id).execute))
                    if member_check.data:
                        return org
            
            return None
        except Exception as e:
            logger.error(f"Error getting organization: {e}")
            return None

    async def list_user_organizations(self, user_id: str) -> List[Dict[str, Any]]:
        """List all organizations a user belongs to (as owner or member)."""
        try:
            # Get organizations where user is owner
            owned_result = (await run_blocking(self.db.table("organizations").select("*").eq("owner_id", user_id).execute))
            owned_orgs = owned_result.data or []
            
            # Get organizations where user is team member
            teams_result = (await run_blocking(self.db.table("team_members").select("team_id").eq("user_id", user_id).execute))
            team_ids = [t["team_id"] for t in (teams_result.data or [])]
            
            member_orgs = []
            if team_ids:
                teams_orgs_result = (await run_blocking(self.db.table("teams").select("organization_id").in_("id", team_ids).execute))
                org_ids = list(set([t["organization_id"] for t in (teams_orgs_result.data or [])]))
                
                if org_ids:
                    orgs_result = (await run_blocking(self.db.table("organizations").select("*").in_("id", org_ids).execute))
                    member_orgs = orgs_result.data or []
            
            # Combine and deduplicate
            all_orgs = {org["id"]: org for org in owned_orgs + member_orgs}
            return list(all_orgs.values())
        except Exception as e:
            logger.error(f"Error listing user organizations: {e}")
            return []

    async def update_organization(
        self,
        org_id: str,
        owner_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update organization (only owner can update)."""
        try:
            # Verify ownership
            org = await self.get_organization(org_id, owner_id)
            if not org or org["owner_id"] != owner_id:
                return None
            
            result = (await run_blocking(self.db.table("organizations").update(updates).eq("id", org_id).execute))
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error updating organization: {e}")
            return None

    async def delete_organization(self, org_id: str, owner_id: str) -> bool:
        """Delete organization (only owner can delete)."""
        try:
            org = await self.get_organization(org_id, owner_id)
            if not org or org["owner_id"] != owner_id:
                return False
            
            (await run_blocking(self.db.table("organizations").delete().eq("id", org_id).execute))
            logger.info(f"Deleted organization {org_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting organization: {e}")
            return False

    async def get_organization_repositories(self, org_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Get all repositories assigned to teams in this organization."""
        try:
            # Verify user has access to org
            org = await self.get_organization(org_id, user_id)
            if not org:
                return []
            
            # Get all teams in organization
            teams_result = (await run_blocking(self.db.table("teams").select("id").eq("organization_id", org_id).execute))
            team_ids = [t["id"] for t in (teams_result.data or [])]
            
            if not team_ids:
                return []
            
            # Get repository assignments for these teams
            assignments_result = (await run_blocking(self.db.table("repository_assignments").select("repository_id").in_("team_id", team_ids).execute))
            repo_ids = list(set([a["repository_id"] for a in (assignments_result.data or [])]))
            
            if not repo_ids:
                return []
            
            # Get repository details
            repos_result = (await run_blocking(self.db.table("repositories").select("*").in_("id", repo_ids).execute))
            return repos_result.data or []
        except Exception as e:
            logger.error(f"Error getting organization repositories: {e}")
            return []

    async def log_audit_event(
        self,
        organization_id: str,
        user_id: str,
        action: str,
        repository_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Log an audit event."""
        try:
            (await run_blocking(self.db.table("audit_logs").insert({
                "organization_id": organization_id,
                "user_id": user_id,
                "repository_id": repository_id,
                "action": action,
                "details_jsonb": details or {}
            }).execute))
            return True
        except Exception as e:
            logger.error(f"Error logging audit event: {e}")
            return False
