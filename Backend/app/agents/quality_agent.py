from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger
import re

logger = get_logger(__name__)


class CodeQualityAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.temperature = 0.4
        
    def get_agent_type(self) -> str:
        return "quality"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        language = self._detect_language(file_path)
        
        system_prompt = """You are a code quality expert analyzing code for best practices.
Focus on detecting:
- Code smells and anti-patterns
- Poor naming conventions
- Excessive complexity
- Code duplication
- Long functions/methods
- Too many parameters
- Magic numbers
- Commented-out code
- Missing error handling
- Inconsistent formatting
- Unused variables/imports
- Deep nesting

For each issue found, provide:
- severity: high, medium, low, info
- category: specific quality issue type
- line_number: where the issue occurs
- description: detailed explanation
- suggestion: how to improve it
- auto_fixable: whether it can be automatically fixed

Return response in JSON format with an "issues" array."""

        user_prompt = f"""Analyze this {language} code for quality issues:

File: {file_path}

```{language}
{code}
```

Identify all code quality issues and return them in JSON format."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await self._call_llm(messages)
        issues = self.extract_issues_from_response(response, file_path)
        
        static_issues = self._run_static_analysis(code, file_path, language)
        issues.extend(static_issues)
        
        score = self.calculate_score(issues)
        
        return {
            "agent_type": self.get_agent_type(),
            "score": score,
            "issues": issues,
            "summary": f"Found {len(issues)} quality issues",
            "files_analyzed": 1,
            "metrics": self._calculate_metrics(code, language)
        }
    
    def _detect_language(self, file_path: str) -> str:
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".java": "java",
            ".go": "go",
            ".rb": "ruby",
            ".php": "php",
        }
        
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "unknown"
    
    def _run_static_analysis(self, code: str, file_path: str, language: str) -> List[Dict[str, Any]]:
        issues = []
        lines = code.split('\n')
        
        if language == "python":
            issues.extend(self._analyze_python(code, file_path))
        elif language in ["javascript", "typescript"]:
            issues.extend(self._analyze_javascript(code, file_path))
        
        for i, line in enumerate(lines, 1):
            if re.search(r'TODO|FIXME|HACK|XXX', line, re.IGNORECASE):
                issues.append({
                    "severity": "info",
                    "category": "todo_comment",
                    "file_path": file_path,
                    "line_number": i,
                    "description": "TODO/FIXME comment found",
                    "suggestion": "Address this comment or create a tracking issue",
                    "auto_fixable": False,
                    "agent_type": "quality"
                })
            
            if len(line.strip()) > 120:
                issues.append({
                    "severity": "low",
                    "category": "line_too_long",
                    "file_path": file_path,
                    "line_number": i,
                    "description": f"Line exceeds 120 characters ({len(line)} chars)",
                    "suggestion": "Break long lines for better readability",
                    "auto_fixable": True,
                    "agent_type": "quality"
                })
        
        return issues
    
    def _analyze_python(self, code: str, file_path: str) -> List[Dict[str, Any]]:
        issues = []
        
        magic_numbers = re.finditer(r'\b\d{3,}\b', code)
        for match in magic_numbers:
            line_number = code[:match.start()].count('\n') + 1
            issues.append({
                "severity": "low",
                "category": "magic_number",
                "file_path": file_path,
                "line_number": line_number,
                "description": f"Magic number {match.group()} found",
                "suggestion": "Define as a named constant",
                "auto_fixable": True,
                "agent_type": "quality"
            })
        
        try:
            import ast
            tree = ast.parse(code)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    if len(node.args.args) > 5:
                        issues.append({
                            "severity": "medium",
                            "category": "too_many_parameters",
                            "file_path": file_path,
                            "line_number": node.lineno,
                            "description": f"Function '{node.name}' has {len(node.args.args)} parameters",
                            "suggestion": "Consider using a configuration object or breaking into smaller functions",
                            "auto_fixable": False,
                            "agent_type": "quality"
                        })
                    
                    if len([n for n in ast.walk(node)]) > 50:
                        issues.append({
                            "severity": "medium",
                            "category": "complex_function",
                            "file_path": file_path,
                            "line_number": node.lineno,
                            "description": f"Function '{node.name}' is too complex",
                            "suggestion": "Break down into smaller, focused functions",
                            "auto_fixable": False,
                            "agent_type": "quality"
                        })
        except:
            pass
        
        return issues
    
    def _analyze_javascript(self, code: str, file_path: str) -> List[Dict[str, Any]]:
        issues = []
        
        var_usage = re.finditer(r'\bvar\s+\w+', code)
        for match in var_usage:
            line_number = code[:match.start()].count('\n') + 1
            issues.append({
                "severity": "low",
                "category": "var_usage",
                "file_path": file_path,
                "line_number": line_number,
                "description": "Use 'let' or 'const' instead of 'var'",
                "suggestion": "Replace 'var' with 'const' (if not reassigned) or 'let'",
                "auto_fixable": True,
                "agent_type": "quality"
            })
        
        console_logs = re.finditer(r'console\.(log|debug|warn)', code)
        for match in console_logs:
            line_number = code[:match.start()].count('\n') + 1
            issues.append({
                "severity": "low",
                "category": "console_statement",
                "file_path": file_path,
                "line_number": line_number,
                "description": "Console statement found",
                "suggestion": "Remove console statements or use proper logging",
                "auto_fixable": True,
                "agent_type": "quality"
            })
        
        return issues
    
    def _calculate_metrics(self, code: str, language: str) -> Dict[str, Any]:
        lines = code.split('\n')
        total_lines = len(lines)
        code_lines = len([line for line in lines if line.strip() and not line.strip().startswith('#')])
        comment_lines = len([line for line in lines if line.strip().startswith('#')])
        
        return {
            "total_lines": total_lines,
            "code_lines": code_lines,
            "comment_lines": comment_lines,
            "blank_lines": total_lines - code_lines - comment_lines,
            "comment_ratio": round(comment_lines / max(code_lines, 1), 2)
        }
