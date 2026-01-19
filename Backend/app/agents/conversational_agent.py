from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger

logger = get_logger(__name__)


class ConversationalAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.temperature = 0.7
        self.conversation_history: List[Dict[str, str]] = []
        
    def get_agent_type(self) -> str:
        return "conversational"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {
            "agent_type": self.get_agent_type(),
            "summary": "Conversational agent ready for questions",
            "files_analyzed": 0
        }
    
    async def chat(
        self,
        message: str,
        codebase_context: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        if conversation_history:
            self.conversation_history = conversation_history
        
        system_prompt = self._build_system_prompt(codebase_context)
        messages = [{"role": "system", "content": system_prompt}]
        
        messages.extend(self.conversation_history[-10:])
        
        messages.append({"role": "user", "content": message})
        
        response = await self._call_llm(messages)
        
        self.conversation_history.append({"role": "user", "content": message})
        self.conversation_history.append({"role": "assistant", "content": response})
        
        return response
    
    def _build_system_prompt(self, codebase_context: Optional[Dict[str, Any]]) -> str:
        base_prompt = """You are an expert software engineer assistant helping users understand and improve their codebase.

You can:
- Explain code logic and design decisions
- Identify and explain bugs
- Suggest improvements and optimizations
- Answer questions about the codebase
- Help with debugging
- Provide code examples
- Fix code issues when explicitly requested

Be helpful, clear, and concise. Provide code examples when relevant."""

        if codebase_context:
            context_info = f"""

Codebase Context:
- Repository: {codebase_context.get('repo_name', 'Unknown')}
- Language: {codebase_context.get('language', 'Multiple')}
- Files: {codebase_context.get('file_count', 0)}
"""
            
            if codebase_context.get('recent_analysis'):
                analysis = codebase_context['recent_analysis']
                context_info += f"""
- Security Score: {analysis.get('security_score', 'N/A')}/100
- Quality Score: {analysis.get('quality_score', 'N/A')}/100
- Architecture Score: {analysis.get('architecture_score', 'N/A')}/100
- Total Issues: {analysis.get('total_issues', 0)}
"""
            
            base_prompt += context_info
        
        return base_prompt
    
    async def explain_code(self, code: str, question: Optional[str] = None) -> str:
        system_prompt = """You are an expert software engineer explaining code clearly and concisely."""
        
        if question:
            user_prompt = f"""Explain this code, specifically addressing: {question}

```
{code}
```"""
        else:
            user_prompt = f"""Explain what this code does:

```
{code}
```

Include:
- Purpose and functionality
- Key logic and algorithms
- Important variables and data structures
- Potential issues or improvements"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages)
    
    async def debug_code(self, code: str, error: Optional[str] = None, description: Optional[str] = None) -> str:
        system_prompt = """You are an expert debugger helping identify and fix code issues."""
        
        user_prompt = f"""Help debug this code:

```
{code}
```
"""
        
        if error:
            user_prompt += f"\nError message: {error}"
        
        if description:
            user_prompt += f"\nIssue description: {description}"
        
        user_prompt += """

Provide:
1. Root cause analysis
2. Specific fix with code
3. Explanation of the fix
4. Prevention tips"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages, temperature=0.3)
    
    async def suggest_improvements(self, code: str, focus_area: Optional[str] = None) -> str:
        system_prompt = """You are an expert code reviewer suggesting improvements."""
        
        user_prompt = f"""Suggest improvements for this code:

```
{code}
```
"""
        
        if focus_area:
            user_prompt += f"\nFocus on: {focus_area}"
        
        user_prompt += """

Provide:
1. Specific improvements with code examples
2. Performance optimizations
3. Readability enhancements
4. Best practices to follow"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages)
    
    async def fix_code(self, code: str, issue_description: str) -> Dict[str, Any]:
        system_prompt = """You are an expert software engineer fixing code issues."""
        
        user_prompt = f"""Fix this issue in the code:

Issue: {issue_description}

Original code:
```
{code}
```

Provide:
1. The fixed code
2. Explanation of what was changed and why
3. Testing suggestions

Return response in JSON format with "fixed_code", "explanation", and "testing_notes" fields."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await self._call_llm(messages, temperature=0.3)
        
        try:
            import json
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                return json.loads(json_str)
            else:
                return {
                    "fixed_code": code,
                    "explanation": response,
                    "testing_notes": "Test the changes thoroughly"
                }
        except Exception as e:
            logger.error(f"Failed to parse fix response: {str(e)}")
            return {
                "fixed_code": code,
                "explanation": response,
                "testing_notes": "Test the changes thoroughly"
            }
    
    def clear_history(self):
        self.conversation_history = []
