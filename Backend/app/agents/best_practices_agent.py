from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger
import ast
import re

logger = get_logger(__name__)


class BestPracticesAgent(BaseAgent):
    """Agent specialized in detecting production best practices"""
    
    def __init__(self):
        super().__init__()
        
    def get_agent_type(self) -> str:
        return "best_practices"
    
    async def analyze(self, code: str, file_path: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        language = self._detect_language(file_path)
        
        system_prompt = """You are a production engineering expert analyzing code for best practices.
Focus on detecting MISSING or IMPROPER implementation of:

**Performance & Optimization:**
- Debouncing/throttling for user inputs and API calls
- Caching strategies (Redis, in-memory, HTTP caching)
- Rate limiting on API endpoints
- Request deduplication
- Lazy loading and code splitting
- Database query optimization (N+1 queries, missing indexes)
- Connection pooling

**API & Backend:**
- Missing rate limiting middleware
- Missing request timeout handling
- Missing retry logic with exponential backoff
- Improper error handling
- Missing input validation
- Missing request/response compression
- Missing CORS configuration
- Missing pagination for list endpoints

**Frontend:**
- Missing debouncing on search/filter inputs
- Missing request throttling
- Excessive re-renders
- Missing memoization (React.memo, useMemo, useCallback)
- Not using proper state management (Redux, Zustand, etc.)
- Prop drilling instead of context/store

**Caching:**
- Missing cache headers (Cache-Control, ETag)
- Not leveraging browser caching
- Missing Redis/Memcached for session data
- Not caching expensive computations
- Cache invalidation issues

For each missing best practice, provide:
- severity: high, medium, low, info
- category: specific best practice area
- line_number: where it should be implemented
- description: what's missing and why it matters
- suggestion: how to implement it properly
- auto_fixable: false (requires architectural changes)

Return response in JSON format with an "issues" array."""

        user_prompt = f"""Analyze this {language} code for production best practices:

File: {file_path}

```{language}
{code}
```

Identify missing or improper implementation of:
1. Debouncing/throttling
2. Caching (Redis, in-memory, HTTP headers)
3. Rate limiting
4. Performance optimizations
5. Error handling patterns

Return ONLY valid JSON."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        response = await self._call_llm(messages)
        issues = self.extract_issues_from_response(response, file_path)
        
        # Add static analysis for common patterns
        static_issues = self._run_static_analysis(code, file_path, language)
        issues.extend(static_issues)
        
        score = self.calculate_score(issues)
        
        return {
            "agent_type": self.get_agent_type(),
            "score": score,
            "issues": issues,
            "summary": f"Found {len(issues)} best practice issues",
            "files_analyzed": 1
        }
    
    
    # ------------------------------------------------------------------
    # Static rules
    #
    # This used to be a set of regex/filename heuristics, and on a real
    # repository every one of its findings was wrong. The N+1 rule fired when a
    # file merely contained the word SELECT and, anywhere after some `for x in`,
    # a `.query(`/`.execute(`/`.find(` - and then reported EVERY for-loop in the
    # file as a HIGH. A CSV reader loop and an in-memory nested loop were each
    # a "HIGH N+1 query". Four false HIGHs took the quality score from 65 to 41.
    #
    # The other rules guessed from the file NAME ("api" or "route" in the path ->
    # HIGH "missing rate limiting" at line 1, because rate limiting is normally
    # global middleware that this file cannot see), flagged every controlled
    # React input as "missing debouncing", and called files "missing caching"
    # because the word "cache" did not appear. None of that can be decided from
    # one file with a regex, and the AI review already covers those practices
    # with the whole batch in view.
    #
    # What remains is only what can be decided from the syntax tree, and is
    # language-gated to Python where we parse it:
    #   - a database call executed once per loop iteration (directly, or via a
    #     helper in the same file that itself queries);
    #   - a `requests` call with no timeout (requests has no default timeout).
    # Both are MEDIUM: they are real costs, not certain defects.
    # ------------------------------------------------------------------

    # Method names that perform a round trip when called on a DB-ish receiver.
    _DB_METHODS = frozenset({
        "execute", "executemany", "query", "get", "filter", "exclude",
        "find", "find_one", "aggregate", "count_documents", "raw", "scalar", "scalars",
        "fetch", "fetchrow", "fetchval",
    })
    # Too generic to trust on `session`/`conn` (requests.Session().get is HTTP):
    # only a query when called on a Django manager, `Model.objects.get(...)`.
    _ORM_MANAGER_ONLY = frozenset({"get", "filter", "exclude"})
    # Receiver names (last segment, lower-cased) that are a database handle.
    _DB_RECEIVER = re.compile(r"(^|_)(cursor|cur|conn|connection|db|session|objects|collection|pool)$")
    _HTTP_METHODS = frozenset({"get", "post", "put", "patch", "delete", "head", "options", "request"})
    _LOOPS = (ast.For, ast.AsyncFor)
    _COMPREHENSIONS = (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
    _SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)

    def _run_static_analysis(self, code: str, file_path: str, language: str) -> List[Dict[str, Any]]:
        """Syntax-tree checks that are reliable enough to report without a model."""
        if language != "python":
            return []
        try:
            tree = ast.parse(code)
        except (SyntaxError, ValueError):
            return []
        return (
            self._find_queries_in_loops(tree, file_path)
            + self._find_requests_without_timeout(tree, file_path)
        )

    @classmethod
    def _walk_same_scope(cls, nodes):
        """Walk nodes without descending into nested defs - their bodies do not run here."""
        stack = list(reversed(nodes))
        while stack:
            node = stack.pop()
            yield node
            if isinstance(node, cls._SCOPES):
                continue
            stack.extend(reversed(list(ast.iter_child_nodes(node))))

    @classmethod
    def _db_call_label(cls, call: ast.Call) -> Optional[str]:
        func = call.func
        if not isinstance(func, ast.Attribute) or func.attr not in cls._DB_METHODS:
            return None
        receiver = func.value
        if isinstance(receiver, ast.Call):  # db.session().query(...)
            receiver = receiver.func
        if isinstance(receiver, ast.Attribute):
            name = receiver.attr
        elif isinstance(receiver, ast.Name):
            name = receiver.id
        else:
            return None
        if func.attr in cls._ORM_MANAGER_ONLY and name != "objects":
            return None
        if not cls._DB_RECEIVER.search(name.lower()):
            return None
        return f"{name}.{func.attr}()"

    @staticmethod
    def _called_name(call: ast.Call) -> Optional[str]:
        """`helper()` or `self.helper()` / `cls.helper()` - a call we can resolve in this file."""
        func = call.func
        if isinstance(func, ast.Name):
            return func.id
        if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id in ("self", "cls"):
            return func.attr
        return None

    def _find_queries_in_loops(self, tree: ast.AST, file_path: str) -> List[Dict[str, Any]]:
        # Functions in this file that perform a query themselves. Calling one of
        # these per iteration is the classic N+1 shape a regex can never see.
        querying_helpers = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if any(
                    isinstance(n, ast.Call) and self._db_call_label(n)
                    for n in self._walk_same_scope(node.body)
                ):
                    querying_helpers.add(node.name)

        issues: List[Dict[str, Any]] = []
        reported = set()  # call nodes already attributed to an (outer) loop

        for node in ast.walk(tree):
            if isinstance(node, self._LOOPS):
                body, loop_line = node.body, node.lineno
            elif isinstance(node, self._COMPREHENSIONS):
                body = [node.key, node.value] if isinstance(node, ast.DictComp) else [node.elt]
                # Conditions also run per element.
                body += [cond for gen in node.generators for cond in gen.ifs]
                loop_line = node.lineno
            else:
                continue

            for inner in self._walk_same_scope(body):
                if not isinstance(inner, ast.Call) or id(inner) in reported:
                    continue
                label = self._db_call_label(inner)
                helper = None
                if not label:
                    helper = self._called_name(inner)
                    if helper not in querying_helpers:
                        continue
                reported.update(
                    id(n) for n in self._walk_same_scope(body) if isinstance(n, ast.Call)
                )
                what = f"`{label}`" if label else f"`{helper}()`, which queries the database,"
                issues.append({
                    "severity": "medium",
                    "category": "n_plus_one_query",
                    "file_path": file_path,
                    "line_number": inner.lineno,
                    "description": (
                        f"{what} runs once per iteration of the loop on line {loop_line}: "
                        "one database round trip per item (N+1 queries)."
                    ),
                    "suggestion": (
                        "Fetch what the loop needs in one query before it (JOIN, WHERE ... IN, "
                        "bulk lookup into a dict), and batch writes (executemany / bulk insert)."
                    ),
                    "auto_fixable": False,
                    "agent_type": "best_practices",
                })
                break  # one finding per loop

        return issues

    def _find_requests_without_timeout(self, tree: ast.AST, file_path: str) -> List[Dict[str, Any]]:
        issues = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not (
                isinstance(func, ast.Attribute)
                and func.attr in self._HTTP_METHODS
                and isinstance(func.value, ast.Name)
                and func.value.id == "requests"
            ):
                continue
            # `**kwargs` may carry a timeout; we cannot tell, so stay quiet.
            if any(kw.arg in ("timeout", None) for kw in node.keywords):
                continue
            issues.append({
                "severity": "medium",
                "category": "missing_timeout",
                "file_path": file_path,
                "line_number": node.lineno,
                "description": (
                    f"requests.{func.attr}() has no timeout. requests waits forever by default, "
                    "so one unresponsive server hangs this code path."
                ),
                "suggestion": "Pass an explicit timeout, e.g. timeout=10 (or (connect, read) seconds).",
                "auto_fixable": False,
                "agent_type": "best_practices",
            })
        return issues
    
    def calculate_score(self, issues: List[Dict[str, Any]]) -> int:
        """Calculate best practices score based on issues found"""
        if not issues:
            return 100
        
        # Higher penalty for critical/high severity best practice violations
        penalty = 0
        for issue in issues:
            severity = issue.get("severity", "low")
            if severity == "critical":
                penalty += 20
            elif severity == "high":
                penalty += 15
            elif severity == "medium":
                penalty += 10
            elif severity == "low":
                penalty += 5
            else:  # info
                penalty += 2
        
        score = max(0, 100 - penalty)
        return score
