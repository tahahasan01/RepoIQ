"""
Main FastAPI application with production middleware
"""
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
from loguru import logger

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.dependencies import require_admin
from app.api.routes import auth, users, github, analysis, chat, webhooks, organizations, teams, developers, executive, alerts
from starlette.middleware.gzip import GZipMiddleware

from app.middleware.rate_limiter import RateLimitMiddleware

settings = get_settings()

# Must run before anything logs. Without it structlog stays unconfigured, so
# filter_by_level never applies and every logger.debug() in the codebase prints
# on every request - and emoji in those messages raise UnicodeEncodeError on a
# non-UTF-8 stream, which surfaces as a 500 from inside the middleware stack.
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown
    """
    # Startup
    logger.info("Starting up application...")
    logger.info("Application ready")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    logger.info("Shutting down application...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered GitHub code review platform backend",
    version="1.0.0",
    lifespan=lifespan,
    debug=settings.DEBUG
)

# Configure CORS - MUST be first middleware for preflight to work
# SECURITY: Use specific methods and headers instead of wildcards
cors_origins = settings.BACKEND_CORS_ORIGINS
cors_methods = settings.allowed_methods_list if hasattr(settings, 'allowed_methods_list') else ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
cors_headers = settings.allowed_headers_list if hasattr(settings, 'allowed_headers_list') else ["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"]

logger.info(f"CORS configured - Origins: {', '.join(cors_origins)}")
logger.info(f"CORS configured - Methods: {', '.join(cors_methods)}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=cors_methods,  # SECURITY: Specific methods instead of "*"
    allow_headers=cors_headers,  # SECURITY: Specific headers instead of "*"
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Add production middleware (order matters: rate limit -> optimize -> compress)
#
# SECURITY: this is installed unconditionally. It used to be wrapped in a Redis
# ping, so a process that booted during a Redis blip ran its entire life with no
# rate limiting at all - the exact moment protection matters most. The middleware
# already degrades to a per-process in-memory limiter when Redis is unreachable,
# which is less precise but is protection.
app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.REDIS_URL,
    default_capacity=200,  # 200 requests
    default_refill_rate=2.0,  # 2 per second = 120/minute
    endpoint_limits={
        "/api/v1/analysis/repositories": (50, 0.5),  # 50 requests, refill 1 per 2s (more lenient for polling)
        "/api/v1/analysis": (30, 0.3),  # 30 requests, refill 1 per 3.3s
        "/api/v1/github/sync": (5, 0.05),  # 5 requests, refill 1 per 20s (keep strict for sync)
        "/api/v1/auth": (20, 0.2),  # credential endpoints: 20 burst, 1 per 5s
    }
)
logger.info(f"Rate limiting enabled (trusted proxies: {settings.TRUSTED_PROXY_COUNT})")

# Response compression.
#
# PERF: Starlette's GZipMiddleware operates at the ASGI layer and streams. The
# hand-rolled CompressionMiddleware it replaces was a BaseHTTPMiddleware that
# buffered every response body in full, then rebuilt the Response object - and it
# was one of three such layers, so each response was parsed and re-serialised
# three times before it left the process.
#
# JSONOptimizationMiddleware is gone entirely. It was configured with
# remove_nulls=True, max_array_length=100 and max_string_length=10000, which
# silently corrupted every response: null-valued keys were deleted rather than
# sent as null, arrays over 100 items were truncated with a *string* appended
# into an array of objects, and file contents over 10k characters were cut off
# mid-source. Pagination and field selection belong in the route layer.
app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)

logger.info("Production middleware configured (rate limiting, compression)")


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests"""
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration = time.time() - start_time
    
    # Log
    logger.info(
        f"{request.method} {request.url.path} "
        f"completed in {duration:.3f}s with status {response.status_code}"
    )
    
    return response


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "details": str(exc) if settings.DEBUG else None
        }
    )


