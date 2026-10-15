from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import anthropic
from app.core.config import get_settings
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.services.llm_budget import enforce_spend_budget, record_spend

settings = get_settings()
logger = get_logger(__name__)


# Server-side refusal fallback: a declined request is re-run on the model
# Anthropic recommends for that refusal category, inside the same call.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"
# OAuth access tokens (ANTHROPIC_AUTH_TOKEN) are only accepted on /v1/messages
# with this beta header. Sending `betas=` replaces the anthropic-beta header,
# so it has to be in the per-request list rather than in default_headers.
_OAUTH_BETA = "oauth-2025-04-20"

_shared_claude_client: Optional[anthropic.Anthropic] = None


class LLMNotConfigured(Exception):
    """Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set."""


def get_claude_client() -> anthropic.Anthropic:
    """
    One Anthropic client for the process.

    PERF: BaseAgent.__init__ used to construct an HTTP client per instance and
    never close it. AgentOrchestrator builds six agents, and one orchestrator is
    created per analysis, so every analysis leaked six connection pools and their
    file descriptors. A single shared client also lets connections be reused
    across agents instead of renegotiating TLS for each one.

    The client is synchronous and called through the threadpool. An async
    client would bind its connection pool to one event loop, and Celery tasks
    each run their own loop via asyncio.run().
    """
    global _shared_claude_client
    if _shared_claude_client is None:
        # Pass exactly one credential. With both set the SDK sends both headers
        # and the API rejects the request.
        if settings.ANTHROPIC_API_KEY:
            credentials = {"api_key": settings.ANTHROPIC_API_KEY}
        elif settings.ANTHROPIC_AUTH_TOKEN:
            credentials = {"auth_token": settings.ANTHROPIC_AUTH_TOKEN}
        else:
            raise LLMNotConfigured(
                "Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) to run AI analysis"
            )
        _shared_claude_client = anthropic.Anthropic(
            **credentials,
            # Requests stream, so this bounds the gap between chunks rather than
            # the whole completion; the orchestrator's 10-minute budget bounds
            # the analysis as a whole.
            timeout=anthropic.Timeout(settings.ANTHROPIC_TIMEOUT_SECONDS, connect=10.0),
            max_retries=2,
        )
    return _shared_claude_client


class LLMResponseTruncated(Exception):
    """The model hit max_tokens mid-answer, so the response is incomplete."""


class LLMRefusal(Exception):
    """The model (and any fallback) declined the request."""


def _split_system(messages: List[Dict[str, str]]):
    """
    Callers build chat-style message lists with role="system" entries. The
    Messages API takes the system prompt as a separate parameter, so lift those
    out and keep the user/assistant turns in order.
    """
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    turns = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] != "system"
    ]
    return "\n\n".join(system_parts), turns


class BaseAgent(ABC):
    def __init__(self):
        # Resolved on first call, so a missing credential fails the AI review
        # with a reason rather than crashing whatever constructed the agent.
        self.client: Optional[anthropic.Anthropic] = None
        self.model = settings.ANTHROPIC_MODEL
        self.max_tokens = settings.LLM_MAX_OUTPUT_TOKENS

    @abstractmethod
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_agent_type(self) -> str:
        pass

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Call Claude and return the response text.

        PERF: the client is synchronous, so this goes through the threadpool.
        Called directly it blocked the event loop for the entire completion,
        which also meant the orchestrator's asyncio.gather() over several agents
        ran them strictly one after another.

        json_schema constrains the response to that schema (structured
        outputs). Callers that parse the response should pass one: the previous
        approach of asking the model nicely and then hunting for ``` fences
        failed whenever the model wrapped, prefixed or truncated its answer, and
        the failure was swallowed into an empty result.

        Raises LLMResponseTruncated when the model stopped at max_tokens. That
        used to surface as a JSONDecodeError caught into `{"issues": []}` - i.e.
        a batch that found real problems silently reported none. Raises
        LLMRefusal when the request was declined, for the same reason: a refusal
        has no findings in it, and must not read as a clean result.
        """
        if user_id:
            # Cost control: a single user could previously drive unbounded spend.
            await enforce_spend_budget(user_id)

        system, turns = _split_system(messages)
        output_config: Dict[str, Any] = {"effort": settings.ANTHROPIC_EFFORT}
        if json_schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}

        betas = []
        if settings.ANTHROPIC_REFUSAL_FALLBACK:
            betas.append(_FALLBACK_BETA)
        if not settings.ANTHROPIC_API_KEY and settings.ANTHROPIC_AUTH_TOKEN:
            betas.append(_OAUTH_BETA)

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": turns,
            "output_config": output_config,
            "betas": betas,
        }
        if system:
            kwargs["system"] = system
        if settings.ANTHROPIC_REFUSAL_FALLBACK:
            kwargs["fallbacks"] = "default"

        client = self.client or get_claude_client()

        def _complete():
            # Streamed so a long completion is never cut off by an HTTP timeout.
            with client.beta.messages.stream(**kwargs) as stream:
                return stream.get_final_message()

        try:
            response = await run_blocking(_complete)
        except anthropic.APIError as e:
            logger.error(f"LLM call failed: {type(e).__name__}: {e}")
            raise

        if user_id and getattr(response, "usage", None):
            record_spend(
                user_id,
                (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0),
            )

        if response.stop_reason == "max_tokens":
            logger.error(
                f"LLM response truncated at max_tokens={self.max_tokens}; "
                "raise LLM_MAX_OUTPUT_TOKENS or reduce the batch size"
            )
            raise LLMResponseTruncated(
                f"Model stopped at the {self.max_tokens} token output limit"
            )
        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None) if details else None
            logger.warning(f"LLM declined the request (category={category})")
            raise LLMRefusal(f"Model declined the request (category={category})")

        return "".join(b.text for b in response.content if b.type == "text")
    
    def calculate_score(self, issues: List[Dict[str, Any]]) -> int:
        if not issues:
            return 100
        
        severity_weights = {
            "critical": 20,
            "high": 10,
            "medium": 5,
            "low": 2,
            "info": 1
        }
        
        total_deduction = sum(severity_weights.get(issue.get("severity", "low"), 1) for issue in issues)
        score = max(0, 100 - min(total_deduction, 100))
        return score
    
    def extract_issues_from_response(self, response: str, file_path: str) -> List[Dict[str, Any]]:
        issues = []
        
        try:
            import json
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                parsed = json.loads(json_str)
                
                if isinstance(parsed, dict) and "issues" in parsed:
                    issues = parsed["issues"]
                elif isinstance(parsed, list):
                    issues = parsed
            
            for issue in issues:
                if "file_path" not in issue:
                    issue["file_path"] = file_path
                if "agent_type" not in issue:
                    issue["agent_type"] = self.get_agent_type()
                    
        except Exception as e:
            logger.warning(f"Failed to parse structured response: {str(e)}")
        
        return issues
