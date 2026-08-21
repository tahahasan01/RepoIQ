from supabase import create_client, Client
from app.core.config import get_settings
from typing import Optional

settings = get_settings()


class Database:
    _client: Optional[Client] = None
    _service_client: Optional[Client] = None

    @classmethod
    def get_client(cls) -> Client:
        """
        Shared anon-key client.

        SECURITY: this instance is process-wide and the supabase client keeps the
        session of whoever last called sign_in_with_password() on it. NEVER use it
        for an operation whose target is "the currently signed-in user" - it will
        act on the wrong account. Use new_anon_client() for any auth mutation.
        """
        if cls._client is None:
            cls._client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_KEY
            )
        return cls._client

    @classmethod
    def new_anon_client(cls) -> Client:
        """
        Fresh, session-less anon-key client for a single auth operation
        (login, signup, password verification). Never shared between requests.
        """
        return create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_KEY
        )

    @classmethod
    def get_service_client(cls) -> Client:
        """
        Shared service-role client.

        PERF: cached - constructing one builds a fresh httpx pool and TLS context,
        and services are instantiated per request.

        SECURITY: the service role bypasses RLS. Every query made through this
        client MUST carry its own tenant filter (.eq("user_id", ...) or an
        equivalent ownership check).
        """
        if cls._service_client is None:
            cls._service_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_KEY
            )
        return cls._service_client


def get_db() -> Client:
    return Database.get_client()


def new_anon_db() -> Client:
    return Database.new_anon_client()


def get_service_db() -> Client:
    return Database.get_service_client()
