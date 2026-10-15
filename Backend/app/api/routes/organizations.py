from fastapi import APIRouter, HTTPException, status, Depends
from loguru import logger
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from app.api.dependencies import get_current_user
from app.services.organization_service import OrganizationService
from app.api.errors import safe_detail

router = APIRouter(prefix="/organizations", tags=["Organizations"])


# No plan_type: every organization is on the free plan until billing exists.
# It was client-writable, so anyone could mark their organization "enterprise".
# A client still sending it has the field ignored.
class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: OrganizationCreate,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new organization."""
    try:
        service = OrganizationService()
        organization = await service.create_organization(
            name=org_data.name.strip(),
            owner_id=current_user["id"],
        )

        if not organization:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create organization"
            )

        return organization
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("", response_model=List[Dict[str, Any]])
async def list_organizations(
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """List all organizations the user belongs to."""
    try:
        service = OrganizationService()
        organizations = await service.list_user_organizations(current_user["id"])
        return organizations
    except Exception as e:
        logger.error(f"Error listing organizations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/{org_id}", response_model=Dict[str, Any])
async def get_organization(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get organization by ID."""
    try:
        service = OrganizationService()
        organization = await service.get_organization(org_id, current_user["id"])
        
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )
        
        return organization
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting organization: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.put("/{org_id}", response_model=Dict[str, Any])
async def update_organization(
    org_id: str,
    org_data: OrganizationUpdate,
    current_user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Update organization (only owner can update)."""
    try:
        service = OrganizationService()
        updates = {k: v.strip() for k, v in org_data.model_dump().items() if v is not None}
        
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No updates provided"
            )
        
        organization = await service.update_organization(
            org_id=org_id,
            owner_id=current_user["id"],
            updates=updates
        )
        
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found or you don't have permission"
            )
        
        return organization
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating organization: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete organization (only owner can delete)."""
    try:
        service = OrganizationService()
        success = await service.delete_organization(org_id, current_user["id"])
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found or you don't have permission"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting organization: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )


@router.get("/{org_id}/repositories", response_model=List[Dict[str, Any]])
async def get_organization_repositories(
    org_id: str,
    current_user: dict = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get all repositories assigned to teams in this organization."""
    try:
        service = OrganizationService()
        repositories = await service.get_organization_repositories(org_id, current_user["id"])
        return repositories
    except Exception as e:
        logger.error(f"Error getting organization repositories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
        )
