"""
Centralized Redis caching service with connection pooling and utilities.
"""
from typing import Optional, Any, Callable, Dict
from datetime import timedelta
import json
import pickle
from functools import wraps
from redis import Redis, ConnectionPool
from redis.exceptions import RedisError, ConnectionError as RedisConnectionError
from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)


class RedisService:
    """
    Unified Redis service with automatic serialization, TTL management,
    and error handling with fallback to direct API calls.
    """
    
    def __init__(self, redis_url: Optional[str] = None):
        """Initialize Redis service with connection pooling."""
        self.redis_url = redis_url or settings.REDIS_URL
        self.pool = None
        self.client = None
        self.available = False
        self._hit_count = 0
        self._miss_count = 0
        
        try:
            # Create connection pool for better performance
            self.pool = ConnectionPool.from_url(
                self.redis_url,
                max_connections=50,
                socket_timeout=5,
                socket_connect_timeout=2,
                decode_responses=False  # We'll handle encoding ourselves
            )
            self.client = Redis(connection_pool=self.pool)
            # Test connection
            self.client.ping()
            self.available = True
            logger.info(f"✓ Redis connection established: {self.redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable, caching disabled: {e}")
            self.available = False
    
    def _serialize(self, value: Any) -> bytes:
        """Serialize value for storage."""
        try:
            # Try JSON first (human-readable, better for debugging)
            return json.dumps(value).encode('utf-8')
        except (TypeError, ValueError):
            # Fall back to pickle for complex objects
            return pickle.dumps(value)
    
    def _deserialize(self, data: bytes) -> Any:
        """Deserialize value from storage."""
        try:
            # Try JSON first
            return json.loads(data.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Fall back to pickle
            return pickle.loads(data)
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found/error
        """
        if not self.available:
            return None
        
        try:
            data = self.client.get(key)
            if data:
                self._hit_count += 1
                logger.debug(f"Cache HIT: {key}")
                return self._deserialize(data)
            else:
                self._miss_count += 1
                logger.debug(f"Cache MISS: {key}")
                return None
        except RedisError as e:
            logger.error(f"Redis GET error for {key}: {e}")
            return None
    
    def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Set value in cache with optional TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (None = no expiration)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.available:
            return False
        
        try:
            data = self._serialize(value)
            if ttl:
                self.client.setex(key, ttl, data)
            else:
                self.client.set(key, data)
            logger.debug(f"Cache SET: {key} (TTL: {ttl}s)")
            return True
        except RedisError as e:
            logger.error(f"Redis SET error for {key}: {e}")
            return False
    
    async def get_or_fetch(
        self,
        key: str,
        fetch_func: Callable,
        ttl: Optional[int] = None,
        *args,
        **kwargs
    ) -> Any:
        """
        Cache-aside pattern: Get from cache or fetch and cache.
        
        Args:
            key: Cache key
            fetch_func: Async function to call if cache miss
            ttl: Time to live in seconds
            *args, **kwargs: Arguments for fetch_func
            
        Returns:
            Cached or freshly fetched value
        """
        # Try cache first
        cached = self.get(key)
        if cached is not None:
            return cached
        
        # Cache miss - fetch fresh data
        logger.debug(f"Fetching fresh data for: {key}")
        if asyncio.iscoroutinefunction(fetch_func):
            value = await fetch_func(*args, **kwargs)
        else:
            value = fetch_func(*args, **kwargs)
        
        # Cache the result
        self.set(key, value, ttl)
        return value
    
    def delete(self, key: str) -> bool:
        """
        Delete a key from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if deleted, False otherwise
        """
        if not self.available:
            return False
        
        try:
            self.client.delete(key)
            logger.debug(f"Cache DELETE: {key}")
            return True
        except RedisError as e:
            logger.error(f"Redis DELETE error for {key}: {e}")
            return False
    
    def invalidate(self, pattern: str) -> int:
        """
        Bulk delete keys matching pattern.

        PERF: uses SCAN, not KEYS. KEYS is O(N) over the whole keyspace and blocks
        the Redis event loop for the duration - on a production keyspace that stalls
        every other client. SCAN yields in bounded batches instead.

        Args:
            pattern: Pattern to match (e.g., "github:repos:*")

        Returns:
            Number of keys deleted
        """
        if not self.available:
            return 0

        deleted = 0
        try:
            batch = []
            for key in self.client.scan_iter(match=pattern, count=500):
                batch.append(key)
                if len(batch) >= 500:
                    deleted += self.client.delete(*batch)
                    batch = []

            if batch:
                deleted += self.client.delete(*batch)

            if deleted:
                logger.info(f"Cache INVALIDATE: {pattern} ({deleted} keys)")
            return deleted
        except RedisError as e:
            logger.error(f"Redis INVALIDATE error for {pattern}: {e}")
            return deleted
    
    def exists(self, key: str) -> bool:
        """Check if key exists in cache."""
        if not self.available:
            return False
        
        try:
            return bool(self.client.exists(key))
        except RedisError:
            return False
    
    def get_ttl(self, key: str) -> Optional[int]:
        """Get remaining TTL for a key in seconds."""
        if not self.available:
            return None
        
        try:
            ttl = self.client.ttl(key)
            return ttl if ttl > 0 else None
        except RedisError:
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Returns:
            Dictionary with hit/miss rates and Redis info
        """
        if not self.available:
            return {
                "available": False,
                "error": "Redis not connected"
            }
        
        total_requests = self._hit_count + self._miss_count
        hit_rate = (self._hit_count / total_requests * 100) if total_requests > 0 else 0
        
        try:
            info = self.client.info()
            memory_info = self.client.info("memory")
            
            return {
                "available": True,
                "hit_count": self._hit_count,
                "miss_count": self._miss_count,
                "total_requests": total_requests,
                "hit_rate": round(hit_rate, 2),
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": memory_info.get("used_memory_human", "unknown"),
                "used_memory_peak_human": memory_info.get("used_memory_peak_human", "unknown"),
                "total_keys": self.client.dbsize()
            }
        except RedisError as e:
            logger.error(f"Failed to get Redis stats: {e}")
            return {
                "available": True,
                "hit_count": self._hit_count,
                "miss_count": self._miss_count,
                "hit_rate": round(hit_rate, 2),
                "error": str(e)
            }
    
    def flush_all(self) -> bool:
        """Clear all cache (use with caution!)."""
        if not self.available:
            return False
        
        try:
            self.client.flushdb()
            logger.warning("Cache FLUSH ALL - all keys deleted")
            return True
        except RedisError as e:
            logger.error(f"Redis FLUSH error: {e}")
            return False
    
    def close(self):
        """Close Redis connection."""
        if self.client:
            self.client.close()
        if self.pool:
            self.pool.disconnect()
        logger.info("Redis connection closed")


# Decorator for caching function results
def cache_result(ttl: int = 300, key_prefix: str = "cache"):
    """
    Decorator to cache function results.
    
    Usage:
        @cache_result(ttl=600, key_prefix="github:repos")
        async def get_repositories(user_id: str):
            # ... fetch data
            return repos
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get redis service
            redis_service = get_redis_service()
            
            # Generate cache key from function name and arguments
            key_parts = [key_prefix, func.__name__]
            # Add positional args
            key_parts.extend(str(arg) for arg in args)
            # Add keyword args (sorted for consistency)
            for k, v in sorted(kwargs.items()):
                key_parts.append(f"{k}={v}")
            cache_key = ":".join(key_parts)
            
            # Try cache
            cached = redis_service.get(cache_key)
            if cached is not None:
                return cached
            
            # Execute function
            import asyncio
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)
            
            # Cache result
            redis_service.set(cache_key, result, ttl)
            return result
        
        return wrapper
    return decorator


# Global instance
_redis_service = None


def get_redis_service() -> RedisService:
    """Get or create global Redis service instance."""
    global _redis_service
    if _redis_service is None:
        _redis_service = RedisService()
    return _redis_service


# Import asyncio for coroutine checking
import asyncio
