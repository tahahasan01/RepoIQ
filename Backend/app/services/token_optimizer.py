"""
Token optimization service for reducing LLM token usage.
Uses smart summarization, caching, and efficient prompting.
"""
from typing import Dict, Any, List, Optional
import json
import hashlib
from datetime import datetime, timedelta
from redis import Redis
import tiktoken
from app.core.logging import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()


class TokenOptimizer:
    """
    Manages token usage optimization across the application.
    Provides caching, summarization, and compression strategies.
    """
    
    def __init__(self, redis_client: Optional[Redis] = None):
        """Initialize with optional Redis client for caching."""
        try:
            self.redis = redis_client or Redis.from_url(settings.REDIS_URL, decode_responses=False)
            self.redis.ping()
            self.redis_available = True
        except Exception as e:
            logger.warning(f"Redis unavailable for token optimizer: {e}")
            self.redis = None
            self.redis_available = False
        self.encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken."""
        return len(self.encoding.encode(text))
    
    def summarize_code(self, code: str, max_tokens: int = 1000) -> str:
        """
        Intelligently summarize code while preserving key information.
        Removes comments, whitespace, and less important code sections.
        """
        lines = code.split('\n')
        
        # Priority scoring for lines
        important_patterns = [
            'def ', 'class ', 'async def', 'import ', 'from ',
            'raise ', 'return ', 'yield ', 'await ',
            '@', 'TODO', 'FIXME', 'BUG', 'SECURITY'
        ]
        
        scored_lines = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            
            # Skip empty lines and pure comments
            if not stripped or stripped.startswith('#'):
                continue
            
            # Score based on content
            score = 0
            for pattern in important_patterns:
                if pattern in line:
                    score += 10
            
            # Indent level indicates structure importance
            indent = len(line) - len(line.lstrip())
            if indent == 0:
                score += 5
            
            scored_lines.append((score, i, line))
        
        # Sort by score and select most important lines
        scored_lines.sort(reverse=True)
        
        selected = []
        current_tokens = 0
        
        for score, idx, line in scored_lines:
            line_tokens = self.count_tokens(line)
            if current_tokens + line_tokens > max_tokens:
                break
            selected.append((idx, line))
            current_tokens += line_tokens
        
        # Sort by original position to maintain order
        selected.sort(key=lambda x: x[0])
        
        result = '\n'.join(line for _, line in selected)
        
        if len(selected) < len(lines):
            result += f"\n\n# ... {len(lines) - len(selected)} lines omitted for brevity"
        
        return result
    
    def optimize_file_content(self, file_path: str, content: str, max_tokens: int = 2000) -> str:
        """
        Optimize file content for LLM consumption.
        Balances between completeness and token efficiency.
        """
        tokens = self.count_tokens(content)
        
        if tokens <= max_tokens:
            return content
        
        # Apply language-specific optimization
        if file_path.endswith('.py'):
            return self.summarize_code(content, max_tokens)
        elif file_path.endswith(('.js', '.ts', '.jsx', '.tsx')):
            return self.summarize_code(content, max_tokens)
        elif file_path.endswith('.json'):
            # Truncate JSON intelligently
            try:
                data = json.loads(content)
                return json.dumps(data, indent=None)[:max_tokens]
            except:
                return content[:max_tokens]
        else:
            # Generic truncation with ellipsis
            return content[:max_tokens] + "\n\n... (truncated)"
    
    def create_cache_key(self, data: Dict[str, Any]) -> str:
        """Generate deterministic cache key from input data."""
        serialized = json.dumps(data, sort_keys=True)
        return hashlib.sha256(serialized.encode()).hexdigest()
    
    def cache_llm_response(
        self,
        prompt: str,
        response: str,
        ttl: int = 3600
    ) -> None:
        """Cache LLM response to avoid duplicate calls."""
        if not self.redis_available:
            return
        
        key = f"llm_cache:{self.create_cache_key({'prompt': prompt})}"
        
        try:
            self.redis.setex(
                key,
                ttl,
                json.dumps({
                    'response': response,
                    'cached_at': datetime.utcnow().isoformat(),
                    'tokens_saved': self.count_tokens(prompt) + self.count_tokens(response)
                })
            )
            logger.info(f"Cached LLM response (key: {key[:16]}...)")
        except Exception as e:
            logger.error(f"Failed to cache LLM response: {e}")
    
    def get_cached_response(self, prompt: str) -> Optional[str]:
        """Retrieve cached LLM response if available."""
        if not self.redis_available:
            return None
        
        key = f"llm_cache:{self.create_cache_key({'prompt': prompt})}"
        
        try:
            cached = self.redis.get(key)
            if cached:
                data = json.loads(cached)
                logger.info(f"Cache hit! Saved {data.get('tokens_saved', 0)} tokens")
                return data['response']
        except Exception as e:
            logger.error(f"Failed to retrieve cached response: {e}")
        
        return None
    
    def optimize_analysis_context(
        self,
        files: List[Dict[str, str]],
        max_total_tokens: int = 8000
    ) -> List[Dict[str, str]]:
        """
        Optimize multiple files for analysis context.
        Prioritizes and summarizes to fit within token budget.
        """
        # Calculate tokens for each file
        file_tokens = []
        for file_data in files:
            tokens = self.count_tokens(file_data.get('content', ''))
            file_tokens.append({
                **file_data,
                'tokens': tokens
            })
        
        # Sort by importance (you can customize this logic)
        # For now, prioritize Python files and smaller files
        def priority_score(f):
            score = 0
            if f['path'].endswith('.py'):
                score += 10
            if f['tokens'] < 1000:
                score += 5
            return score
        
        file_tokens.sort(key=priority_score, reverse=True)
        
        # Select and optimize files to fit budget
        optimized = []
        total_tokens = 0
        
        for file_data in file_tokens:
            remaining = max_total_tokens - total_tokens
            if remaining <= 0:
                break
            
            content = file_data['content']
            if file_data['tokens'] > remaining:
                # Summarize to fit
                content = self.optimize_file_content(
                    file_data['path'],
                    content,
                    max_tokens=remaining
                )
            
            optimized.append({
                'path': file_data['path'],
                'content': content
            })
            
            total_tokens += self.count_tokens(content)
        
        logger.info(
            f"Optimized {len(files)} files to {len(optimized)} files, "
            f"using {total_tokens}/{max_total_tokens} tokens"
        )
        
        return optimized
    
    def create_efficient_prompt(
        self,
        task: str,
        context: Dict[str, Any],
        examples: Optional[List[str]] = None
    ) -> str:
        """
        Create token-efficient prompts using templates and compression.
        """
        # Use abbreviated keys and minimal formatting
        prompt_parts = [f"Task: {task}"]
        
        # Add context compactly
        if context:
            prompt_parts.append("Context:")
            for key, value in context.items():
                if isinstance(value, str):
                    # Truncate long strings
                    v = value[:500] + "..." if len(value) > 500 else value
                    prompt_parts.append(f"  {key}: {v}")
                elif isinstance(value, (list, dict)):
                    # JSON compact format
                    prompt_parts.append(f"  {key}: {json.dumps(value, separators=(',', ':'))}")
        
        # Add examples only if provided
        if examples:
            prompt_parts.append("\nExamples:")
            for i, ex in enumerate(examples[:2], 1):  # Limit to 2 examples
                prompt_parts.append(f"{i}. {ex}")
        
        return "\n".join(prompt_parts)
    
    def track_usage(
        self,
        endpoint: str,
        tokens_used: int,
        user_id: Optional[str] = None
    ) -> None:
        """Track token usage for monitoring and billing."""
        if not self.redis_available:
            return
        
        key_prefix = "token_usage"
        date = datetime.utcnow().strftime("%Y-%m-%d")
        
        try:
            # Increment daily totals
            self.redis.hincrby(f"{key_prefix}:daily:{date}", endpoint, tokens_used)
            
            if user_id:
                self.redis.hincrby(f"{key_prefix}:user:{user_id}:{date}", endpoint, tokens_used)
            
            # Set expiry for cleanup (30 days)
            self.redis.expire(f"{key_prefix}:daily:{date}", 30 * 24 * 3600)
        except Exception as e:
            logger.error(f"Failed to track token usage: {e}")
    
    def get_usage_stats(self, days: int = 7) -> Dict[str, Any]:
        """Get token usage statistics for the past N days."""
        stats = {
            'total_tokens': 0,
            'by_endpoint': {},
            'by_day': {}
        }
        
        try:
            for i in range(days):
                date = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
                key = f"token_usage:daily:{date}"
                
                daily_data = self.redis.hgetall(key)
                if daily_data:
                    day_total = sum(int(v) for v in daily_data.values())
                    stats['by_day'][date] = day_total
                    stats['total_tokens'] += day_total
                    
                    for endpoint, tokens in daily_data.items():
                        endpoint_str = endpoint.decode() if isinstance(endpoint, bytes) else endpoint
                        tokens_int = int(tokens)
                        stats['by_endpoint'][endpoint_str] = stats['by_endpoint'].get(endpoint_str, 0) + tokens_int
        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
        
        return stats


# Global instance
_optimizer = None

def get_token_optimizer() -> TokenOptimizer:
    """Get or create global TokenOptimizer instance."""
    global _optimizer
    if _optimizer is None:
        _optimizer = TokenOptimizer()
    return _optimizer
