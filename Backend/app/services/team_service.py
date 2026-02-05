from typing import List, Dict, Any, Optional
from datetime import datetime
from app.db.supabase import get_service_db
from app.core.logging import get_logger

logger = get_logger(__name__)


class TeamService:
    def __init__(self):
        self.db = get_service_db()

    async def create_team(
        self,
        organization_id: str,
        name: str,
        manager_id: Optional[str] = None,
        description: Optional[str] = None,
        creator_id: str = None
    ) -> Optional[Dict[str, Any]]:
        """Create a new team in an organization."""
        try:
            # Verify creator has access to organization
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, creator_id)
            if not org:
                logger.warning(f"User {creator_id} does not have access to organization {organization_id}")
                return None
            
            result = self.db.table("teams").insert({
                "organization_id": organization_id,
                "name": name,
                "manager_id": manager_id,
                "description": description
            }).execute()
            
            if result.data:
                team = result.data[0]
                # Add creator as team member if not already manager
                if creator_id and creator_id != manager_id:
                    await self.add_team_member(team["id"], creator_id, "member", creator_id)
                
                # Log audit event
                await org_service.log_audit_event(
                    organization_id,
                    creator_id,
                    "team_created",
                    details={"team_id": team["id"], "team_name": name}
                )
                
                logger.info(f"Created team {team['id']} in organization {organization_id}")
                return team
            
            return None
        except Exception as e:
            logger.error(f"Error creating team: {e}")
            return None

    async def get_team(self, team_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Get team by ID if user has access."""
        try:
            result = self.db.table("teams").select("*").eq("id", team_id).single().execute()
            
            if result.data:
                team = result.data
                # Check if user has access via organization
                from app.services.organization_service import OrganizationService
                org_service = OrganizationService()
                org = await org_service.get_organization(team["organization_id"], user_id)
                if org:
                    return team
            
            return None
        except Exception as e:
            logger.error(f"Error getting team: {e}")
            return None

    async def list_organization_teams(self, organization_id: str, user_id: str) -> List[Dict[str, Any]]:
        """List all teams in an organization."""
        try:
            # Verify user has access
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(organization_id, user_id)
            if not org:
                return []
            
            result = self.db.table("teams").select("*").eq("organization_id", organization_id).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error listing teams: {e}")
            return []

    async def delete_team(self, team_id: str, user_id: str) -> bool:
        """Delete a team (only organization owner can delete)."""
        try:
            # Get the team first
            team = await self.get_team(team_id, user_id)
            if not team:
                return False
            
            # Verify user is organization owner
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            org = await org_service.get_organization(team["organization_id"], user_id)
            if not org or org["owner_id"] != user_id:
                logger.warning(f"User {user_id} is not owner of organization, cannot delete team")
                return False
            
            # Delete team members first
            self.db.table("team_members").delete().eq("team_id", team_id).execute()
            
            # Delete repository assignments
            self.db.table("repository_assignments").delete().eq("team_id", team_id).execute()
            
            # Delete the team
            self.db.table("teams").delete().eq("id", team_id).execute()
            
            # Log audit event
            await org_service.log_audit_event(
                team["organization_id"],
                user_id,
                "team_deleted",
                details={"team_id": team_id, "team_name": team["name"]}
            )
            
            logger.info(f"Deleted team {team_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting team: {e}")
            return False

    async def add_team_member(
        self,
        team_id: str,
        user_id: str,
        role: str = "member",
        added_by: str = None
    ) -> bool:
        """Add a user to a team."""
        try:
            # Verify adder has access to team
            team = await self.get_team(team_id, added_by) if added_by else None
            if not team and added_by:
                return False
            
            # Check if already a member
            existing = self.db.table("team_members").select("*").eq("team_id", team_id).eq("user_id", user_id).execute()
            if existing.data:
                # Update role if different
                if existing.data[0]["role"] != role:
                    self.db.table("team_members").update({"role": role}).eq("team_id", team_id).eq("user_id", user_id).execute()
                return True
            
            self.db.table("team_members").insert({
                "team_id": team_id,
                "user_id": user_id,
                "role": role
            }).execute()
            
            # Log audit event
            if added_by and team:
                from app.services.organization_service import OrganizationService
                org_service = OrganizationService()
                await org_service.log_audit_event(
                    team["organization_id"],
                    added_by,
                    "team_member_added",
                    details={"team_id": team_id, "user_id": user_id, "role": role}
                )
            
            logger.info(f"Added user {user_id} to team {team_id} with role {role}")
            return True
        except Exception as e:
            logger.error(f"Error adding team member: {e}")
            return False

    async def remove_team_member(self, team_id: str, user_id: str, removed_by: str) -> bool:
        """Remove a user from a team."""
        try:
            team = await self.get_team(team_id, removed_by)
            if not team:
                return False
            
            self.db.table("team_members").delete().eq("team_id", team_id).eq("user_id", user_id).execute()
            
            # Log audit event
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            await org_service.log_audit_event(
                team["organization_id"],
                removed_by,
                "team_member_removed",
                details={"team_id": team_id, "user_id": user_id}
            )
            
            logger.info(f"Removed user {user_id} from team {team_id}")
            return True
        except Exception as e:
            logger.error(f"Error removing team member: {e}")
            return False

    async def get_team_members(self, team_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Get all members of a team."""
        try:
            team = await self.get_team(team_id, user_id)
            if not team:
                return []
            
            result = self.db.table("team_members").select("*, users(*)").eq("team_id", team_id).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error getting team members: {e}")
            return []

    async def assign_repository_to_team(
        self,
        repository_id: str,
        team_id: str,
        assigned_by: str
    ) -> bool:
        """Assign a repository to a team."""
        try:
            # Verify assigner has access to team and repository
            team = await self.get_team(team_id, assigned_by)
            if not team:
                return False
            
            # Check repository access
            repo_result = self.db.table("repositories").select("*").eq("id", repository_id).single().execute()
            if not repo_result.data:
                return False
            
            repo = repo_result.data
            if repo["user_id"] != assigned_by:
                # Check if user is member of team
                member_check = self.db.table("team_members").select("*").eq("team_id", team_id).eq("user_id", assigned_by).execute()
                if not member_check.data:
                    return False
            
            # Check if already assigned
            existing = self.db.table("repository_assignments").select("*").eq("repository_id", repository_id).eq("team_id", team_id).execute()
            if existing.data:
                return True  # Already assigned
            
            self.db.table("repository_assignments").insert({
                "repository_id": repository_id,
                "team_id": team_id,
                "assigned_by": assigned_by
            }).execute()
            
            # Log audit event
            from app.services.organization_service import OrganizationService
            org_service = OrganizationService()
            await org_service.log_audit_event(
                team["organization_id"],
                assigned_by,
                "repository_assigned",
                repository_id=repository_id,
                details={"team_id": team_id, "repository_id": repository_id}
            )
            
            logger.info(f"Assigned repository {repository_id} to team {team_id}")
            return True
        except Exception as e:
            logger.error(f"Error assigning repository to team: {e}")
            return False

    async def get_team_repositories(self, team_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Get all repositories assigned to a team."""
        try:
            team = await self.get_team(team_id, user_id)
            if not team:
                return []
            
            assignments_result = self.db.table("repository_assignments").select("repository_id").eq("team_id", team_id).execute()
            repo_ids = [a["repository_id"] for a in (assignments_result.data or [])]
            
            if not repo_ids:
                return []
            
            repos_result = self.db.table("repositories").select("*").in_("id", repo_ids).execute()
            return repos_result.data or []
        except Exception as e:
            logger.error(f"Error getting team repositories: {e}")
            return []
