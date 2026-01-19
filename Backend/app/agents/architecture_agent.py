from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger
import os

logger = get_logger(__name__)


class ArchitectureAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.temperature = 0.5
        
    def get_agent_type(self) -> str:
        return "architecture"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        project_structure = context.get("project_structure", {}) if context else {}
        all_files = context.get("all_files", []) if context else []
        
        system_prompt = """You are a software architecture expert analyzing project structure and design patterns.
Focus on:
- Project organization and folder structure
- Layer separation (presentation, business logic, data access)
- Design patterns usage
- Dependency management
- Modularity and coupling
- Scalability concerns
- Configuration management
- Error handling architecture
- Logging and monitoring setup
- API design (if applicable)
- Database schema design (if applicable)

For each issue found, provide:
- severity: high, medium, low, info
- category: specific architecture concern
- description: detailed analysis
- suggestion: recommended improvements
- auto_fixable: false (architecture changes require manual intervention)

Return response in JSON format with an "issues" array."""

        user_prompt = f"""Analyze the architecture of this project:

Current File: {file_path}

Project Structure:
{self._format_structure(project_structure)}

Total Files: {len(all_files)}

Code Sample from {file_path}:
```
{code[:2000]}
```

Evaluate the architecture and identify improvement areas."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await self._call_llm(messages)
        issues = self.extract_issues_from_response(response, file_path)
        
        structural_issues = self._analyze_structure(project_structure, all_files)
        issues.extend(structural_issues)
        
        score = self.calculate_score(issues)
        
        return {
            "agent_type": self.get_agent_type(),
            "score": score,
            "issues": issues,
            "summary": f"Found {len(issues)} architectural concerns",
            "files_analyzed": len(all_files),
            "recommendations": self._generate_recommendations(issues)
        }
    
    def _format_structure(self, structure: Dict[str, Any], indent: int = 0) -> str:
        result = []
        for key, value in structure.items():
            result.append("  " * indent + f"- {key}")
            if isinstance(value, dict):
                result.append(self._format_structure(value, indent + 1))
        return "\n".join(result)
    
    def _analyze_structure(self, project_structure: Dict[str, Any], all_files: List[str]) -> List[Dict[str, Any]]:
        issues = []
        
        has_tests = any("test" in f.lower() for f in all_files)
        if not has_tests:
            issues.append({
                "severity": "high",
                "category": "missing_tests",
                "file_path": "project",
                "description": "No test files detected in the project",
                "suggestion": "Add unit tests and integration tests to ensure code quality",
                "auto_fixable": False,
                "agent_type": "architecture"
            })
        
        has_docs = any("readme" in f.lower() or "doc" in f.lower() for f in all_files)
        if not has_docs:
            issues.append({
                "severity": "medium",
                "category": "missing_documentation",
                "file_path": "project",
                "description": "Limited documentation found",
                "suggestion": "Add README.md and comprehensive documentation",
                "auto_fixable": False,
                "agent_type": "architecture"
            })
        
        has_config = any("config" in f.lower() or ".env" in f.lower() for f in all_files)
        if not has_config:
            issues.append({
                "severity": "medium",
                "category": "missing_configuration",
                "file_path": "project",
                "description": "No configuration management detected",
                "suggestion": "Implement environment-based configuration",
                "auto_fixable": False,
                "agent_type": "architecture"
            })
        
        python_files = [f for f in all_files if f.endswith('.py')]
        if python_files:
            has_requirements = any("requirements.txt" in f or "setup.py" in f or "pyproject.toml" in f for f in all_files)
            if not has_requirements:
                issues.append({
                    "severity": "high",
                    "category": "missing_dependencies",
                    "file_path": "project",
                    "description": "No dependency management file found",
                    "suggestion": "Add requirements.txt or pyproject.toml",
                    "auto_fixable": False,
                    "agent_type": "architecture"
                })
        
        js_files = [f for f in all_files if f.endswith(('.js', '.ts', '.jsx', '.tsx'))]
        if js_files:
            has_package_json = any("package.json" in f for f in all_files)
            if not has_package_json:
                issues.append({
                    "severity": "high",
                    "category": "missing_package_json",
                    "file_path": "project",
                    "description": "No package.json found for JavaScript project",
                    "suggestion": "Add package.json with dependencies",
                    "auto_fixable": False,
                    "agent_type": "architecture"
                })
        
        if len(all_files) > 50:
            total_size = sum(1 for _ in all_files)
            if total_size > 100:
                issues.append({
                    "severity": "medium",
                    "category": "monolithic_structure",
                    "file_path": "project",
                    "description": "Large monolithic structure detected",
                    "suggestion": "Consider modularizing into separate packages or microservices",
                    "auto_fixable": False,
                    "agent_type": "architecture"
                })
        
        return issues
    
    def _generate_recommendations(self, issues: List[Dict[str, Any]]) -> List[str]:
        recommendations = []
        
        categories = set(issue["category"] for issue in issues)
        
        if "missing_tests" in categories:
            recommendations.append("Implement comprehensive test coverage (aim for >80%)")
        
        if "missing_documentation" in categories:
            recommendations.append("Create detailed README and API documentation")
        
        if "missing_configuration" in categories:
            recommendations.append("Set up environment-based configuration management")
        
        if "monolithic_structure" in categories:
            recommendations.append("Consider adopting microservices or modular architecture")
        
        if len(issues) > 10:
            recommendations.append("Prioritize architectural refactoring to improve maintainability")
        
        return recommendations[:5]
