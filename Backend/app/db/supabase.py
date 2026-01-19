from supabase import create_client, Client
from app.core.config import get_settings
from typing import Optional

settings = get_settings()


class Database:
    _client: Optional[Client] = None
    
    @classmethod
    def get_client(cls) -> Client:
        if cls._client is None:
            cls._client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_KEY
            )
        return cls._client
    
    @classmethod
    def get_service_client(cls) -> Client:
        return create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY
        )


def get_db() -> Client:
    return Database.get_client()


def get_service_db() -> Client:
    return Database.get_service_client()
