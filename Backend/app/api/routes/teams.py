"""
Teams, team membership, and team invitations.

Joining a team takes the invited person's consent: POST /teams/{id}/members
creates an invitation, and the membership exists only once the invitee
accepts it (see TeamService.invite_team_member for why).

Every invitation endpoint returns invitations in one shape:

    {
      "id": "<uuid>",
      "team_id": "<uuid>",
      "invited_user_id": "<uuid>",
      "invited_by": "<uuid>" | null,          # null once the inviter is deleted
      "role": "member" | "lead" | "manager",
      "status": "pending" | "accepted" | "declined" | "revoked",
      "created_at": "<ISO 8601>",
      "responded_at": "<ISO 8601>" | null,
      "team": {"id", "name", "organization_id"} | null,
      "organization": {"id", "name"} | null,
      "invitee": {"id", "full_name", "avatar_url", "github_username"} | null,
      "inviter": {"id", "full_name", "avatar_url", "github_username"} | null
    }

Errors are {"detail": "<sentence safe to show the user>"} with 400 (bad input),
403 (not allowed to manage this team), 404 (no such team or invitation - also
returned for someone else's invitation, so ids cannot be probed), 409 (already
a member, already invited, or invitation already answered), 422 (malformed id).
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends
from loguru import logger
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.api.dependencies import get_current_user
from app.services.team_service import TeamActionError, TeamService
from app.api.errors import safe_detail

router = APIRouter(prefix="/teams", tags=["Teams"])


class TeamCreate(BaseModel):
    organization_id: str
    name: str
    manager_id: Optional[str] = None
    description: Optional[str] = None


class TeamMemberAdd(BaseModel):
    user_id: str  # Can be UUID, email, username, or name
    role: str = "member"


def _team_action_error(e: TeamActionError) -> HTTPException:
    # TeamActionError.detail is an authored sentence, never lower-layer text.
    return HTTPException(status_code=e.status_code, detail=e.detail)


# -- invitations addressed to the current user ---------------------------------
#
# Registered BEFORE "/{team_id}" on purpose: Starlette matches routes in order,
# and "/{team_id}" would otherwise capture "/invitations" as a team id.

@router.get("/invitations", response_model=List[Dict[str, Any]])
async def list_my_invitations(
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    The current user's PENDING team invitations, newest first.

    Response 200: a list of invitations (shape in the module docstring), each
    with `team`, `organization` and `inviter` filled in so the invitee can see
    who is asking them to join what.
    """
    try:
        return await TeamService().list_user_invitations(current_user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to load invitations", context="list_my_invitations"),
        )


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Accept an invitation addressed to the current user and join the team.

    Request: no body.
    Response 200: {"invitation": <invitation, status "accepted">,
                   "membership": {"team_id", "user_id", "role"}}
    404 if the invitation does not exist or is addressed to someone else;
    409 if it was already accepted, declined or revoked.
    """
    try:
        invitation = await TeamService().accept_invitation(str(invitation_id), current_user["id"])
        return {
            "invitation": invitation,
            "membership": {
                "team_id": invitation["team_id"],
                "user_id": current_user["id"],
                "role": invitation["role"],
            },
        }
    except TeamActionError as e:
        raise _team_action_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to accept the invitation", context="accept_invitation"),
        )


@router.post("/invitations/{invitation_id}/decline")
async def decline_invitation(
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Decline an invitation addressed to the current user.

    Request: no body.
    Response 200: {"invitation": <invitation, status "declined">}
    404 / 409 as for accept. The inviter may invite again later; a declined
    invitation does not block a new one.
    """
    try:
        invitation = await TeamService().decline_invitation(str(invitation_id), current_user["id"])
        return {"invitation": invitation}
    except TeamActionError as e:
        raise _team_action_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to decline the invitation", context="decline_invitation"),
        )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new team."""
    try:
        service = TeamService()
        team = await service.create_team(
            organization_id=team_data.organization_id,
            name=team_data.name,
            manager_id=team_data.manager_id,
            description=team_data.description,
            creator_id=current_user["id"]
        )
        
        if not team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create team or you don't have access to the organization"
            )
        
        return team
    except ValueError as e:
        # Duplicate name or validation error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating team: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/organization/{org_id}", response_model=List[Dict[str, Any]])
async def list_organization_teams(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all teams in an organization."""
    try:
        service = TeamService()
        teams = await service.list_organization_teams(org_id, current_user["id"])
        return teams
    except Exception as e:
        logger.error(f"Error listing teams: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/{team_id}", response_model=Dict[str, Any])
