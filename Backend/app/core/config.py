from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    # App settings
    APP_NAME: str = "RepoIQ"
    APP_ENV: str = "development"
    DEBUG: bool = False  # SECURITY: Default to False for production safety
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str
    
    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    GITHUB_REDIRECT_URI: str
    
    OPENAI_API_KEY: str
    
    # Redis configuration
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50
    REDIS_SOCKET_TIMEOUT: int = 5
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 2
    CACHE_DEFAULT_TTL: int = 300  # 5 minutes
    
    # Optimized cache TTLs (in seconds)
    CACHE_TTL_USER: int = 3600      # 60 min - user data rarely changes
    CACHE_TTL_REPOS: int = 600      # 10 min - balanced freshness
    CACHE_TTL_FILES: int = 3600     # 60 min - files rarely change
    CACHE_TTL_ANALYSIS: int = 86400 # 24 hours - analysis results are immutable
    CACHE_TTL_ISSUES: int = 3600    # 60 min - issues are immutable
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # Increased from 30 to reduce refresh frequency
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    # Include common dev frontend ports (add more in production via .env)
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080,http://localhost:8081"
    
    # CORS specific methods (more restrictive than allow all)
    ALLOWED_METHODS: str = "GET,POST,PUT,DELETE,OPTIONS,PATCH"
    ALLOWED_HEADERS: str = "Authorization,Content-Type,X-Requested-With,Accept,Origin"
    
    MAX_UPLOAD_SIZE: int = 5242880
    UPLOAD_DIR: str = "uploads"
    
    RATE_LIMIT_PER_MINUTE: int = 60
    
    @property
    def allowed_methods_list(self) -> List[str]:
        return [method.strip() for method in self.ALLOWED_METHODS.split(",")]
    
    @property
    def allowed_headers_list(self) -> List[str]:
        return [header.strip() for header in self.ALLOWED_HEADERS.split(",")]
    
    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    @property
    def BACKEND_CORS_ORIGINS(self) -> List[str]:
        """Get list of allowed CORS origins, ensuring localhost:8081 is included in development"""
        origins = self.allowed_origins_list
        
        # In development, ensure localhost:8081 is always included
        if self.ENVIRONMENT == "development" and "http://localhost:8081" not in origins:
            origins.append("http://localhost:8081")
        
        return origins
    
    @property
    def api_prefix(self) -> str:
        return self.API_V1_PREFIX
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
