"""
Analysis results caching service for improving performance and reducing redundant processing.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
import json
import hashlib
from redis import Redis
from app.core.logging import get_logger
from app.core.config import get_settings

logger = get_logger(__name__)
settings = get_settings()


class AnalysisCacheService:
    """
    Manages caching of analysis results to avoid redundant processing.
    Implements smart invalidation and versioning.
    """
    
    def __init__(self, redis_client: Optional[Redis] = None):
        """Initialize with Redis client."""
        try:
            self.redis = redis_client or Redis.from_url(settings.REDIS_URL, decode_responses=False)
            self.redis.ping()
            self.redis_available = True
        except Exception as e:
            logger.warning(f"Redis unavailable for cache service: {e}")
            self.redis = None
            self.redis_available = False
        self.cache_prefix = "analysis_cache"
        self.default_ttl = 3600 * 24 * 7  # 7 days (analysis rarely changes unless code changes)
    
    def _generate_cache_key(
        self,
        repo_id: str,
        commit_sha: Optional[str] = None,
        file_paths: Optional[List[str]] = None
    ) -> str:
        """
        Generate deterministic cache key based on repository state.
        
        Args:
            repo_id: Repository identifier
            commit_sha: Git commit SHA (if available)
            file_paths: List of analyzed file paths
        """
        # Create composite key from inputs
        key_data = {
            'repo_id': repo_id,
            'commit_sha': commit_sha or 'latest',
            'files': sorted(file_paths) if file_paths else []
        }
        
        # Hash for compact key
        key_hash = hashlib.sha256(
            json.dumps(key_data, sort_keys=True).encode()
        ).hexdigest()[:16]
        
        return f"{self.cache_prefix}:{repo_id}:{key_hash}"
    
    def get_cached_analysis(
        self,
        repo_id: str,
        commit_sha: Optional[str] = None,
        file_paths: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached analysis results if available.
        
        Returns:
            Cached analysis data or None if not found/expired
        """
        if not self.redis_available:
            return None
        
        key = self._generate_cache_key(repo_id, commit_sha, file_paths)
        
        try:
            cached = self.redis.get(key)
            if cached:
                data = json.loads(cached)
                logger.info(
                    f"Cache hit for repo {repo_id} "
                    f"(cached {data.get('cached_at', 'unknown')})"
                )
                return data['results']
        except Exception as e:
            logger.error(f"Failed to retrieve cached analysis: {e}")
        
        return None
    
    def cache_analysis(
        self,
        repo_id: str,
        results: Dict[str, Any],
        commit_sha: Optional[str] = None,
        file_paths: Optional[List[str]] = None,
        ttl: Optional[int] = None
    ) -> bool:
        """
        Cache analysis results with metadata.
        
        Args:
            repo_id: Repository identifier
            results: Analysis results to cache
            commit_sha: Git commit SHA
            file_paths: List of analyzed files
            ttl: Time to live in seconds (default: 24 hours)
        
        Returns:
            True if cached successfully
        """
        if not self.redis_available:
            return False
        
        key = self._generate_cache_key(repo_id, commit_sha, file_paths)
        ttl = ttl or self.default_ttl
        
        cache_data = {
            'results': results,
            'cached_at': datetime.utcnow().isoformat(),
            'commit_sha': commit_sha,
            'file_paths': file_paths,
            'metadata': {
                'version': '1.0',
                'ttl': ttl
            }
        }
        
        try:
            self.redis.setex(
                key,
                ttl,
                json.dumps(cache_data)
            )
            logger.info(f"Cached analysis for repo {repo_id} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.error(f"Failed to cache analysis: {e}")
            return False
    
    def invalidate_repo_cache(self, repo_id: str) -> int:
        """
        Invalidate all cache entries for a repository.
        
        Returns:
            Number of keys deleted
        """
        pattern = f"{self.cache_prefix}:{repo_id}:*"
        
        try:
            keys = list(self.redis.scan_iter(match=pattern, count=100))
            if keys:
                deleted = self.redis.delete(*keys)
                logger.info(f"Invalidated {deleted} cache entries for repo {repo_id}")
                return deleted
        except Exception as e:
            logger.error(f"Failed to invalidate cache: {e}")
        
        return 0
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        try:
            pattern = f"{self.cache_prefix}:*"
            keys = list(self.redis.scan_iter(match=pattern, count=1000))
            
            total_size = 0
            for key in keys:
                try:
                    size = self.redis.memory_usage(key)
                    if size:
                        total_size += size
                except:
                    pass
            
            return {
                'total_entries': len(keys),
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2)
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {'error': str(e)}


class ResultsCacheDecorator:
    """Decorator for caching function results."""
    
    def __init__(self, ttl: int = 3600, key_prefix: str = "func_cache"):
        """
        Args:
            ttl: Time to live in seconds
            key_prefix: Prefix for cache keys
        """
        self.ttl = ttl
        self.key_prefix = key_prefix
        self.redis = Redis.from_url(settings.REDIS_URL, decode_responses=False)
    
    def __call__(self, func):
        """Decorate function."""
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            key_data = {
                'func': func.__name__,
                'args': str(args),
                'kwargs': str(sorted(kwargs.items()))
            }
            key_hash = hashlib.sha256(
                json.dumps(key_data).encode()
            ).hexdigest()[:16]
            
            cache_key = f"{self.key_prefix}:{func.__name__}:{key_hash}"
            
            # Try to get from cache
            try:
                cached = self.redis.get(cache_key)
                if cached:
                    logger.debug(f"Cache hit for {func.__name__}")
                    return json.loads(cached)
            except Exception as e:
                logger.error(f"Cache read failed: {e}")
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Cache result
            try:
                self.redis.setex(
                    cache_key,
                    self.ttl,
                    json.dumps(result)
                )
            except Exception as e:
                logger.error(f"Cache write failed: {e}")
            
            return result
        
        return wrapper


# Global instance
_cache_service = None

def get_analysis_cache() -> AnalysisCacheService:
    """Get or create global cache service instance."""
    global _cache_service
    if _cache_service is None:
        _cache_service = AnalysisCacheService()
    return _cache_service
