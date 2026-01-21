"""
Production-grade rate limiting middleware using token bucket algorithm.
Supports per-user, per-endpoint, and global rate limits with Redis backend.
"""
from typing import Optional, Dict, Callable
from datetime import datetime, timedelta
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from redis import Redis
import time
import asyncio
from functools import wraps
from app.core.logging import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()


class TokenBucket:
    """
    Token bucket algorithm for rate limiting.
    Allows bursts while enforcing long-term rate limits.
    """
    
    def __init__(
        self,
        redis_client: Redis,
        capacity: int,
        refill_rate: float,
        key_prefix: str = "rate_limit"
    ):
        """
        Args:
            redis_client: Redis connection
            capacity: Maximum tokens in bucket
            refill_rate: Tokens added per second
            key_prefix: Redis key prefix for isolation
        """
        self.redis = redis_client
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.key_prefix = key_prefix
    
    def _get_key(self, identifier: str) -> str:
        """Generate Redis key for rate limit tracking."""
        return f"{self.key_prefix}:{identifier}"
    
    async def consume(self, identifier: str, tokens: int = 1) -> tuple[bool, Dict]:
        """
        Attempt to consume tokens from bucket.
        
        Returns:
            (allowed, info) where info contains current state
        """
        key = self._get_key(identifier)
        now = time.time()
        
        # Use Lua script for atomic operations
        lua_script = """
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local tokens_requested = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1])
        local last_refill = tonumber(bucket[2])
        
        if tokens == nil then
            tokens = capacity
            last_refill = now
        end
        
        -- Refill tokens based on elapsed time
        local elapsed = now - last_refill
        tokens = math.min(capacity, tokens + (elapsed * refill_rate))
        
        local allowed = 0
        if tokens >= tokens_requested then
            tokens = tokens - tokens_requested
            allowed = 1
        end
        
        -- Update bucket state
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, 3600)  -- 1 hour TTL
        
        return {allowed, tokens, capacity}
        """
        
        try:
            # Execute in thread pool since redis-py is synchronous
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.redis.eval(
                    lua_script,
                    1,
                    key,
                    self.capacity,
                    self.refill_rate,
                    tokens,
                    now
                )
            )
            
            allowed = bool(result[0])
            remaining = int(result[1])
            capacity = int(result[2])
            
            return allowed, {
                "remaining": remaining,
                "capacity": capacity,
                "reset_after": int((capacity - remaining) / self.refill_rate) if not allowed else 0
            }
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # Fail open - allow request if rate limiting fails
            return True, {"remaining": self.capacity, "capacity": self.capacity, "reset_after": 0}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware for applying rate limits to requests.
    Supports multiple limit tiers and custom rules.
    """
    
    def __init__(
        self,
        app,
        redis_url: str,
        default_capacity: int = 100,
        default_refill_rate: float = 1.0,
        endpoint_limits: Optional[Dict[str, tuple[int, float]]] = None
    ):
        """
        Args:
            app: FastAPI application instance
            redis_url: Redis connection URL
            default_capacity: Default max requests
            default_refill_rate: Default requests per second
            endpoint_limits: Dict of {endpoint_pattern: (capacity, rate)}
        """
        super().__init__(app)
        try:
            self.redis = Redis.from_url(redis_url, decode_responses=True)
            self.redis.ping()  # Test connection
            self.redis_available = True
            logger.info("Redis connected for rate limiting")
        except Exception as e:
            logger.warning(f"Redis unavailable, rate limiting disabled: {e}")
            self.redis = None
            self.redis_available = False
        
        self.default_limiter = None
        self.endpoint_limiters = {}
        
        if self.redis_available:
            self.default_limiter = TokenBucket(
                self.redis,
                default_capacity,
                default_refill_rate,
                key_prefix="rate_limit:default"
            )
            
            # Create limiters for specific endpoints
            if endpoint_limits:
                for pattern, (capacity, rate) in endpoint_limits.items():
                    self.endpoint_limiters[pattern] = TokenBucket(
                        self.redis,
                        capacity,
                        rate,
                        key_prefix=f"rate_limit:{pattern.replace('/', '_')}"
                    )
    
    def _get_limiter(self, path: str) -> TokenBucket:
        """Select appropriate limiter for request path."""
        for pattern, limiter in self.endpoint_limiters.items():
            if path.startswith(pattern):
                return limiter
        return self.default_limiter
    
    def _get_identifier(self, request: Request) -> str:
        """Extract unique identifier from request (user ID or IP)."""
        # Try to get user from request state (set by auth middleware)
        user = getattr(request.state, "user", None)
        if user and isinstance(user, dict):
            return f"user:{user.get('id', 'anonymous')}"
        
        # Fall back to IP address
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
        
        client_host = request.client.host if request.client else "unknown"
        return f"ip:{client_host}"
    
    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        # Skip rate limiting for health checks and OPTIONS (CORS preflight)
        if request.url.path in ["/health", "/api/v1/health", "/metrics"] or request.method == "OPTIONS":
            return await call_next(request)
        
        # If Redis unavailable, allow all requests
        if not self.redis_available:
            return await call_next(request)
        
        identifier = self._get_identifier(request)
        limiter = self._get_limiter(request.url.path)
        
        try:
            allowed, info = await limiter.consume(identifier)
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # Fail open - allow request if rate limiting fails
            return await call_next(request)
        
        # Add rate limit headers to response
        response = None
        if allowed:
            response = await call_next(request)
        else:
            logger.warning(f"Rate limit exceeded for {identifier} on {request.url.path}")
            response = JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "retry_after": info["reset_after"]
                }
            )
        
        # Add rate limit info headers
        response.headers["X-RateLimit-Limit"] = str(info["capacity"])
        response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
        response.headers["X-RateLimit-Reset"] = str(info["reset_after"])
        
        return response


def rate_limit(
    capacity: int = 10,
    refill_rate: float = 1.0,
    key_func: Optional[Callable] = None
):
    """
    Decorator for applying rate limits to individual endpoints.
    
    Usage:
        @rate_limit(capacity=5, refill_rate=0.1)  # 5 requests, refill 1 per 10 seconds
        async def expensive_endpoint():
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request from args/kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                request = kwargs.get("request")
            
            if not request:
                # No request found, skip rate limiting
                return await func(*args, **kwargs)
            
            # Get identifier
            user = getattr(request.state, "user", None)
            if user and isinstance(user, dict):
                identifier = f"endpoint:{func.__name__}:user:{user.get('id')}"
            else:
                identifier = f"endpoint:{func.__name__}:ip:{request.client.host if request.client else 'unknown'}"
            
            # Create limiter
            settings = get_settings()
            redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            limiter = TokenBucket(redis, capacity, refill_rate, key_prefix=f"rate_limit:endpoint:{func.__name__}")
            
            allowed, info = await limiter.consume(identifier)
            
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "message": "Rate limit exceeded for this endpoint",
                        "retry_after": info["reset_after"]
                    }
                )
            
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator
