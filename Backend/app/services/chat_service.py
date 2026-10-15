from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from app.db.postgres import get_service_db
from app.agents.conversational_agent import ConversationalAgent
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

logger = get_logger(__name__)

# How much prior conversation the model sees, and how much of each referenced
# file. Bounded so one long chat or one huge file cannot blow the context.
HISTORY_TURNS = 20
MAX_CONTEXT_FILES = 3
MAX_FILE_CHARS = 20_000
TOP_FINDINGS = 15

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


class ChatService:
    def __init__(self):
        self.db = get_service_db()
        self.agent = ConversationalAgent()

    async def send_message(
        self,
        repo: Dict[str, Any],
        user_id: str,
        message: str,
        context_files: Optional[List[str]] = None,
        github_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Answer a question about a repository the caller owns.

        Both turns are written only once the answer exists. The question used to
        be stored first, so a failed model call left an unanswered message in the
        history that every later request then replayed to the model.
        """
        repo_id = repo["id"]
        history = await self.get_chat_history(repo_id, user_id, limit=HISTORY_TURNS)
        context = await self._build_codebase_context(repo, user_id, context_files or [], github_token)

        response = await self.agent.chat(
            message=message,
            codebase_context=context,
            conversation_history=[{"role": m["role"], "content": m["content"]} for m in history],
            user_id=user_id,
        )

        # Explicit timestamps: both rows are written in one statement, and
        # NOW() is per transaction, so with the default they tie and history
        # ordering between a question and its answer is arbitrary.
        asked_at = datetime.now(timezone.utc)
        rows = [
            {
                "repository_id": repo_id,
                "user_id": user_id,
                "role": "user",
                "content": message,
                "context_files": context_files or [],
                "created_at": asked_at.isoformat(),
            },
            {
                "repository_id": repo_id,
                "user_id": user_id,
                "role": "assistant",
                "content": response,
                "created_at": (asked_at + timedelta(milliseconds=1)).isoformat(),
            },
        ]
        result = await run_blocking(self.db.table("chat_messages").insert(rows).execute)
        return (result.data or [None, None])[-1]

    async def get_chat_history(
        self,
        repo_id: str,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        The most recent `limit` messages, oldest first.

        This used to order ascending and then limit, which returns the OLDEST
        messages - past the limit, the model only ever saw the start of the
        conversation and never the turns just before the new question.
        """
        result = await run_blocking(
            self.db.table("chat_messages")
            .select("id, role, content, context_files, created_at")
            .eq("repository_id", repo_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute
        )
        return list(reversed(result.data or []))

    async def clear_chat_history(self, repo_id: str, user_id: str) -> bool:
        try:
            await run_blocking(
                self.db.table("chat_messages")
                .delete()
                .eq("repository_id", repo_id)
                .eq("user_id", user_id)
                .execute
            )
            return True
        except Exception as e:
            logger.error(f"Clear chat history failed: {str(e)}")
            return False

    async def _build_codebase_context(
        self,
        repo: Dict[str, Any],
        user_id: str,
        context_files: List[str],
        github_token: Optional[str],
    ) -> Dict[str, Any]:
        context: Dict[str, Any] = {
            "repo_name": repo.get("full_name") or repo.get("name"),
            "language": repo.get("language") or "Multiple",
        }

        latest = (await run_blocking(
            self.db.table("analysis_results")
            .select("id, overall_score, security_score, quality_score, architecture_score, "
                    "documentation_score, total_issues, files_analyzed, files_eligible, completed_at")
            .eq("repository_id", repo["id"])
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(1)
            .execute
        )).data
        if latest:
            analysis = latest[0]
            context["recent_analysis"] = analysis
            issues = (await run_blocking(
                self.db.table("issues")
                .select("severity, category, file_path, line_number, description")
                .eq("analysis_id", analysis["id"])
                .eq("fixed", False)
                .execute
            )).data or []
            issues.sort(key=lambda i: _SEVERITY_ORDER.get(i.get("severity"), 9))
            context["top_findings"] = issues[:TOP_FINDINGS]

        if context_files and github_token:
            from app.services.repository_service import RepositoryService

            repo_service = RepositoryService()
            files = []
            for path in context_files[:MAX_CONTEXT_FILES]:
                try:
                    content = await repo_service.get_file_content(repo["id"], user_id, path, github_token)
                except Exception as e:
                    logger.warning(f"Chat could not read {path}: {type(e).__name__}")
                    continue
                if content:
                    files.append({"path": path, "content": content[:MAX_FILE_CHARS],
                                  "truncated": len(content) > MAX_FILE_CHARS})
            context["files"] = files

        return context
