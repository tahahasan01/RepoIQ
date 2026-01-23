"""
Main FastAPI application with production middleware
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
from loguru import logger

from app.core.config import get_settings
from app.api.routes import auth, users, github, analysis, chat
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.compression import CompressionMiddleware, JSONOptimizationMiddleware
from app.middleware.cache_middleware import ResponseCacheMiddleware

settings = get_settings()


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
cors_origins = settings.BACKEND_CORS_ORIGINS
logger.info(f"CORS configured - Allowing origins: {', '.join(cors_origins)}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

# Add production middleware (order matters: rate limit -> optimize -> compress)
if settings.REDIS_URL:
    try:
        # Test Redis connection
        from redis import Redis
        test_redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        test_redis.ping()
        
        # Rate limiting (after CORS to allow OPTIONS through)
        app.add_middleware(
            RateLimitMiddleware,
            redis_url=settings.REDIS_URL,
            default_capacity=100,  # 100 requests
            default_refill_rate=1.0,  # 1 per second = 60/minute
            endpoint_limits={
                "/api/v1/analysis": (10, 0.1),  # 10 requests, refill 1 per 10s
                "/api/v1/github/sync": (5, 0.05),  # 5 requests, refill 1 per 20s
            }
        )
        logger.info("Rate limiting enabled with Redis")
    except Exception as e:
        logger.warning(f"Redis connection failed, rate limiting disabled: {e}")
else:
    logger.warning("Redis not configured - rate limiting disabled")

# JSON optimization
app.add_middleware(
    JSONOptimizationMiddleware,
    remove_nulls=True,
    max_array_length=100,  # Truncate large arrays
    max_string_length=10000  # Truncate very long strings
)

# Response compression
app.add_middleware(
    CompressionMiddleware,
    minimum_size=500,  # Only compress responses > 500 bytes
    compression_level=6  # Balance between speed and ratio
)

# Response caching (before compression to cache uncompressed data)
app.add_middleware(
    ResponseCacheMiddleware,
    default_ttl=300,  # 5 minutes default
    endpoint_ttls={
        "/api/v1/github/repositories": 300,  # 5 min
        "/api/v1/analysis/repositories/": 3600,  # 60 min
    }
)

logger.info("Production middleware configured (rate limiting, caching, compression)")


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


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0"
    }


# Metrics endpoint for monitoring
@app.get("/metrics")
async def get_metrics():
    """Get application metrics"""
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
async def cache_stats():
    """
    Get comprehensive cache statistics.
    Shows hit rates, memory usage, and performance metrics.
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
async def invalidate_cache(pattern: str):
    """
    Invalidate cache keys matching a pattern.
    Example patterns:
    - github:repos:* (all repository lists)
    - db:repo:* (all repository data)
    - file:content:* (all file content)
    """
    from app.services.redis_service import get_redis_service
    
    try:
        redis_service = get_redis_service()
        deleted_count = redis_service.invalidate(pattern)
        
        return {
            "success": True,
            "pattern": pattern,
            "deleted_keys": deleted_count,
            "message": f"Invalidated {deleted_count} cache keys matching pattern: {pattern}"
        }
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}")
        return {
            "success": False,
            "error": str(e)
        }



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


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else settings.WORKERS
    )
