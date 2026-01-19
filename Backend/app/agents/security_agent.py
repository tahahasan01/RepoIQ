from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger
import re

logger = get_logger(__name__)


class SecurityAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.temperature = 0.3
        
    def get_agent_type(self) -> str:
        return "security"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        language = self._detect_language(file_path)
        
        system_prompt = """You are a security expert analyzing code for vulnerabilities.
Focus on detecting:
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting) vulnerabilities
- Authentication and authorization flaws
- Insecure cryptography usage
- Hardcoded secrets and credentials
- CSRF vulnerabilities
- Insecure deserialization
- Path traversal vulnerabilities
- SSRF (Server-Side Request Forgery)
- Command injection
- OWASP Top 10 issues

For each issue found, provide:
- severity: critical, high, medium, low, info
- category: specific vulnerability type
- line_number: where the issue occurs
- description: detailed explanation
- suggestion: how to fix it
- auto_fixable: whether it can be automatically fixed

Return response in JSON format with an "issues" array."""

        user_prompt = f"""Analyze this {language} code for security vulnerabilities:

File: {file_path}

```{language}
{code}
```

Identify all security issues and return them in JSON format."""

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
            "summary": f"Found {len(issues)} security issues",
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
            ".php": "php",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
        }
        
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "unknown"
    
    def _run_static_analysis(self, code: str, file_path: str, language: str) -> List[Dict[str, Any]]:
        issues = []
        
        patterns = {
            "hardcoded_secret": (
                r'(password|secret|api_key|token)\s*=\s*["\'][^"\']{8,}["\']',
                "Hardcoded secret detected",
                "high"
            ),
            "sql_injection": (
                r'(execute|query|select).*\+.*["\']',
                "Potential SQL injection vulnerability",
                "critical"
            ),
            "eval_usage": (
                r'\beval\s*\(',
                "Dangerous use of eval() function",
                "high"
            ),
            "md5_usage": (
                r'\bmd5\s*\(',
                "Weak MD5 hash usage detected",
                "medium"
            ),
        }
        
        for category, (pattern, description, severity) in patterns.items():
            matches = re.finditer(pattern, code, re.IGNORECASE)
            for match in matches:
                line_number = code[:match.start()].count('\n') + 1
                issues.append({
                    "severity": severity,
                    "category": category,
                    "file_path": file_path,
                    "line_number": line_number,
                    "description": description,
                    "suggestion": self._get_suggestion(category),
                    "auto_fixable": category in ["hardcoded_secret", "md5_usage"],
                    "agent_type": "security"
                })
        
        return issues
    
    def _get_suggestion(self, category: str) -> str:
        suggestions = {
            "hardcoded_secret": "Use environment variables or a secrets management system",
            "sql_injection": "Use parameterized queries or an ORM",
            "eval_usage": "Avoid eval(). Use safer alternatives like ast.literal_eval()",
            "md5_usage": "Use SHA-256 or bcrypt for password hashing",
        }
        return suggestions.get(category, "Review and fix this security issue")
    
    async def generate_fix(self, issue: Dict[str, Any], code: str) -> Optional[str]:
        if not issue.get("auto_fixable"):
            return None
        
        system_prompt = "You are a security expert. Generate a secure fix for the code issue."
        user_prompt = f"""Fix this security issue:

Issue: {issue['description']}
Category: {issue['category']}
Suggestion: {issue['suggestion']}

Original code around line {issue['line_number']}:
```
{code}
```

Provide only the fixed code without explanation."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        try:
            return await self._call_llm(messages, temperature=0.2)
        except Exception as e:
            logger.error(f"Fix generation failed: {str(e)}")
            return None