async def get_team(
    team_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get team by ID."""
    try:
        service = TeamService()
        team = await service.get_team(team_id, current_user["id"])
        
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )
        
        return team
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting team: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a team (only organization owner can delete)."""
    try:
        service = TeamService()
        success = await service.delete_team(team_id, current_user["id"])
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to delete team or you don't have permission"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting team: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_team_member(
    team_id: str,
    member_data: TeamMemberAdd,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Invite a user to the team. This does NOT make them a member.

    The user joins only when they accept (POST /teams/invitations/{id}/accept).
    Requires administering the team: the organization owner or the team's
    manager.

    Request:  {"user_id": "<uuid | email | GitHub username | full name>",
               "role": "member" | "lead" | "manager"}   (role defaults to "member")
    Response 201: {"invitation": <invitation, see module docstring>, "status": "pending"}
    400 unknown/ambiguous user, invalid role, or inviting yourself;
    403 not allowed to manage this team; 404 no such team;
    409 already a member, or already has a pending invitation to this team.
    """
    try:
        invitation = await TeamService().invite_team_member(
            team_id=team_id,
            user_identifier=member_data.user_id,
            role=member_data.role,
            invited_by=current_user["id"],
        )
        return {"invitation": invitation, "status": invitation["status"]}
    except TeamActionError as e:
        raise _team_action_error(e)
    except ValueError as e:
        # Validation errors (user not found, bad role, self-invite): authored
        # messages from the service, safe to show.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error inviting team member: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to invite the user")
        )


@router.get("/{team_id}/invitations", response_model=List[Dict[str, Any]])
async def list_team_invitations(
    team_id: UUID,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    The team's PENDING invitations, newest first, for whoever may manage its
    members (organization owner or team manager).

    Response 200: a list of invitations (module docstring), with `invitee` and
    `inviter` filled in. 403 if not allowed to manage this team; 404 no team.
    """
    try:
        return await TeamService().list_team_invitations(str(team_id), current_user["id"])
    except TeamActionError as e:
        raise _team_action_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to load invitations", context="list_team_invitations"),
        )


@router.delete("/{team_id}/invitations/{invitation_id}")
async def revoke_invitation(
    team_id: UUID,
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Withdraw a pending invitation. Same permission as inviting.

    Response 200: {"invitation": <invitation, status "revoked">}
    403 not allowed to manage this team; 404 no such team, or no such
    invitation on this team; 409 the invitation was already answered.
    """
    try:
        invitation = await TeamService().revoke_invitation(
            str(team_id), str(invitation_id), current_user["id"]
        )
        return {"invitation": invitation}
    except TeamActionError as e:
        raise _team_action_error(e)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e, "Failed to revoke the invitation", context="revoke_invitation"),
        )


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a member from a team."""
    try:
        service = TeamService()
        success = await service.remove_team_member(team_id, user_id, current_user["id"])
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to remove team member or you don't have permission"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing team member: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/{team_id}/members", response_model=List[Dict[str, Any]])
async def get_team_members(
    team_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all members of a team."""
    try:
        service = TeamService()
        members = await service.get_team_members(team_id, current_user["id"])
        return members
    except Exception as e:
        logger.error(f"Error getting team members: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.post("/{team_id}/repositories/{repo_id}", status_code=status.HTTP_201_CREATED)
async def assign_repository_to_team(
    team_id: str,
    repo_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Assign a repository to a team."""
    try:
        service = TeamService()
        success = await service.assign_repository_to_team(
            repository_id=repo_id,
            team_id=team_id,
            assigned_by=current_user["id"]
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to assign repository or you don't have permission"
            )
        
        return {"success": True, "team_id": team_id, "repository_id": repo_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning repository to team: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/{team_id}/repositories", response_model=List[Dict[str, Any]])
async def get_team_repositories(
    team_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all repositories assigned to a team."""
    try:
        service = TeamService()
        repositories = await service.get_team_repositories(team_id, current_user["id"])
        return repositories
    except Exception as e:
        logger.error(f"Error getting team repositories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )
