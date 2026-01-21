from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    # App settings
    APP_NAME: str = "RepoIQ"
    APP_ENV: str = "development"
    DEBUG: bool = True
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
    
    REDIS_URL: str = "redis://localhost:6379/0"
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    # Include common dev frontend ports (add more in production via .env)
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:8081"
    
    MAX_UPLOAD_SIZE: int = 5242880
    UPLOAD_DIR: str = "uploads"
    
    RATE_LIMIT_PER_MINUTE: int = 60
    
    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    @property
    def BACKEND_CORS_ORIGINS(self) -> List[str]:
        return self.allowed_origins_list
    
    @property
    def api_prefix(self) -> str:
        return self.API_V1_PREFIX
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
