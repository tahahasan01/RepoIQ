from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from openai import OpenAI
import httpx
from app.core.config import get_settings
from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.services.llm_budget import enforce_spend_budget, record_spend

settings = get_settings()
logger = get_logger(__name__)


_shared_openai_client: Optional[OpenAI] = None


def get_openai_client() -> OpenAI:
    """
    One OpenAI client for the process.

    PERF: BaseAgent.__init__ used to construct `httpx.Client()` per instance and
    never close it. AgentOrchestrator builds six agents, and one orchestrator is
    created per analysis, so every analysis leaked six connection pools and their
    file descriptors. A single shared client also lets connections be reused
    across agents instead of renegotiating TLS for each one.
    """
    global _shared_openai_client
    if _shared_openai_client is None:
        _shared_openai_client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            # An unbounded LLM call on a request path is an outage waiting to
            # happen; the orchestrator's own 10-minute budget is far too coarse
            # to be the only limit.
            timeout=httpx.Timeout(60.0, connect=10.0),
            max_retries=2,
        )
    return _shared_openai_client


class LLMResponseTruncated(Exception):
    """The model hit max_tokens mid-answer, so the response is incomplete."""


class BaseAgent(ABC):
    def __init__(self):
        self.client = get_openai_client()
        self.model = settings.OPENAI_MODEL
        self.temperature = 0.3  # Lower temperature for more consistent responses
        self.max_tokens = settings.OPENAI_MAX_OUTPUT_TOKENS

    @abstractmethod
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_agent_type(self) -> str:
        pass

    async def _call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        json_mode: bool = False,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Call the model and return the completion text.

        PERF: the OpenAI client is synchronous, so this goes through the
        threadpool. Called directly it blocked the event loop for the entire
        completion, which also meant the orchestrator's asyncio.gather() over
        several agents ran them strictly one after another.

        json_mode asks the API to guarantee syntactically valid JSON. Callers
        that parse the response should use it: the previous approach of asking
        the model nicely and then hunting for ``` fences failed whenever the
        model wrapped, prefixed or truncated its answer, and the failure was
        swallowed into an empty result.

        Raises LLMResponseTruncated when the model stopped at max_tokens. That
        used to surface as a JSONDecodeError caught into `{"issues": []}` - i.e.
        a batch that found real problems silently reported none.
        """
        if user_id:
            # Cost control: a single user could previously drive unbounded spend.
            await enforce_spend_budget(user_id)

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.temperature,
            "max_tokens": self.max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await run_blocking(
                lambda: self.client.chat.completions.create(**kwargs)
            )
        except Exception as e:
            logger.error(f"LLM call failed: {str(e)}")
            raise

        choice = response.choices[0]

        if user_id and getattr(response, "usage", None):
            record_spend(user_id, response.usage.total_tokens)

        if choice.finish_reason == "length":
            logger.error(
                f"LLM response truncated at max_tokens={self.max_tokens}; "
                "raise OPENAI_MAX_OUTPUT_TOKENS or reduce the batch size"
            )
            raise LLMResponseTruncated(
                f"Model stopped at the {self.max_tokens} token output limit"
            )

        return choice.message.content or ""
    
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
