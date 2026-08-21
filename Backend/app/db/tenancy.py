"""
Tenant-scoping guard for service-role database access.

THE DECISION (AUDIT.md M-2)
---------------------------
`002_organizations_and_teams.sql` enables RLS and defines policies, but every
service uses the Supabase **service-role** key, which bypasses RLS by design. So
the policies never execute, and all tenant isolation is application-level
`.eq("user_id", ...)` written by hand at ~100 call sites.

Two options were on the table:

  (a) Per-request scoped clients - mint a user-JWT-bearing PostgREST client per
      request so RLS actually runs.
  (b) Keep service-role, and make forgetting a tenant filter structurally hard.

**(b) was chosen.** (a) is the theoretically better answer, but it is a rewrite of
every data-access path in the codebase and it does not fit how this application
authenticates: it issues its own HS256 JWTs from app.core.security rather than
using Supabase session tokens, so there is no user JWT to hand PostgREST without
first re-architecting authentication. Doing that under a hardening pass would
mean touching every query twice - once to scope it, once again when the auth
model changes.

What (b) buys, and what it does not: this module cannot *enforce* isolation the
way a database policy can. What it does is make the omission loud instead of
silent. A query against a tenant-owned table that carries no ownership filter
raises in development and CI and logs an error in production, so the class of bug
behind C-2 (any team member could read any repository) fails a test rather than
shipping.

The RLS policies are deliberately left in place. They cost nothing while unused
and become the real enforcement the day option (a) happens.
"""
from typing import Any, Optional, Set

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


# Tables whose rows belong to a specific tenant. A read or write against one of
# these must be constrained by an ownership column or an explicit id list.
TENANT_OWNED_TABLES: Set[str] = {
    "repositories",
    "analysis_results",
    "issues",
    "improvement_roadmaps",
    "webhooks",
    "webhook_deliveries",
    "chat_messages",
    "organizations",
    "teams",
    "team_members",
    "repository_assignments",
    "developer_contributions",
    "developer_metrics",
    "code_ownership",
    "issue_blame",
    "audit_logs",
}

# Columns that constitute an acceptable tenant constraint.
OWNERSHIP_COLUMNS: Set[str] = {
    "user_id",
    "owner_id",
    "organization_id",
    "team_id",
    "repository_id",
    "analysis_id",
    "webhook_id",
    "id",
}


class UnscopedQueryError(RuntimeError):
    """A query against a tenant-owned table carried no ownership constraint."""


def _strict() -> bool:
    """
    Raise (development, tests) or log (production).

    Production logs rather than raises on purpose: a false positive here must
    never take a working endpoint down. The signal still reaches the logs, and CI
    is where it is meant to fail.
    """
    return settings.ENVIRONMENT != "production"


def assert_scoped(
    table: str,
    filters: Any,
    *,
    context: Optional[str] = None,
) -> None:
    """
    Check that a query against `table` is constrained to a tenant.

    Args:
        table: the table being queried.
        filters: an iterable of column names the query filters on.
        context: optional caller label for the log line.
    """
    if table not in TENANT_OWNED_TABLES:
        return

    applied = set(filters or ())
    if applied & OWNERSHIP_COLUMNS:
        return

    label = f" in {context}" if context else ""
    message = (
        f"Query against tenant-owned table '{table}'{label} has no ownership "
        f"filter (expected one of: {', '.join(sorted(OWNERSHIP_COLUMNS))}). "
        "A service-role query without one reads across every tenant."
    )

    if _strict():
        raise UnscopedQueryError(message)

    logger.error(message)
