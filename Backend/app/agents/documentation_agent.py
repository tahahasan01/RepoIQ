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
    
    async def generate_architecture_diagram(self, files: List[str], repo_name: str = "Repository") -> str:
        """Generate an ASCII architecture diagram based on the actual file structure."""
        
        # Categorize files by type
        categories = {
            "frontend": [],
            "backend": [],
            "api": [],
            "database": [],
            "services": [],
            "components": [],
            "pages": [],
            "hooks": [],
            "utils": [],
            "config": [],
            "tests": [],
            "models": [],
            "agents": [],
            "tasks": [],
        }
        
        for file_path in files:
            path_lower = file_path.lower()
            if any(x in path_lower for x in ["frontend", "src/components", "src/pages", "src/hooks"]):
                if "component" in path_lower:
                    categories["components"].append(file_path)
                elif "page" in path_lower:
                    categories["pages"].append(file_path)
                elif "hook" in path_lower:
                    categories["hooks"].append(file_path)
                else:
                    categories["frontend"].append(file_path)
            elif any(x in path_lower for x in ["backend", "server", "api"]):
                if "route" in path_lower or "endpoint" in path_lower:
                    categories["api"].append(file_path)
                elif "service" in path_lower:
                    categories["services"].append(file_path)
                elif "model" in path_lower or "schema" in path_lower:
                    categories["models"].append(file_path)
                elif "agent" in path_lower:
                    categories["agents"].append(file_path)
                elif "task" in path_lower:
                    categories["tasks"].append(file_path)
                else:
                    categories["backend"].append(file_path)
            elif any(x in path_lower for x in ["database", "db", "migration", "sql"]):
                categories["database"].append(file_path)
            elif any(x in path_lower for x in ["test", "spec", "__test__"]):
                categories["tests"].append(file_path)
            elif any(x in path_lower for x in ["config", ".env", "settings"]):
                categories["config"].append(file_path)
            elif any(x in path_lower for x in ["util", "helper", "lib"]):
                categories["utils"].append(file_path)
        
        # Build file structure summary
        file_summary = f"Project: {repo_name}\nTotal Files: {len(files)}\n\n"
        for category, file_list in categories.items():
            if file_list:
                file_summary += f"{category.upper()}: {len(file_list)} files\n"
                for f in file_list[:5]:  # Show first 5 files per category
                    file_summary += f"  - {f}\n"
                if len(file_list) > 5:
                    file_summary += f"  ... and {len(file_list) - 5} more\n"
        
        system_prompt = """You are a software architecture expert. Generate a clear ASCII architecture diagram based on the file structure provided.

IMPORTANT: 
- Create a diagram that represents the ACTUAL project structure from the files
- Use simple ASCII box characters (-, |, +, >, <)
- Show data flow with arrows (→, ←, ↓, ↑)
- Include main layers: Frontend, API/Backend, Database, External Services
- Show key components discovered from the file structure
- Keep it clean and readable (max 60 chars wide)

Example format:
```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Components  │  │   Pages     │  │   Hooks     │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Routes    │  │  Services   │  │   Agents    │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      Database                            │
└─────────────────────────────────────────────────────────┘
```
"""
        
        user_prompt = f"""Generate an ASCII architecture diagram for this project based on its file structure:

{file_summary}

Create a professional diagram showing:
1. Main layers/tiers based on the actual files
2. Key components in each layer
3. Data flow between layers
4. Any external integrations detected

Output ONLY the ASCII diagram, no explanations."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            result = await self._call_llm(messages, temperature=0.5)
            return result
        except Exception as e:
            logger.error(f"Failed to generate architecture diagram: {e}")
            # Return a basic fallback diagram
            return self._generate_fallback_diagram(categories, repo_name)
    
    def _generate_fallback_diagram(self, categories: dict, repo_name: str) -> str:
        """Generate a basic architecture diagram without LLM."""
        lines = []
        lines.append(f"# {repo_name} Architecture")
        lines.append("")
        lines.append("```")
        lines.append("┌─────────────────────────────────────────────────────────┐")
        
        # Frontend layer
        if any(categories.get(k) for k in ["frontend", "components", "pages", "hooks"]):
            lines.append("│                    Frontend Layer                        │")
            components = []
            if categories.get("components"): components.append(f"Components ({len(categories['components'])})")
            if categories.get("pages"): components.append(f"Pages ({len(categories['pages'])})")
            if categories.get("hooks"): components.append(f"Hooks ({len(categories['hooks'])})")
            if components:
                lines.append(f"│  {' | '.join(components)[:55].ljust(55)} │")
            lines.append("├────────────────────────────┬────────────────────────────┤")
            lines.append("│                            ▼                            │")
        
        # Backend layer
        if any(categories.get(k) for k in ["backend", "api", "services", "agents"]):
            lines.append("│                    Backend Layer                         │")
            components = []
            if categories.get("api"): components.append(f"API ({len(categories['api'])})")
            if categories.get("services"): components.append(f"Services ({len(categories['services'])})")
            if categories.get("agents"): components.append(f"Agents ({len(categories['agents'])})")
            if components:
                lines.append(f"│  {' | '.join(components)[:55].ljust(55)} │")
            lines.append("├────────────────────────────┬────────────────────────────┤")
            lines.append("│                            ▼                            │")
        
        # Database layer
        if categories.get("database") or categories.get("models"):
            lines.append("│                    Data Layer                            │")
            components = []
            if categories.get("database"): components.append(f"Database ({len(categories['database'])})")
            if categories.get("models"): components.append(f"Models ({len(categories['models'])})")
            if components:
                lines.append(f"│  {' | '.join(components)[:55].ljust(55)} │")
        
        lines.append("└─────────────────────────────────────────────────────────┘")
        lines.append("```")
        
        return "\n".join(lines)
