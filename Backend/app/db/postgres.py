"""
PostgreSQL connection pooling and a drop-in replacement for the supabase client.

Replaces app/db/supabase.py. The object returned by get_db() exposes .table(),
so every existing call site keeps working - see app/db/query_builder.py for why
that shape was preserved rather than rewriting ~350 queries.

Connection pooling matters here in a way it did not before: supabase-py spoke
HTTP to PostgREST, so "connections" were just HTTP requests. Talking to Postgres
directly means real connections, and Postgres has a hard `max_connections`
(100 by default). Every API worker and every Celery worker draws from that same
budget, so the pool is sized deliberately rather than left to chance.
"""
from typing import Optional

from psycopg_pool import ConnectionPool

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.query_builder import QueryBuilder

logger = get_logger(__name__)
settings = get_settings()


class Database:
    """Owns the process-wide connection pool."""

    _pool: Optional[ConnectionPool] = None

    @classmethod
    def get_pool(cls) -> ConnectionPool:
        if cls._pool is None:
            cls._pool = ConnectionPool(
                conninfo=settings.DATABASE_URL,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                # Fail a request rather than queueing behind an exhausted pool
                # forever. Without this a database blip becomes an app-wide hang.
                timeout=settings.DB_POOL_TIMEOUT,
                # Recycle connections so a long-lived worker does not hold one
                # that the server or an intermediary has since dropped.
                max_lifetime=30 * 60,
                max_idle=5 * 60,
                # Do not block startup on the database being reachable; /health
                # reports it and the app degrades rather than refusing to boot.
                open=True,
                check=ConnectionPool.check_connection,
                name="repoiq",
            )
            logger.info(
                f"Postgres pool created (min={settings.DB_POOL_MIN_SIZE}, "
                f"max={settings.DB_POOL_MAX_SIZE})"
            )
        return cls._pool

    @classmethod
    def close(cls) -> None:
        if cls._pool is not None:
            cls._pool.close()
            cls._pool = None
            logger.info("Postgres pool closed")


class PostgresClient:
    """
    The `.table(...)` entry point the application already expects.

    Deliberately API-compatible with supabase-py's client so no call site had to
    change. It has no `.auth` and no `.storage`: those were separate Supabase
    products and are now handled by app/services/local_auth.py and
    app/services/local_storage.py respectively.
    """

    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(self._pool, name)

    # PostgREST exposes .from_() as an alias of .table().
    def from_(self, name: str) -> QueryBuilder:
        return self.table(name)


_client: Optional[PostgresClient] = None


def get_db() -> PostgresClient:
    """
    The application database client.

    There is no anon/service-role split any more: that distinction existed
    because Supabase enforced RLS for the anon key and bypassed it for the
    service role. On plain Postgres the app connects as one role and tenancy is
    enforced in the query layer, which tests/test_tenant_isolation.py checks
    statically. get_service_db() remains as an alias so call sites did not have
    to change.
    """
    global _client
    if _client is None:
        _client = PostgresClient(Database.get_pool())
    return _client


def get_service_db() -> PostgresClient:
    """Alias of get_db(). See the note there about the removed role split."""
    return get_db()


def new_anon_db() -> PostgresClient:
    """
    Alias of get_db().

    Existed to hand auth flows a session-less client, because the shared
    supabase client carried the session of whoever last signed in (AUDIT.md C-1).
    Local auth holds no session state, so that hazard is gone - but the callers
    are left pointing here so the intent stays visible.
    """
    return get_db()


def check_connection() -> bool:
    """True if the database answers. Used by /health."""
    try:
        with Database.get_pool().connection(timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {type(e).__name__}: {e}")
        return False