# Health check endpoint with dependency verification
@app.get("/health")
async def health_check():
    """
    Health check endpoint that verifies all critical dependencies.
    Returns detailed status for each component.
    """
    from redis import Redis
    from app.db.supabase import Database
    
    health_status = {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "dependencies": {}
    }
    
    overall_healthy = True
    
    # Check Redis
    # SECURITY: report only the exception type. Raw connection errors embed
    # hostnames, ports and credentials-in-URL on an unauthenticated endpoint.
    try:
        redis_client = Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        redis_client.ping()
        health_status["dependencies"]["redis"] = {"status": "healthy", "latency_ms": 0}
    except Exception as e:
        logger.error(f"Health check: Redis unhealthy: {e}")
        health_status["dependencies"]["redis"] = {"status": "unhealthy", "error": type(e).__name__}
        overall_healthy = False

    # Check Supabase/Database
    try:
        supabase = Database.get_client()
        # Simple query to verify connection
        supabase.table("repositories").select("id").limit(1).execute()
        health_status["dependencies"]["database"] = {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check: database unhealthy: {e}")
        health_status["dependencies"]["database"] = {"status": "unhealthy", "error": type(e).__name__}
        overall_healthy = False
    
    # Update overall status
    health_status["status"] = "healthy" if overall_healthy else "degraded"
    
    return health_status


# Readiness probe (for Kubernetes)
@app.get("/ready")
async def readiness_check():
    """Readiness probe - returns 200 only when app is ready to serve traffic."""
    from redis import Redis
    
    try:
        # Quick Redis check
        redis_client = Redis.from_url(settings.REDIS_URL, socket_timeout=1)
        redis_client.ping()
        return {"ready": True}
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"ready": False, "reason": "Dependencies not ready"})


# Liveness probe (for Kubernetes)
@app.get("/live")
async def liveness_check():
    """Liveness probe - returns 200 if the application is running."""
    return {"alive": True}


# Metrics endpoint for monitoring
@app.get("/metrics")
async def get_metrics(_: bool = Depends(require_admin)):
    """Get application metrics. Requires X-Admin-Key."""
    from app.services.token_optimizer import get_token_optimizer
    from app.services.cache_service import get_analysis_cache
    
    try:
        optimizer = get_token_optimizer()
        cache = get_analysis_cache()
        
        return {
            "token_usage": optimizer.get_usage_stats(days=7),
            "cache_stats": cache.get_cache_stats()
        }
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        return {"error": str(e)}


# Cache statistics endpoint
@app.get("/api/v1/cache/stats")
async def cache_stats(_: bool = Depends(require_admin)):
    """
    Get comprehensive cache statistics.
    Shows hit rates, memory usage, and performance metrics.

    Requires X-Admin-Key.
    """
    from app.services.redis_service import get_redis_service
    from app.services.cache_service import get_analysis_cache
    
    try:
        redis_service = get_redis_service()
        analysis_cache = get_analysis_cache()
        
        # Get Redis stats
        redis_stats = redis_service.get_stats()
        
        # Get analysis cache stats
        analysis_stats = analysis_cache.get_cache_stats() if hasattr(analysis_cache, 'get_cache_stats') else {}
        
        return {
            "status": "healthy",
            "redis": redis_stats,
            "analysis_cache": analysis_stats,
            "performance_summary": {
                "overall_hit_rate": redis_stats.get("hit_rate", 0),
                "total_requests": redis_stats.get("total_requests", 0),
                "cache_efficiency": "excellent" if redis_stats.get("hit_rate", 0) > 70 else "good" if redis_stats.get("hit_rate", 0) > 50 else "needs improvement"
            }
        }
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


# Cache invalidation endpoint (admin)
@app.delete("/api/v1/cache/invalidate/{pattern}")
async def invalidate_cache(pattern: str, _: bool = Depends(require_admin)):
    """
    Invalidate cache keys matching a pattern. Requires X-Admin-Key.

    Example patterns:
    - github:repos:* (all repository lists)
    - db:repo:* (all repository data)
    - file:content:* (all file content)

    A bare wildcard is rejected: flushing the whole keyspace is a separate,
    deliberate operation, not something a pattern typo should be able to do.
    """
    from app.services.redis_service import get_redis_service

    normalized = pattern.strip()
    if normalized in ("*", "**", "") or not normalized.rstrip("*"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refusing to invalidate the entire keyspace. Use a specific prefix."
        )

    try:
        redis_service = get_redis_service()
        deleted_count = redis_service.invalidate(normalized)

        return {
            "success": True,
            "pattern": normalized,
            "deleted_keys": deleted_count,
            "message": f"Invalidated {deleted_count} cache keys matching pattern: {normalized}"
        }
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cache invalidation failed"
        )



# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": "1.0.0",
        "docs": "/docs",
        "api_prefix": settings.api_prefix
    }


# Include routers
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)
app.include_router(github.router, prefix=settings.api_prefix)
app.include_router(analysis.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(webhooks.router, prefix=settings.api_prefix)
app.include_router(organizations.router, prefix=settings.api_prefix)
app.include_router(teams.router, prefix=settings.api_prefix)
app.include_router(developers.router, prefix=settings.api_prefix)
app.include_router(executive.router, prefix=settings.api_prefix)
app.include_router(alerts.router, prefix=settings.api_prefix)


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else settings.WORKERS
    )
