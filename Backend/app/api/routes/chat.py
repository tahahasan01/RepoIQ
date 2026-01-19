from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import ChatMessageRequest
from app.services.chat_service import ChatService
from app.services.repository_service import RepositoryService
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/repositories/{repo_id}/message")
async def send_chat_message(
    repo_id: str,
    message_data: ChatMessageRequest,
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    chat_service = ChatService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        response = await chat_service.send_message(
            repo_id=repo_id,
            user_id=current_user["id"],
            message=message_data.message,
            context_files=message_data.context_files
        )
        
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/repositories/{repo_id}/history")
async def get_chat_history(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    chat_service = ChatService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    try:
        history = await chat_service.get_chat_history(repo_id, current_user["id"])
        return {"messages": history}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete("/repositories/{repo_id}/history")
async def clear_chat_history(
    repo_id: str,
    current_user: dict = Depends(get_current_user)
):
    repo_service = RepositoryService()
    chat_service = ChatService()
    
    repo = await repo_service.get_repository(repo_id, current_user["id"])
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found"
        )
    
    success = await chat_service.clear_chat_history(repo_id, current_user["id"])
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear chat history"
        )
    
    return {"message": "Chat history cleared successfully"}
