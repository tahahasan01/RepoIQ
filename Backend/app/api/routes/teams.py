from fastapi import APIRouter, HTTPException, status, Depends
from loguru import logger
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.api.dependencies import get_current_user
from app.services.team_service import TeamService

router = APIRouter(prefix="/teams", tags=["Teams"])


class TeamCreate(BaseModel):
    organization_id: str
    name: str
    manager_id: Optional[str] = None
    description: Optional[str] = None


class TeamMemberAdd(BaseModel):
    user_id: str  # Can be UUID, email, username, or name
    role: str = "member"


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
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
        )


@router.post("/{team_id}/members", status_code=status.HTTP_201_CREATED)
async def add_team_member(
    team_id: str,
    member_data: TeamMemberAdd,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Add a member to a team."""
    try:
        service = TeamService()
        success = await service.add_team_member(
            team_id=team_id,
            user_identifier=member_data.user_id,
            role=member_data.role,
            added_by=current_user["id"]
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to add team member or you don't have permission"
            )
        
        # Get the actual user_id that was found (service already looked it up)
        user = await service.find_user_by_identifier(member_data.user_id)
        actual_user_id = user["id"] if user else member_data.user_id
        
        return {"success": True, "team_id": team_id, "user_id": actual_user_id, "user": user}
    except ValueError as e:
        # Validation errors (user not found, etc.)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding team member: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
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
            detail=str(e)
        )
