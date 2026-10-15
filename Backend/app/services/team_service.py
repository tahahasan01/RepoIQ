from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from psycopg.errors import UniqueViolation

from app.db.postgres import get_service_db
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)

# Roles a team member may hold. Previously this was unvalidated free text from the
# request body, so any caller could mint arbitrary role strings.
TEAM_ROLES = ("member", "lead", "manager")

# Explicit column allowlist for the joined user record on member listings.
# NEVER widen this to users(*) - that row carries github_access_token and email.
TEAM_MEMBER_USER_COLUMNS = "id, full_name, avatar_url, github_username"


class TeamActionError(Exception):
    """
    A team operation that cannot proceed, with the HTTP status it maps to.

    `detail` is an authored, client-safe sentence - never exception text from
    a lower layer - so routes may return it as-is.
    """

    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class TeamNotFoundError(TeamActionError):
    status_code = 404


class TeamPermissionError(TeamActionError):
    status_code = 403


class TeamConflictError(TeamActionError):
    status_code = 409


def _now() -> datetime:
    return datetime.now(timezone.utc)


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

    async def is_on_team(self, team: Dict[str, Any], user_id: str) -> bool:
        """
        True for the team's members, its manager, and its organization's owner.

        SECURITY: this - not get_team - is the test for seeing what is assigned
        to a team. get_team admits anyone in the organization, and a repository's
        owner shares it with the team they assign it to, not with every team in
        the company.
        """
        if not user_id:
            return False
        if team.get("manager_id") == user_id:
            return True
        member = (await run_blocking(
            self.db.table("team_members").select("id")
            .eq("team_id", team["id"]).eq("user_id", user_id).execute
        )).data
        if member:
            return True
        org = (await run_blocking(
            self.db.table("organizations").select("owner_id").eq("id", team["organization_id"]).execute
        )).data
        return bool(org) and org[0]["owner_id"] == user_id

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
            existing_teams = (await run_blocking(self.db.table("teams").select("id, name").eq("organization_id", organization_id).eq("name", name.strip()).execute))
            if existing_teams.data and len(existing_teams.data) > 0:
                logger.warning(f"Team with name '{name}' already exists in organization {organization_id}")
                raise ValueError(f"A team with the name '{name}' already exists in this organization")
            
            result = (await run_blocking(self.db.table("teams").insert({
                "organization_id": organization_id,
                "name": name.strip(),
                "manager_id": manager_id,
                "description": description
            }).execute))
            
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
            result = (await run_blocking(self.db.table("teams").select("*").eq("id", team_id).single().execute))
            
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
            
            result = (await run_blocking(self.db.table("teams").select("*").eq("organization_id", organization_id).execute))
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
            (await run_blocking(self.db.table("team_members").delete().eq("team_id", team_id).execute))
            
            # Delete repository assignments
            (await run_blocking(self.db.table("repository_assignments").delete().eq("team_id", team_id).execute))
            
            # Delete the team
            (await run_blocking(self.db.table("teams").delete().eq("id", team_id).execute))
            
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
                result = (await run_blocking(self.db.table("users").select(columns).eq("id", identifier).execute))
                if result.data:
                    logger.info("Resolved team member identifier by UUID")
                    return result.data[0]

            # Exact, case-insensitive email
            result = (await run_blocking(self.db.table("users").select(columns).ilike("email", literal).execute))
            if result.data:
                logger.info("Resolved team member identifier by email")
                return result.data[0]

            # Exact, case-insensitive GitHub username
            result = (await run_blocking(self.db.table("users").select(columns).not_.is_("github_username", "null").ilike("github_username", literal).execute))
            if result.data:
                logger.info("Resolved team member identifier by GitHub username")
                return result.data[0]

            # Exact, case-insensitive full name
            result = (await run_blocking(self.db.table("users").select(columns).not_.is_("full_name", "null").ilike("full_name", literal).execute))
            if result.data:
                logger.info("Resolved team member identifier by full name")
                return result.data[0]

            # Partial match, last resort. Ambiguity is an error rather than
            # "whichever row the database happened to return first" - silently
            # picking one adds the wrong person to a team.
            search_pattern = f"%{literal}%"
            for field in ("full_name", "github_username"):
                result = (await run_blocking(self.db.table("users")\
                    .select(columns)\
                    .not_.is_(field, "null")\
                    .ilike(field, search_pattern)\
                    .limit(5)\
                    .execute))

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

    # -- invitations ----------------------------------------------------------
    #
    # SECURITY: team membership is what makes two people colleagues, and
    # colleagues see each other's developer analytics and appear in each other's
    # user search (OrganizationService.get_colleague_ids). Adding a member used
    # to insert the team_members row directly, so anyone could create an
    # organization, "add" a stranger by email, and read that stranger's data
    # without the stranger doing anything. A membership now exists only once the
    # invited person accepts. A pending invitation grants nothing: no access
    # check reads team_invitations.

    async def invite_team_member(
        self,
        team_id: str,
        user_identifier: str,
        role: str = "member",
        invited_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Invite a user (by UUID, email, username or name) to join a team.

        Returns the hydrated invitation (see _hydrate_invitations). Raises
        TeamPermissionError unless invited_by administers the team, ValueError
        for an unknown or ambiguous user, a bad role or a self-invite, and
        TeamConflictError when the user is already a member or already has a
        pending invitation to this team.
        """
        # Administering the team is required - not merely read access to it,
        # which every member of every team in the organization has.
        if not invited_by:
            raise TeamPermissionError("You don't have permission to invite members to this team.")

        team = await run_blocking(self._get_team_row, team_id)
        if not team:
            raise TeamNotFoundError("Team not found.")

        if not await self._is_team_admin(team, invited_by):
            logger.warning(
                f"User {invited_by[:8]}... is not an admin of team {team_id}; "
                "refusing to invite a member"
            )
            raise TeamPermissionError("You don't have permission to invite members to this team.")

        if role not in TEAM_ROLES:
            raise ValueError(
                f"Invalid role '{role}'. Must be one of: {', '.join(TEAM_ROLES)}"
            )

        user = await self.find_user_by_identifier(user_identifier)
        if not user:
            raise ValueError(
                f"User '{user_identifier}' not found. Please check the name, "
                "username, email, or user ID and try again."
            )
        invitee_id = user["id"]

        if invitee_id == invited_by:
            raise ValueError("You cannot invite yourself to a team.")

        existing = (await run_blocking(
            self.db.table("team_members").select("user_id")
            .eq("team_id", team_id).eq("user_id", invitee_id).execute
        )).data
        if existing:
            raise TeamConflictError("This user is already a member of the team.")

        try:
            created = (await run_blocking(
                self.db.table("team_invitations").insert({
                    "team_id": team_id,
                    "invited_user_id": invitee_id,
                    "invited_by": invited_by,
                    "role": role,
                }).execute
            )).data
        except UniqueViolation:
            # The partial unique index allows one pending invitation per person
            # per team. Checking first and then inserting would race; letting
            # the index decide does not.
            raise TeamConflictError("This user already has a pending invitation to this team.")

        invitation = created[0]
        from app.services.organization_service import OrganizationService
        await OrganizationService().log_audit_event(
            team["organization_id"],
            invited_by,
            "team_invitation_created",
            details={
                "team_id": team_id,
                "invitation_id": invitation["id"],
                "invited_user_id": invitee_id,
                "role": role,
            },
        )
        logger.info(f"Invited user {invitee_id} to team {team_id}")
        return (await self._hydrate_invitations([invitation]))[0]

    async def list_user_invitations(self, user_id: str) -> List[Dict[str, Any]]:
        """The user's own pending invitations, newest first."""
        rows = (await run_blocking(
            self.db.table("team_invitations").select("*")
            .eq("invited_user_id", user_id).eq("status", "pending")
            .order("created_at", desc=True).execute
        )).data or []
        return await self._hydrate_invitations(rows)

    async def list_team_invitations(self, team_id: str, user_id: str) -> List[Dict[str, Any]]:
        """A team's pending invitations, for whoever may manage its members."""
        team = await self._require_team_admin(
            team_id, user_id, "You don't have permission to view this team's invitations."
        )
        rows = (await run_blocking(
            self.db.table("team_invitations").select("*")
            .eq("team_id", team["id"]).eq("status", "pending")
            .order("created_at", desc=True).execute
        )).data or []
        return await self._hydrate_invitations(rows)

    async def accept_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """
        Accept an invitation addressed to user_id, creating the membership.

        Only the invited user can accept. The status flips pending -> accepted
        in a single conditional UPDATE, so of two concurrent accepts (or an
        accept racing a revoke) exactly one wins, and only the winner creates
        the membership; UNIQUE(team_id, user_id) on team_members backs that up.
        The two writes are separate statements - the query layer has no
        multi-statement transactions - so if the membership insert fails the
        invitation is put back to pending rather than left "accepted" with no
        membership behind it.
        """
        invitation = await self._respond(invitation_id, user_id, "accepted")

        try:
            await run_blocking(
                self._insert_team_member,
                invitation["team_id"], user_id, invitation["role"],
            )
        except UniqueViolation:
            # Already a member (e.g. they created the team themselves after
            # being invited). The invitation is answered; there is nothing to add.
            logger.info(f"User {user_id} accepted an invitation to a team they already belong to")
        except Exception:
            await run_blocking(
                self.db.table("team_invitations")
                .update({"status": "pending", "responded_at": None})
                .eq("id", invitation_id).eq("status", "accepted").execute
            )
            raise

        await self._log_response(invitation, user_id, "team_invitation_accepted")
        logger.info(f"User {user_id} joined team {invitation['team_id']} by invitation")
        return (await self._hydrate_invitations([invitation]))[0]

    async def decline_invitation(self, invitation_id: str, user_id: str) -> Dict[str, Any]:
        """Decline an invitation addressed to user_id. Only the invitee can."""
        invitation = await self._respond(invitation_id, user_id, "declined")
        await self._log_response(invitation, user_id, "team_invitation_declined")
        return (await self._hydrate_invitations([invitation]))[0]

    async def revoke_invitation(
        self, team_id: str, invitation_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Withdraw a pending invitation. Requires administering the team."""
        team = await self._require_team_admin(
            team_id, user_id, "You don't have permission to revoke this team's invitations."
        )

        revoked = (await run_blocking(
            self.db.table("team_invitations")
            .update({"status": "revoked", "responded_at": _now()})
            .eq("id", invitation_id).eq("team_id", team_id).eq("status", "pending").execute
        )).data
        if not revoked:
            existing = (await run_blocking(
                self.db.table("team_invitations").select("status")
                .eq("id", invitation_id).eq("team_id", team_id).execute
            )).data
            if not existing:
                raise TeamNotFoundError("Invitation not found.")
            raise TeamConflictError(f"This invitation has already been {existing[0]['status']}.")

        invitation = revoked[0]
        from app.services.organization_service import OrganizationService
        await OrganizationService().log_audit_event(
            team["organization_id"],
            user_id,
            "team_invitation_revoked",
            details={
                "team_id": team_id,
                "invitation_id": invitation_id,
                "invited_user_id": invitation["invited_user_id"],
            },
        )
        return (await self._hydrate_invitations([invitation]))[0]

    async def _require_team_admin(self, team_id: str, user_id: str, denied: str) -> Dict[str, Any]:
        team = await run_blocking(self._get_team_row, team_id)
        if not team:
            raise TeamNotFoundError("Team not found.")
        if not await self._is_team_admin(team, user_id):
            raise TeamPermissionError(denied)
        return team

    async def _respond(self, invitation_id: str, user_id: str, status: str) -> Dict[str, Any]:
        """
        Move the caller's own pending invitation to `status`, or raise.

        The UPDATE is filtered on invited_user_id, so nobody can answer someone
        else's invitation, and a missing row and another person's row both read
        as "not found" - the response does not confirm that it exists.
        """
        updated = (await run_blocking(
            self.db.table("team_invitations")
            .update({"status": status, "responded_at": _now()})
            .eq("id", invitation_id).eq("invited_user_id", user_id).eq("status", "pending").execute
        )).data
        if updated:
            return updated[0]

        existing = (await run_blocking(
            self.db.table("team_invitations").select("status")
            .eq("id", invitation_id).eq("invited_user_id", user_id).execute
        )).data
        if not existing:
            raise TeamNotFoundError("Invitation not found.")
        raise TeamConflictError(f"This invitation has already been {existing[0]['status']}.")

    async def _log_response(self, invitation: Dict[str, Any], user_id: str, action: str) -> None:
        team = await run_blocking(self._get_team_row, invitation["team_id"])
        if not team:
            return
        from app.services.organization_service import OrganizationService
        await OrganizationService().log_audit_event(
            team["organization_id"],
            user_id,
            action,
            details={
                "team_id": invitation["team_id"],
                "invitation_id": invitation["id"],
                "role": invitation["role"],
            },
        )

    async def _hydrate_invitations(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Attach what a person needs to decide on an invitation.

        Each invitation gains `team` {id, name, organization_id}, `organization`
        {id, name}, `invitee` and `inviter` (TEAM_MEMBER_USER_COLUMNS; inviter is
        None once that account is deleted). Three queries however many
        invitations there are.

        The invitee sees the team, organization and inviter BEFORE becoming a
        member - that is the point of asking for consent - so these lookups are
        deliberately not gated on organization access. They return names and
        public profile columns only.
        """
        if not rows:
            return []

        team_ids = sorted({r["team_id"] for r in rows})
        teams = {
            t["id"]: t for t in (await run_blocking(
                self.db.table("teams").select("id, name, organization_id")
                .in_("id", team_ids).execute
            )).data or []
        }

        org_ids = sorted({t["organization_id"] for t in teams.values()})
        orgs = {
            o["id"]: o for o in (await run_blocking(
                self.db.table("organizations").select("id, name")
                .in_("id", org_ids).execute
            )).data or []
        }

        people_ids = sorted(
            {r["invited_user_id"] for r in rows}
            | {r["invited_by"] for r in rows if r.get("invited_by")}
        )
        people = {
            u["id"]: u for u in (await run_blocking(
                self.db.table("users").select(TEAM_MEMBER_USER_COLUMNS)
                .in_("id", people_ids).execute
            )).data or []
        }

        hydrated = []
        for row in rows:
            team = teams.get(row["team_id"])
            hydrated.append({
                **row,
                "team": team,
                "organization": orgs.get(team["organization_id"]) if team else None,
                "invitee": people.get(row["invited_user_id"]),
                "inviter": people.get(row.get("invited_by")),
            })
        return hydrated

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

            (await run_blocking(self.db.table("team_members").delete().eq("team_id", team_id).eq("user_id", user_id).execute))
            
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
            result = (await run_blocking(self.db.table("team_members")\
                .select(f"team_id, user_id, role, users({TEAM_MEMBER_USER_COLUMNS})")\
                .eq("team_id", team_id)\
                .execute))
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
            repo_result = (await run_blocking(self.db.table("repositories")\
                .select("id, user_id")\
                .eq("id", repository_id)\
                .eq("user_id", assigned_by)\
                .execute))

            if not repo_result.data:
                logger.warning(
                    f"User {assigned_by[:8]}... attempted to assign repository "
                    f"{repository_id} they do not own"
                )
                return False

            # Check if already assigned
            existing = (await run_blocking(self.db.table("repository_assignments").select("*").eq("repository_id", repository_id).eq("team_id", team_id).execute))
            if existing.data:
                return True  # Already assigned
            
            (await run_blocking(self.db.table("repository_assignments").insert({
                "repository_id": repository_id,
                "team_id": team_id,
                "assigned_by": assigned_by
            }).execute))
            
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
        """Repositories assigned to a team, for people on it (see is_on_team)."""
        try:
            team = await self.get_team(team_id, user_id)
            if not team or not await self.is_on_team(team, user_id):
                return []
            
            assignments_result = (await run_blocking(self.db.table("repository_assignments").select("repository_id").eq("team_id", team_id).execute))
            repo_ids = [a["repository_id"] for a in (assignments_result.data or [])]
            
            if not repo_ids:
                return []
            
            repos_result = (await run_blocking(self.db.table("repositories").select("*").in_("id", repo_ids).execute))
            return repos_result.data or []
        except Exception as e:
            logger.error(f"Error getting team repositories: {e}")
            return []
