from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger

logger = get_logger(__name__)


class DocumentationAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        
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
        
        return await self._call_llm(messages)
    
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
    
    async def generate_architecture(
        self, files: List[str], repo_name: str = "Repository", user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        A structured architecture overview (layers, components, connections)
        from the repository's file paths. See app/services/architecture.py for
        why this is data rendered as Mermaid rather than model-drawn ASCII art.
        """
        import json
        from app.services.architecture import (
            ARCHITECTURE_SCHEMA, fallback_architecture, validate_architecture,
        )

        # The model sees the directory tree (with file counts) and a sample of
        # paths: enough to see structure without sending thousands of lines.
        dir_counts: Dict[str, int] = {}
        for path in files:
            parts = path.split("/")[:-1]
            for depth in range(1, min(len(parts), 3) + 1):
                key = "/".join(parts[:depth])
                dir_counts[key] = dir_counts.get(key, 0) + 1
        tree = "\n".join(f"{d}/ ({n} files)" for d, n in sorted(dir_counts.items())[:200])
        top_level = "\n".join(sorted(p for p in files if "/" not in p)[:60])

        prompt = f"""Describe the architecture of the repository "{repo_name}" from its file layout.

Directories (up to three levels deep, with file counts):
{tree}

Top-level files:
{top_level}

Return:
- summary: one or two sentences on what the system is made of.
- layers: 2 to 6 layers in the order a request flows through them (for example
  frontend, API, application logic, data, external services). Give each a short
  lowercase id (letters, digits, underscore), a name, a one-sentence
  description, and 1 to 6 components. Each component has a short name, a
  one-sentence description, and paths: directories or files FROM THE LISTS
  ABOVE that make it up.
- connections: how layers call or depend on each other, as from/to layer ids
  with a short label (e.g. "REST / JSON", "SQL", "queues tasks").

Describe only what the file layout shows. Do not invent components, services or
paths that are not in the lists."""

        messages = [
            {
                "role": "system",
                "content": "You are a software architect describing a codebase accurately and concisely.",
            },
            {"role": "user", "content": prompt},
        ]
        try:
            raw = json.loads(await self._call_llm(messages, json_schema=ARCHITECTURE_SCHEMA, user_id=user_id))
            architecture = validate_architecture(raw, files)
            if architecture["layers"]:
                architecture["source"] = "ai"
                return architecture
            logger.warning("Architecture answer had no usable layers; using the file layout")
        except Exception as e:
            logger.error(f"Failed to generate architecture: {type(e).__name__}: {e}")
        architecture = fallback_architecture(files)
        architecture["source"] = "file_layout"
        return architecture
