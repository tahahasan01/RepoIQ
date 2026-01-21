"""
Response compression middleware for reducing bandwidth and improving performance.
Supports gzip, brotli, and smart compression strategies.
"""
from typing import Optional
from fastapi import Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import gzip
import json
from app.core.logging import get_logger

logger = get_logger(__name__)


class CompressionMiddleware(BaseHTTPMiddleware):
    """
    Middleware for compressing HTTP responses.
    Automatically compresses based on content type and size.
    """
    
    def __init__(
        self,
        app,
        minimum_size: int = 500,
        compression_level: int = 6,
        excluded_paths: Optional[list] = None
    ):
        """
        Args:
            app: FastAPI application
            minimum_size: Minimum response size in bytes to compress
            compression_level: Gzip compression level (1-9)
            excluded_paths: Paths to exclude from compression
        """
        super().__init__(app)
        self.minimum_size = minimum_size
        self.compression_level = compression_level
        self.excluded_paths = excluded_paths or ["/health", "/metrics"]
        
        self.compressible_types = {
            "application/json",
            "application/javascript",
            "text/html",
            "text/css",
            "text/plain",
            "text/xml",
            "application/xml"
        }
    
    def _should_compress(self, request: Request, response: Response, body: bytes) -> bool:
        """Determine if response should be compressed."""
        # Check path exclusions
        if request.url.path in self.excluded_paths:
            return False
        
        # Check if already compressed
        if response.headers.get("Content-Encoding"):
            return False
        
        # Check content type
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
        if content_type not in self.compressible_types:
            return False
        
        # Check size
        if len(body) < self.minimum_size:
            return False
        
        # Check if client accepts gzip
        accept_encoding = request.headers.get("Accept-Encoding", "")
        if "gzip" not in accept_encoding.lower():
            return False
        
        return True
    
    async def dispatch(self, request: Request, call_next):
        """Process request and compress response if applicable."""
        response = await call_next(request)
        
        # Get response body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        # Decide whether to compress
        if self._should_compress(request, response, body):
            try:
                # Compress body
                compressed_body = gzip.compress(
                    body,
                    compresslevel=self.compression_level
                )
                
                # Calculate compression ratio
                ratio = len(compressed_body) / len(body) if len(body) > 0 else 1
                
                # Only use compression if it actually reduces size
                if len(compressed_body) < len(body):
                    logger.debug(
                        f"Compressed {request.url.path}: {len(body)} -> {len(compressed_body)} bytes "
                        f"({ratio:.1%} of original)"
                    )
                    
                    response.headers["Content-Encoding"] = "gzip"
                    response.headers["Content-Length"] = str(len(compressed_body))
                    response.headers["Vary"] = "Accept-Encoding"
                    
                    body = compressed_body
            except Exception as e:
                logger.error(f"Compression failed: {e}")
                # Fall back to uncompressed response
        
        # Return response with body
        return Response(
            content=body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type
        )


class JSONOptimizationMiddleware(BaseHTTPMiddleware):
    """
    Middleware for optimizing JSON responses.
    Removes null values, minifies, and applies smart truncation.
    """
    
    def __init__(
        self,
        app,
        remove_nulls: bool = True,
        max_array_length: Optional[int] = None,
        max_string_length: Optional[int] = None
    ):
        """
        Args:
            app: FastAPI application
            remove_nulls: Remove null/None values from responses
            max_array_length: Maximum array length before truncation
            max_string_length: Maximum string length before truncation
        """
        super().__init__(app)
        self.remove_nulls = remove_nulls
        self.max_array_length = max_array_length
        self.max_string_length = max_string_length
    
    def _optimize_value(self, value):
        """Recursively optimize a value."""
        if value is None and self.remove_nulls:
            return None
        
        if isinstance(value, dict):
            return self._optimize_dict(value)
        
        if isinstance(value, list):
            return self._optimize_list(value)
        
        if isinstance(value, str) and self.max_string_length:
            if len(value) > self.max_string_length:
                return value[:self.max_string_length] + "..."
        
        return value
    
    def _optimize_dict(self, data: dict) -> dict:
        """Optimize dictionary by removing nulls and optimizing nested values."""
        result = {}
        for key, value in data.items():
            optimized = self._optimize_value(value)
            if optimized is not None or not self.remove_nulls:
                result[key] = optimized
        return result
    
    def _optimize_list(self, data: list) -> list:
        """Optimize list by truncating and optimizing elements."""
        if self.max_array_length and len(data) > self.max_array_length:
            optimized = [self._optimize_value(item) for item in data[:self.max_array_length]]
            optimized.append(f"... and {len(data) - self.max_array_length} more items")
            return optimized
        
        return [self._optimize_value(item) for item in data]
    
    async def dispatch(self, request: Request, call_next):
        """Process request and optimize JSON response."""
        response = await call_next(request)
        
        # Only process JSON responses
        content_type = response.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            return response
        
        # Read body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        
        try:
            # Parse JSON
            data = json.loads(body)
            
            # Optimize
            original_size = len(body)
            optimized = self._optimize_value(data)
            
            # Re-serialize with minimal formatting
            new_body = json.dumps(
                optimized,
                separators=(',', ':'),
                ensure_ascii=False
            ).encode('utf-8')
            
            new_size = len(new_body)
            if new_size < original_size:
                logger.debug(
                    f"Optimized JSON for {request.url.path}: "
                    f"{original_size} -> {new_size} bytes "
                    f"({new_size/original_size:.1%} of original)"
                )
            
            # Update response
            response.headers["Content-Length"] = str(new_size)
            
            return Response(
                content=new_body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        except Exception as e:
            logger.error(f"JSON optimization failed: {e}")
            # Return original response
            return Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
