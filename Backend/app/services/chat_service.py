from typing import List, Dict, Any, Optional
from datetime import datetime
from app.db.supabase import get_service_db
from app.agents.conversational_agent import ConversationalAgent
from app.core.logging import get_logger

logger = get_logger(__name__)


class ChatService:
    def __init__(self):
        self.db = get_service_db()
        self.agent = ConversationalAgent()
    
    async def send_message(
        self,
        repo_id: str,
        user_id: str,
        message: str,
        context_files: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        try:
            user_message = {
                "repository_id": repo_id,
                "user_id": user_id,
                "role": "user",
                "content": message,
                "context_files": context_files or []
            }
            
            self.db.table("chat_messages").insert(user_message).execute()
            
            history = await self.get_chat_history(repo_id, user_id, limit=10)
            
            formatted_history = [
                {"role": msg["role"], "content": msg["content"]}
                for msg in history[:-1]
            ]
            
            codebase_context = await self._build_codebase_context(repo_id)
            
            response = await self.agent.chat(
                message=message,
                codebase_context=codebase_context,
                conversation_history=formatted_history
            )
            
            assistant_message = {
                "repository_id": repo_id,
                "user_id": user_id,
                "role": "assistant",
                "content": response
            }
            
            result = self.db.table("chat_messages").insert(assistant_message).execute()
            
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Send message failed: {str(e)}")
            raise
    
    async def get_chat_history(
        self,
        repo_id: str,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        try:
            result = self.db.table("chat_messages")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .eq("user_id", user_id)\
                .order("created_at")\
                .limit(limit)\
                .execute()
            
            return result.data
        except Exception as e:
            logger.error(f"Get chat history failed: {str(e)}")
            raise
    
    async def clear_chat_history(self, repo_id: str, user_id: str) -> bool:
        try:
            self.db.table("chat_messages")\
                .delete()\
                .eq("repository_id", repo_id)\
                .eq("user_id", user_id)\
                .execute()
            
            return True
        except Exception as e:
            logger.error(f"Clear chat history failed: {str(e)}")
            return False
    
    async def _build_codebase_context(self, repo_id: str) -> Dict[str, Any]:
        try:
            repo_result = self.db.table("repositories")\
                .select("*")\
                .eq("id", repo_id)\
                .single()\
                .execute()
            
            analysis_result = self.db.table("analysis_results")\
                .select("*")\
                .eq("repository_id", repo_id)\
                .order("created_at", desc=True)\
                .limit(1)\
                .execute()
            
            context = {
                "repo_name": repo_result.data["name"] if repo_result.data else "Unknown",
                "language": repo_result.data.get("language") if repo_result.data else "Multiple",
                "file_count": 0
            }
            
            if analysis_result.data:
                latest_analysis = analysis_result.data[0]
                context["recent_analysis"] = {
                    "security_score": latest_analysis.get("security_score"),
                    "quality_score": latest_analysis.get("quality_score"),
                    "architecture_score": latest_analysis.get("architecture_score"),
                    "total_issues": latest_analysis.get("total_issues", 0)
                }
            
            return context
        except Exception as e:
            logger.error(f"Build context failed: {str(e)}")
            return {}
