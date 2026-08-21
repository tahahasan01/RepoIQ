from typing import List, Dict, Any, Optional
from datetime import datetime
from app.db.supabase import get_service_db
from app.core.logging import get_logger

logger = get_logger(__name__)

# Roles a team member may hold. Previously this was unvalidated free text from the
# request body, so any caller could mint arbitrary role strings.
TEAM_ROLES = ("member", "lead", "manager")

# Explicit column allowlist for the joined user record on member listings.
# NEVER widen this to users(*) - that row carries github_access_token and email.
TEAM_MEMBER_USER_COLUMNS = "id, full_name, avatar_url, github_username"


def escape_like(value: str) -> str:
    """
    Escape PostgREST LIKE/ILIKE wildcards in user-supplied search input.

    Without this, '%' matches everything and '_' matches any character, so a
    one-character query enumerates the users table.
    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class TeamService:
    def __init__(self):
        self.db = get_service_db()  # Uses service_db to bypass RLS for admin operations

    async def _is_team_admin(self, team: Dict[str, Any], user_id: str) -> bool:
        """
        True if user_id may administer this team (add/remove members, change roles).

        SECURITY: read access to a team is NOT administrative access. get_team()
        succeeds for any member of any team in the organisation, so authorising
        mutations on it alone let any member escalate roles and evict anyone.
        Administration requires being the organisation owner or the team's manager.
        """
        if not user_id:
            return False

        if team.get("manager_id") == user_id:
            return True

        from app.services.organization_service import OrganizationService
        org_service = OrganizationService()
        org = await org_service.get_organization(team["organization_id"], user_id)

        return bool(org and org.get("owner_id") == user_id)

    def _get_team_row(self, team_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a team with no access check, for use by authorisation code.

        Deliberately separate from get_team(): that method's ACL is "can read",
        which is not the right predicate for deciding who may administer a team.
        """
        try:
            result = self.db.table("teams").select("*").eq("id", team_id).single().execute()
            return result.data
        except Exception:
            return None

    def _insert_team_member(self, team_id: str, user_id: str, role: str) -> None:
        """Unauthenticated insert helper. Callers must have already authorised."""
        self.db.table("team_members").insert({
            "team_id": team_id,
            "user_id": user_id,
            "role": role
        }).execute()

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
            
            # Check for duplicate team name within the same organization
            existing_teams = self.db.table("teams").select("id, name").eq("organization_id", organization_id).eq("name", name.strip()).execute()
            if existing_teams.data and len(existing_teams.data) > 0:
                logger.warning(f"Team with name '{name}' already exists in organization {organization_id}")
                raise ValueError(f"A team with the name '{name}' already exists in this organization")
            
            result = self.db.table("teams").insert({
                "organization_id": organization_id,
                "name": name.strip(),
                "manager_id": manager_id,
                "description": description
            }).execute()
            
            if result.data:
                team = result.data[0]
                # Add creator as team member if not already manager.
                # Uses the internal helper: the creator's access to the org was
                # already verified above, and they are not yet a team admin.
                if creator_id and creator_id != manager_id:
                    self._insert_team_member(team["id"], creator_id, "member")
                
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

    async def find_user_by_identifier(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Find a user by UUID, email, username, or name."""
        try:
            identifier = identifier.strip().lower()
            if not identifier:
                return None
            
            # SECURITY: every ilike() below uses an escaped literal. Unescaped, a
            # '%' or '_' in the identifier turns each of these into a wildcard scan
            # of the users table - "%" alone would return an arbitrary account.
            literal = escape_like(identifier)
            columns = "id, full_name, github_username"

            # First, check if it's a UUID
            import re
            uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
            if uuid_pattern.match(identifier):
                result = self.db.table("users").select(columns).eq("id", identifier).execute()
                if result.data:
                    logger.info("Resolved team member identifier by UUID")
                    return result.data[0]

            # Exact, case-insensitive email
            result = self.db.table("users").select(columns).ilike("email", literal).execute()
            if result.data:
                logger.info("Resolved team member identifier by email")
                return result.data[0]

            # Exact, case-insensitive GitHub username
            result = self.db.table("users").select(columns).not_.is_("github_username", "null").ilike("github_username", literal).execute()
            if result.data:
                logger.info("Resolved team member identifier by GitHub username")
                return result.data[0]

            # Exact, case-insensitive full name
            result = self.db.table("users").select(columns).not_.is_("full_name", "null").ilike("full_name", literal).execute()
            if result.data:
                logger.info("Resolved team member identifier by full name")
                return result.data[0]

            # Partial match, last resort. Ambiguity is an error rather than
            # "whichever row the database happened to return first" - silently
            # picking one adds the wrong person to a team.
            search_pattern = f"%{literal}%"
            for field in ("full_name", "github_username"):
                result = self.db.table("users")\
                    .select(columns)\
                    .not_.is_(field, "null")\
                    .ilike(field, search_pattern)\
                    .limit(5)\
                    .execute()

                if not result.data:
                    continue

                exact = next(
                    (u for u in result.data if (u.get(field) or "").lower() == identifier),
                    None
                )
                if exact:
                    logger.info(f"Resolved team member identifier by exact {field}")
                    return exact

                if len(result.data) > 1:
                    raise ValueError(
                        f"'{identifier}' matches more than one user. "
                        "Use an exact email, GitHub username, or user ID."
                    )

                logger.info(f"Resolved team member identifier by partial {field}")
                return result.data[0]

            logger.warning("No user matched the supplied team member identifier")
            return None
        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error finding user by identifier: {type(e).__name__}: {e}")
            return None

    async def add_team_member(
        self,
        team_id: str,
        user_identifier: str,
        role: str = "member",
        added_by: str = None
    ) -> bool:
        """Add a user to a team. Accepts UUID, email, username, or name."""
        try:
            # SECURITY: adding members is an administrative action. It requires the
            # organisation owner or the team manager - not merely read access to
            # the team, which every member of every team in the org has.
            if not added_by:
                logger.warning("add_team_member called without an actor; refusing")
                return False

            team = self._get_team_row(team_id)
            if not team:
                return False

            if not await self._is_team_admin(team, added_by):
                logger.warning(
                    f"User {added_by[:8]}... is not an admin of team {team_id}; "
                    "refusing to add a member"
                )
                return False

            if role not in TEAM_ROLES:
                raise ValueError(
                    f"Invalid role '{role}'. Must be one of: {', '.join(TEAM_ROLES)}"
                )

            # Find user by identifier (UUID, email, username, or name)
            user = await self.find_user_by_identifier(user_identifier)
            if not user:
                logger.warning(f"User not found: {user_identifier}")
                raise ValueError(f"User '{user_identifier}' not found. Please check the name, username, email, or user ID and try again.")
            
            user_id = user["id"]
            
            # Check if already a member
            existing = self.db.table("team_members").select("*").eq("team_id", team_id).eq("user_id", user_id).execute()
            if existing.data:
                # Update role if different
                if existing.data[0]["role"] != role:
                    self.db.table("team_members").update({"role": role}).eq("team_id", team_id).eq("user_id", user_id).execute()
                logger.info(f"User {user_id} is already a member, updated role to {role}")
                return True
            
            self._insert_team_member(team_id, user_id, role)

            logger.info(f"Added user {user_id} to team {team_id}")
            
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
            
            return True
        except ValueError:
            # Validation failures (unknown user, bad role) are the caller's problem
            # and the route turns them into a 400. Swallowing them here made every
            # such failure look like a generic server-side "False".
            raise
        except Exception as e:
            logger.error(f"Error adding team member: {e}")
            return False

    async def remove_team_member(self, team_id: str, user_id: str, removed_by: str) -> bool:
        """Remove a user from a team."""
        try:
            team = self._get_team_row(team_id)
            if not team:
                return False

            # SECURITY: removal is administrative. Without this gate any team member
            # could evict any other member, including the organisation owner.
            # Members are still allowed to remove themselves.
            if user_id != removed_by and not await self._is_team_admin(team, removed_by):
                logger.warning(
                    f"User {removed_by[:8]}... is not an admin of team {team_id}; "
                    "refusing to remove a member"
                )
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
            
            # SECURITY: explicit column allowlist. users(*) returned the entire user
            # row to every team member - including github_access_token and email.
            result = self.db.table("team_members")\
                .select(f"team_id, user_id, role, users({TEAM_MEMBER_USER_COLUMNS})")\
                .eq("team_id", team_id)\
                .execute()
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
            
            # SECURITY: the assigner must own the repository.
            #
            # The previous fallback checked whether the assigner belonged to the
            # team they had just named - which is a property of the team, not of
            # the repository. Any team member could therefore assign ANY repository
            # in the database to their own team and then read it back through
            # get_team_repositories().
            repo_result = self.db.table("repositories")\
                .select("id, user_id")\
                .eq("id", repository_id)\
                .eq("user_id", assigned_by)\
                .execute()

            if not repo_result.data:
                logger.warning(
                    f"User {assigned_by[:8]}... attempted to assign repository "
                    f"{repository_id} they do not own"
                )
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
