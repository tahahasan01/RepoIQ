from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from openai import OpenAI
import httpx
from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)


class BaseAgent(ABC):
    def __init__(self):
        # Create httpx client without proxy support to avoid compatibility issues
        http_client = httpx.Client(proxy=None)
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            http_client=http_client
        )
        self.model = "gpt-4-turbo-preview"
        self.temperature = 0.7
        self.max_tokens = 4000
        
    @abstractmethod
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pass
    
    @abstractmethod
    def get_agent_type(self) -> str:
        pass
    
    async def _call_llm(self, messages: List[Dict[str, str]], temperature: Optional[float] = None) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature or self.temperature,
                max_tokens=self.max_tokens
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
