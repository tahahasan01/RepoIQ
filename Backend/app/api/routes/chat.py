from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas import ChatMessageRequest
from app.services.chat_service import ChatService
from app.services.repository_service import RepositoryService
from app.api.dependencies import get_current_user
from app.api.errors import safe_detail

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
    
    # Files to discuss pass the same checks as the Files page: no traversal, no
    # .env / keys. Reading them needs a GitHub token; without one the chat
    # still answers from the analysis context instead of failing.
    from app.api.routes.github import validate_file_path
    from app.services.github_token import GitHubTokenUnavailable, resolve_github_token_for_user

    context_files = [validate_file_path(p) for p in (message_data.context_files or [])]
    github_token = None
    if context_files:
        try:
            github_token = await resolve_github_token_for_user(current_user["id"])
        except GitHubTokenUnavailable:
            github_token = None

    try:
        return await chat_service.send_message(
            repo=repo,
            user_id=current_user["id"],
            message=message_data.message,
            context_files=context_files,
            github_token=github_token,
        )
    except HTTPException:
        raise
    except Exception as e:
        from app.services.llm_budget import LLMBudgetExceeded

        if isinstance(e, LLMBudgetExceeded):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily AI usage limit reached. It resets within 24 hours.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
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
        history = await chat_service.get_chat_history(repo["id"], current_user["id"])
        return {"messages": history}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=safe_detail(e)
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
    
    success = await chat_service.clear_chat_history(repo["id"], current_user["id"])
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear chat history"
        )
    
    return {"message": "Chat history cleared successfully"}
