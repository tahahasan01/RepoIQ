from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger

logger = get_logger(__name__)


class DocumentationAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.temperature = 0.6
        
    def get_agent_type(self) -> str:
        return "documentation"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        language = self._detect_language(file_path)
        
        system_prompt = """You are a documentation expert analyzing code for documentation quality.
Focus on:
- Missing or inadequate docstrings/comments
- Undocumented public APIs
- Missing function/method descriptions
- Unclear parameter descriptions
- Missing return value documentation
- Lack of usage examples
- Missing error/exception documentation
- Outdated documentation

For each issue found, provide:
- severity: medium, low, info
- category: documentation issue type
- line_number: where documentation is needed
- description: what's missing
- suggestion: what should be documented
- auto_fixable: true (can generate documentation)

Return response in JSON format with an "issues" array."""

        user_prompt = f"""Analyze this {language} code for documentation issues:

File: {file_path}

```{language}
{code}
```

Identify missing or inadequate documentation."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await self._call_llm(messages)
        issues = self.extract_issues_from_response(response, file_path)
        
        score = self.calculate_score(issues)
        
        return {
            "agent_type": self.get_agent_type(),
            "score": score,
            "issues": issues,
            "summary": f"Found {len(issues)} documentation gaps",
            "files_analyzed": 1
        }
    
    def _detect_language(self, file_path: str) -> str:
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".java": "java",
            ".go": "go",
            ".rb": "ruby",
        }
        
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "unknown"
    
    async def generate_documentation(self, code: str, file_path: str, doc_type: str = "comprehensive") -> str:
        language = self._detect_language(file_path)
        
        system_prompt = """You are an expert technical writer. Generate clear, comprehensive documentation."""
        
        if doc_type == "function":
            user_prompt = f"""Generate docstring for this {language} code:

```{language}
{code}
```

Include:
- Brief description
- Parameters with types and descriptions
- Return value description
- Raises/Exceptions (if applicable)
- Usage example (if complex)

Use standard {language} docstring format."""
        
        elif doc_type == "readme":
            user_prompt = f"""Generate a comprehensive README.md for this project based on the code:

```{language}
{code}
```

Include:
- Project title and description
- Features
- Installation instructions
- Usage examples
- API documentation (if applicable)
- Configuration
- Contributing guidelines
- License

Use Markdown format."""
        
        elif doc_type == "api":
            user_prompt = f"""Generate API documentation for this code:

```{language}
{code}
```

Include:
- Endpoint descriptions
- Request/Response formats
- Parameters
- Examples
- Error codes

Use clear, structured format."""
        
        else:
            user_prompt = f"""Generate comprehensive inline documentation for this {language} code:

```{language}
{code}
```

Add docstrings, comments explaining complex logic, and usage examples where helpful."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages, temperature=0.7)
    
    async def generate_readme(self, project_info: Dict[str, Any]) -> str:
        system_prompt = """You are an expert technical writer specializing in README files."""
        
        user_prompt = f"""Generate a comprehensive README.md for this project:

Project Name: {project_info.get('name', 'Project')}
Description: {project_info.get('description', 'No description provided')}
Language: {project_info.get('language', 'Multiple')}
Features: {', '.join(project_info.get('features', []))}

Include standard README sections:
- Title and badges
- Description
- Features
- Installation
- Usage
- API Documentation (if applicable)
- Configuration
- Contributing
- License
- Contact

Make it professional and comprehensive."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages)
    
    async def improve_documentation(self, original_doc: str, improvement_areas: List[str]) -> str:
        system_prompt = """You are an expert technical writer improving existing documentation."""
        
        user_prompt = f"""Improve this documentation:

Original:
```
{original_doc}
```

Focus on improving:
{chr(10).join(f'- {area}' for area in improvement_areas)}

Return the improved version."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        return await self._call_llm(messages)
