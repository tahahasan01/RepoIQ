from typing import Dict, List, Any, Optional
from .base_agent import BaseAgent
from app.core.logging import get_logger
import re

logger = get_logger(__name__)


class BestPracticesAgent(BaseAgent):
    """Agent specialized in detecting production best practices"""
    
    def __init__(self):
        super().__init__()
        self.temperature = 0.4
        
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
    
    def _detect_language(self, file_path: str) -> str:
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".java": "java",
            ".go": "go",
            ".rb": "ruby",
            ".php": "php",
            ".cs": "csharp",
            ".rs": "rust",
        }
        
        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang
        return "unknown"
    
    def _run_static_analysis(self, code: str, file_path: str, language: str) -> List[Dict[str, Any]]:
        """Detect missing best practices with regex patterns"""
        issues = []
        
        # API/Backend file patterns
        if any(keyword in file_path.lower() for keyword in ['route', 'api', 'controller', 'endpoint', 'handler']):
            # Check for rate limiting
            if not re.search(r'(rate_limit|RateLimit|@limiter|throttle)', code, re.IGNORECASE):
                issues.append({
                    "severity": "high",
                    "category": "missing_rate_limiting",
                    "file_path": file_path,
                    "line_number": 1,
                    "description": "API endpoint missing rate limiting protection",
                    "suggestion": "Add rate limiting middleware (e.g., SlowAPI, Flask-Limiter, express-rate-limit)",
                    "auto_fixable": False,
                    "agent_type": "best_practices"
                })
            
            # Check for timeout handling
            if re.search(r'(requests\.|fetch\(|axios)', code) and not re.search(r'timeout\s*=', code, re.IGNORECASE):
                issues.append({
                    "severity": "medium",
                    "category": "missing_timeout",
                    "file_path": file_path,
                    "line_number": 1,
                    "description": "HTTP requests missing timeout configuration",
                    "suggestion": "Add timeout parameter to prevent hanging requests (e.g., timeout=30)",
                    "auto_fixable": False,
                    "agent_type": "best_practices"
                })
            
            # Check for caching headers
            if re.search(r'(return|Response|JSONResponse)', code) and not re.search(r'(Cache-Control|ETag|cache)', code, re.IGNORECASE):
                issues.append({
                    "severity": "medium",
                    "category": "missing_cache_headers",
                    "file_path": file_path,
                    "line_number": 1,
                    "description": "API response missing cache headers",
                    "suggestion": "Add Cache-Control headers for cacheable responses",
                    "auto_fixable": False,
                    "agent_type": "best_practices"
                })
        
        # Frontend patterns (React, Vue, etc.)
        if language in ['javascript', 'typescript'] and ('component' in file_path.lower() or 'page' in file_path.lower()):
            # Check for debouncing on input handlers
            if re.search(r'onChange.*setState|onChange.*set[A-Z]', code) and not re.search(r'(debounce|throttle|useDebounc|useThrottle)', code, re.IGNORECASE):
                matches = re.finditer(r'onChange', code)
                for match in matches:
                    line_number = code[:match.start()].count('\n') + 1
                    issues.append({
                        "severity": "medium",
                        "category": "missing_debouncing",
                        "file_path": file_path,
                        "line_number": line_number,
                        "description": "Input onChange handler missing debouncing (can cause excessive re-renders/API calls)",
                        "suggestion": "Use debounce utility or useDebouncedSearch hook for search inputs",
                        "auto_fixable": False,
                        "agent_type": "best_practices"
                    })
            
            # Check for missing memoization
            if re.search(r'const\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{', code) and not re.search(r'(useMemo|useCallback|React\.memo)', code):
                if code.count('useEffect') > 2 or code.count('useState') > 3:
                    issues.append({
                        "severity": "low",
                        "category": "missing_memoization",
                        "file_path": file_path,
                        "line_number": 1,
                        "description": "Component with multiple effects/state may benefit from memoization",
                        "suggestion": "Consider using React.memo, useMemo, or useCallback to prevent unnecessary re-renders",
                        "auto_fixable": False,
                        "agent_type": "best_practices"
                    })
            
            # Check for proper state management in complex components
            if code.count('useState') > 5 and not re.search(r'(useReducer|Redux|Zustand|useStore|useContext)', code):
                issues.append({
                    "severity": "medium",
                    "category": "missing_state_management",
                    "file_path": file_path,
                    "line_number": 1,
                    "description": "Component with many useState calls should use proper state management",
                    "suggestion": "Refactor to use useReducer, Zustand, or Redux for complex state",
                    "auto_fixable": False,
                    "agent_type": "best_practices"
                })
        
        # Database patterns
        if re.search(r'(SELECT|INSERT|UPDATE|DELETE)', code, re.IGNORECASE):
            # Check for N+1 queries pattern
            if re.search(r'for\s+\w+\s+in.*:\s*.*\.(query|execute|find)', code, re.MULTILINE | re.DOTALL):
                matches = re.finditer(r'for\s+\w+\s+in', code)
                for match in matches:
                    line_number = code[:match.start()].count('\n') + 1
                    issues.append({
                        "severity": "high",
                        "category": "n_plus_one_query",
                        "file_path": file_path,
                        "line_number": line_number,
                        "description": "Potential N+1 query problem (query inside loop)",
                        "suggestion": "Use JOIN queries or bulk fetch to avoid N+1 queries",
                        "auto_fixable": False,
                        "agent_type": "best_practices"
                    })
        
        # Caching patterns
        if 'service' in file_path.lower() or 'api' in file_path.lower():
            # Check for Redis usage
            has_redis = re.search(r'(redis|Redis|RedisClient)', code, re.IGNORECASE)
            has_cache = re.search(r'(cache|@cache|lru_cache|cached)', code, re.IGNORECASE)
            has_expensive_operation = re.search(r'(requests\.|http|fetch|query|SELECT)', code, re.IGNORECASE)
            
            if has_expensive_operation and not has_cache and not has_redis:
                issues.append({
                    "severity": "medium",
                    "category": "missing_caching",
                    "file_path": file_path,
                    "line_number": 1,
                    "description": "Service performs expensive operations without caching",
                    "suggestion": "Implement caching with Redis or in-memory cache (lru_cache, @cache)",
                    "auto_fixable": False,
                    "agent_type": "best_practices"
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
