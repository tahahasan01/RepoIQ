"""
API Response Caching Middleware for GET requests.
"""
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from typing import Dict, Optional
import hashlib
import json
from app.services.redis_service import get_redis_service
from app.core.logging import get_logger

logger = get_logger(__name__)


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    """
    Middleware to cache HTTP responses for GET requests.
    """
    
    def __init__(
        self,
        app: ASGIApp,
        default_ttl: int = 300,
        endpoint_ttls: Optional[Dict[str, int]] = None
    ):
        """
        Initialize response cache middleware.
        
        Args:
            app: ASGI application
            default_ttl: Default cache TTL in seconds (5 minutes)
            endpoint_ttls: Dictionary mapping URL patterns to custom TTLs
        """
        super().__init__(app)
        self.redis = get_redis_service()
        self.default_ttl = default_ttl
        self.endpoint_ttls = endpoint_ttls or {
            "/api/v1/github/repositories": 300,  # 5 minutes
            "/api/v1/github/repositories/": 600,  # 10 minutes (single repo)
            "/api/v1/analysis/repositories/": 3600,  # 60 minutes (analysis results)
        }
    
    def _get_cache_key(self, request: Request) -> str:
        """Generate cache key from request."""
        # Include method, path, and query parameters
        query_string = str(request.query_params)
        key_data = f"{request.method}:{request.url.path}:{query_string}"
        
        # Include authorization header to cache per-user
        auth_header = request.headers.get("authorization", "")
        if auth_header:
            # Hash the auth token for privacy
            auth_hash = hashlib.md5(auth_header.encode()).hexdigest()[:8]
            key_data = f"{key_data}:user:{auth_hash}"
        
        # Create cache key
        return f"api:response:{hashlib.md5(key_data.encode()).hexdigest()}"
    
    def _get_ttl(self, path: str) -> int:
        """Get TTL for a specific endpoint."""
        # Check for exact matches first
        for pattern, ttl in self.endpoint_ttls.items():
            if path.startswith(pattern):
                return ttl
        
        return self.default_ttl
    
    def _should_cache(self, request: Request, response: Response) -> bool:
        """Determine if request/response should be cached."""
        # Only cache GET requests
        if request.method != "GET":
            return False
        
        # Don't cache if Redis is unavailable
        if not self.redis.available:
            return False
        
        # Don't cache error responses
        if response.status_code >= 400:
            return False
        
        # Don't cache auth endpoints
        if "/auth/" in request.url.path:
            return False
        
        # Don't cache health/metrics endpoints
        if request.url.path in ["/health", "/metrics", "/api/v1/cache/stats"]:
            return False
        
        return True
    
    async def dispatch(self, request: Request, call_next):
        """Process the request through cache layer."""
        # Skip non-GET requests
        if request.method != "GET":
            return await call_next(request)
        
        # Generate cache key
        cache_key = self._get_cache_key(request)
        
        # Try to get from cache
        if self.redis.available:
            cached_response = self.redis.get(cache_key)
            if cached_response:
                logger.debug(f"✓ Cache HIT for {request.url.path}")
                # Return cached response
                return JSONResponse(
                    content=cached_response,
                    headers={
                        "X-Cache": "HIT",
                        "X-Cache-Key": cache_key[:16]
                    }
                )
        
        # Cache miss - proceed with request
        logger.debug(f"⚡ Cache MISS for {request.url.path}")
        response = await call_next(request)
        
        # Check if we should cache this response
        if self._should_cache(request, response):
            # Read response body
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            
            # Try to parse as JSON
            try:
                response_data = json.loads(body.decode())
                
                # Cache the response
                ttl = self._get_ttl(request.url.path)
                self.redis.set(cache_key, response_data, ttl=ttl)
                logger.debug(f"✓ Cached response for {request.url.path} (TTL: {ttl}s)")
                
                # Return response with cache headers
                return JSONResponse(
                    content=response_data,
                    status_code=response.status_code,
                    headers={
                        **dict(response.headers),
                        "X-Cache": "MISS",
                        "X-Cache-TTL": str(ttl),
                        "Cache-Control": f"public, max-age={ttl}"
                    }
                )
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Not JSON or can't decode - return as-is
                logger.debug(f"⚠️ Skipped caching non-JSON response for {request.url.path}")
                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=dict(response.headers)
                )
        
        return response


def setup_response_cache(app, default_ttl: int = 300):
    """
    Setup response cache middleware.
    
    Args:
        app: FastAPI application
        default_ttl: Default cache TTL in seconds
    """
    # Custom TTL mappings for specific endpoints
    endpoint_ttls = {
        "/api/v1/github/repositories": 300,  # 5 min - repo list changes frequently
        "/api/v1/analysis/repositories/": 3600,  # 60 min - analysis results are stable
        "/api/v1/github/": 600,  # 10 min - general GitHub API calls
    }
    
    app.add_middleware(
        ResponseCacheMiddleware,
        default_ttl=default_ttl,
        endpoint_ttls=endpoint_ttls
    )
    
    logger.info("✓ Response caching middleware enabled")
