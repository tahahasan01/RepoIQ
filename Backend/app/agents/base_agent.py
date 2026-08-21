from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from openai import OpenAI
import httpx
from app.core.config import get_settings
from app.core.concurrency import run_blocking
from app.core.logging import get_logger

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


class BaseAgent(ABC):
    def __init__(self):
        self.client = get_openai_client()
        # Use gpt-4o-mini - fastest OpenAI model with excellent quality
        self.model = "gpt-4o-mini"
        self.temperature = 0.3  # Lower temperature for faster, more consistent responses
        self.max_tokens = 2000  # Reduced for faster responses
        
    @abstractmethod
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    def get_agent_type(self) -> str:
        pass
    
    async def _call_llm(self, messages: List[Dict[str, str]], temperature: Optional[float] = None) -> str:
        """
        PERF: the OpenAI client is synchronous, so this must go through the
        threadpool. Called directly, it blocked the event loop for the entire
        completion - which also meant the orchestrator's asyncio.gather() over
        several agents ran them strictly one after another while starving every
        other request on the worker. Now they genuinely overlap.
        """
        try:
            response = await run_blocking(
                lambda: self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature or self.temperature,
                    max_tokens=self.max_tokens
                )
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM call failed: {str(e)}")
            raise
    
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
