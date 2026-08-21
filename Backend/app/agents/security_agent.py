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
- SQL injection vulnerabilities (string concatenation in queries, unsanitized inputs)
- XSS (Cross-Site Scripting) vulnerabilities
- Authentication and authorization flaws
- Insecure cryptography usage
- Hardcoded secrets and credentials
- CSRF vulnerabilities
- Insecure deserialization
- Path traversal vulnerabilities
- SSRF (Server-Side Request Forgery)
- Command injection
- LDAP injection
- NoSQL injection (MongoDB, etc.)
- XML/XXE injection
- Template injection
- Unsafe regex (ReDoS)
- OWASP Top 10 issues

CRITICAL: For SQL injection, detect:
- Direct string concatenation in SQL queries (e.g., "SELECT * FROM users WHERE id = " + userId)
- f-strings or format strings in SQL queries
- exec() or execute() with unsanitized user input
- Missing parameterized queries/prepared statements
- Raw SQL without ORM protection

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
    
    # Which languages each rule is meaningful for. The `language` argument was
    # already being computed and passed in - and then ignored, so every Python
    # rule ran against every file. A .sql file scored a CRITICAL "command
    # injection" because the word EXECUTE matched a Python subprocess rule.
    #
    # A false critical is worse than a missed one: it dominates the score (one
    # critical is a 22-point hit) and it teaches the user to distrust the whole
    # report. Rules now only run where they can actually be true.
    PY = {"python"}
    JS = {"javascript", "typescript"}
    WEB = {"javascript", "typescript", "php", "ruby"}
    SQL_HOSTS = {"python", "javascript", "typescript", "java", "go", "ruby", "php", "csharp"}
    ANY = None  # runs regardless of language, including unrecognised extensions

    def _run_static_analysis(self, code: str, file_path: str, language: str) -> List[Dict[str, Any]]:
        issues = []

        # (pattern, description, severity, languages, flags)
        patterns = {
            "hardcoded_secret": (
                r'(password|secret|api_key|token|private_key)\s*=\s*["\'][^"\']{8,}["\']',
                "Hardcoded secret detected",
                "high",
                self.ANY,
                re.IGNORECASE,
            ),
            # SQL injection - several shapes, all requiring an actual call.
            "sql_injection_concat": (
                r'\b(execute|query|cursor\.execute|db\.execute|raw|sql)\s*\([^)]*\+[^)]*\)',
                "SQL injection risk: String concatenation in SQL query",
                "critical",
                self.SQL_HOSTS,
                0,
            ),
            "sql_injection_fstring": (
                r'\b(execute|query|cursor\.execute|db\.execute)\s*\(\s*f["\']',
                "SQL injection risk: f-string in SQL query without parameters",
                "critical",
                self.PY,
                0,
            ),
            "sql_injection_format": (
                r'\b(execute|query|cursor\.execute|db\.execute)\s*\([^)]*\.format\(',
                "SQL injection risk: .format() in SQL query",
                "critical",
                self.PY,
                0,
            ),
            "sql_injection_percent": (
                r'\b(execute|query|cursor\.execute|db\.execute)\s*\([^)]*%\s*\(',
                "SQL injection risk: % string formatting in SQL query",
                "critical",
                self.PY,
                0,
            ),
            "nosql_injection": (
                r'\b(find|findOne|update|delete)\s*\(\s*\{[^}]*\$where[^}]*\}',
                "NoSQL injection risk: $where operator with unsanitized input",
                "critical",
                self.JS,
                0,
            ),
            "eval_usage": (
                r'\beval\s*\(',
                "Dangerous use of eval() function",
                "high",
                self.PY | self.WEB,
                0,
            ),
            # Python/PHP only: in JavaScript `exec` is overwhelmingly
            # RegExp.prototype.exec, which is harmless.
            "exec_usage": (
                r'\bexec\s*\(',
                "Dangerous use of exec() function",
                "high",
                self.PY | {"php"},
                0,
            ),
            "md5_usage": (
                r'\bmd5\s*\(',
                "Weak MD5 hash usage detected",
                "medium",
                self.PY | self.WEB,
                re.IGNORECASE,
            ),
            "sha1_usage": (
                r'\bsha1\s*\(',
                "Weak SHA1 hash usage detected",
                "medium",
                self.PY | self.WEB,
                re.IGNORECASE,
            ),
            "pickle_usage": (
                r'\bpickle\.loads?\s*\(',
                "Insecure deserialization with pickle",
                "high",
                self.PY,
                0,
            ),
            "yaml_unsafe_load": (
                r'\byaml\.load\s*\([^,)]*\)',
                "Unsafe YAML loading (use yaml.safe_load())",
                "high",
                self.PY,
                0,
            ),
            # The bare `exec` alternative that used to be here matched the
            # substring "exec" anywhere - "executed", "executor", "EXECUTE" -
            # and was case-insensitive, so a code comment produced a critical.
            # exec() as a call is covered by exec_usage above.
            "command_injection": (
                r'\b(os\.system|subprocess\.call|subprocess\.run|subprocess\.Popen)\s*\(|shell\s*=\s*True',
                "Potential command injection vulnerability",
                "critical",
                self.PY,
                0,
            ),
            "command_injection_js": (
                r'\bchild_process\.exec\s*\(|\brequire\(["\']child_process["\']\)\.exec\s*\(',
                "Potential command injection vulnerability",
                "critical",
                self.JS,
                0,
            ),
        }

        # One finding per (rule, line). A single line can match a rule twice -
        # `subprocess.run(cmd, shell=True)` trips both halves of the command
        # injection pattern - and each duplicate is penalised again by the
        # scorer, so one real problem would read as two.
        seen = set()

        for category, (pattern, description, severity, languages, flags) in patterns.items():
            if languages is not None and language not in languages:
                continue
            for match in re.finditer(pattern, code, flags):
                line_number = code[:match.start()].count('\n') + 1
                if (category, line_number) in seen:
                    continue
                seen.add((category, line_number))
                issues.append({
                    "severity": severity,
                    "category": category,
                    "file_path": file_path,
                    "line_number": line_number,
                    "description": description,
                    "suggestion": self._get_suggestion(category),
                    "auto_fixable": category in ["hardcoded_secret", "md5_usage", "sha1_usage"],
                    "agent_type": "security"
                })

        return issues
    
    def _get_suggestion(self, category: str) -> str:
        suggestions = {
            "hardcoded_secret": "Use environment variables or a secrets management system",
            "sql_injection_concat": "Use parameterized queries with placeholders (?, %s) instead of string concatenation",
            "sql_injection_fstring": "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))",
            "sql_injection_format": "Use parameterized queries instead of .format() for SQL",
            "sql_injection_percent": "Use parameterized queries instead of % formatting for SQL",
            "nosql_injection": "Sanitize user input and avoid $where operator, use query builders",
            "eval_usage": "Avoid eval(). Use safer alternatives like ast.literal_eval()",
            "exec_usage": "Avoid exec(). Refactor to use safer alternatives",
            "md5_usage": "Use SHA-256 or bcrypt for password hashing",
            "sha1_usage": "Use SHA-256 or bcrypt for password hashing",
            "pickle_usage": "Use safer serialization formats like JSON or msgpack",
            "yaml_unsafe_load": "Use yaml.safe_load() instead of yaml.load()",
            "command_injection": "Avoid shell=True, use subprocess with list arguments and input validation",
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
