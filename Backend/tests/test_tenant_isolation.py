"""
Static tenant-isolation audit.

Every service uses the Supabase service-role key, which bypasses RLS. Tenant
isolation is therefore whatever `.eq("user_id", ...)` the author remembered to
write — and audit finding C-2 was exactly that omission: a repository lookup that
fetched by id alone, letting any team member read any repository in the database.

This walks the AST of every data-access module and fails on a query against a
tenant-owned table that carries no ownership constraint. It is the check that
would have caught C-2 before it shipped.

Adding a genuinely-global query? Add it to ACKNOWLEDGED_GLOBAL_QUERIES below with
a reason. The point is that it becomes a deliberate, reviewed decision instead of
an oversight.
"""
import ast
import pathlib
import pytest

from app.db.tenancy import TENANT_OWNED_TABLES, OWNERSHIP_COLUMNS

BACKEND = pathlib.Path(__file__).resolve().parent.parent

SCANNED_DIRS = ["app/services", "app/api/routes", "app/tasks"]

# (module, table, function) triples that are intentionally unscoped.
ACKNOWLEDGED_GLOBAL_QUERIES = {
    # Resolving an arbitrary identifier to a user id is inherently a global
    # lookup. It is constrained instead by returning only non-sensitive columns
    # and by the caller's own authorisation check.
    ("team_service.py", "users", "find_user_by_identifier"),
    # Reads a team row with no access check ON PURPOSE, so authorisation code has
    # something to authorise against. Callers must gate on _is_team_admin.
    ("team_service.py", "teams", "_get_team_row"),
    # Membership insert; the caller has already authorised.
    ("team_service.py", "team_members", "_insert_team_member"),
    # (Removed: the health probe used to SELECT from `repositories`. It now runs
    #  `SELECT 1` through the pool, so it no longer touches a tenant-owned table
    #  at all - which is strictly better, and this stale-exemption test is what
    #  caught that the entry was obsolete.)
    # Scheduled job, not a user request: it iterates every organisation by design.
    # There is no tenant to scope to.
    ("alert_tasks.py", "organizations", "check_all_organizations_alerts"),
    # Gated by an explicit ownership walk immediately above the query:
    # issue -> analysis -> repository, rejecting when repo.user_id != user_id.
    ("ownership_service.py", "issue_blame", "get_issue_blame"),
}


class QueryVisitor(ast.NodeVisitor):
    """Collects (table, filter_columns, function_name) for supabase call chains."""

    def __init__(self):
        self.queries = []
        self._func_stack = []

    def visit_FunctionDef(self, node):
        self._func_stack.append(node.name)
        self.generic_visit(node)
        self._func_stack.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, node):
        table = self._table_name(node)
        if table:
            self.queries.append((
                table,
                self._filter_columns(node),
                self._func_stack[-1] if self._func_stack else "<module>",
                node.lineno,
            ))
        self.generic_visit(node)

    @staticmethod
    def _table_name(node):
        """If this call is `.table("name")`, return the name."""
        if not isinstance(node.func, ast.Attribute) or node.func.attr != "table":
            return None
        if not node.args or not isinstance(node.args[0], ast.Constant):
            return None
        value = node.args[0].value
        return value if isinstance(value, str) else None

    @staticmethod
    def _filter_columns(table_call):
        """
        Walk outward from `.table(...)` to collect the columns the chain filters on.

        The AST nests the chain inside-out - .table() is the innermost call - so
        the filters live in the ancestors. Rather than reconstruct parents, scan
        the enclosing statement for eq/in_/match calls, which is sufficient
        because these chains are written as a single expression.
        """
        return set()  # filled in by the statement-level pass below


def _collect(path: pathlib.Path):
    """Yield (table, columns, func, lineno) for each supabase query in a file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))

    results = []
    func_stack = []

    def operations_in(node):
        """Which supabase operations this statement performs."""
        ops = set()
        for child in ast.walk(node):
            if isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute):
                if child.func.attr in ("select", "insert", "update", "delete", "upsert"):
                    ops.add(child.func.attr)
        return ops

    def columns_in(node):
        """Every string literal passed as the first arg to eq/in_/match/neq/is_."""
        found = set()
        for child in ast.walk(node):
            if not isinstance(child, ast.Call):
                continue
            if not isinstance(child.func, ast.Attribute):
                continue
            if child.func.attr not in ("eq", "in_", "match", "neq", "is_", "filter"):
                continue
            if child.args and isinstance(child.args[0], ast.Constant):
                value = child.args[0].value
                if isinstance(value, str):
                    found.add(value)
        return found

    class Walker(ast.NodeVisitor):
        def visit_FunctionDef(self, node):
            func_stack.append(node.name)
            self.generic_visit(node)
            func_stack.pop()

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_Expr(self, node):
            self._scan_statement(node)
            self.generic_visit(node)

        def visit_Assign(self, node):
            self._scan_statement(node)
            self.generic_visit(node)

        def visit_Return(self, node):
            self._scan_statement(node)
            self.generic_visit(node)

        def _scan_statement(self, stmt):
            # Each statement may contain a whole .table(...).select(...).eq(...)
            # chain; associate the tables it names with the columns it filters on.
            tables = set()
            for child in ast.walk(stmt):
                if isinstance(child, ast.Call):
                    name = QueryVisitor._table_name(child)
                    if name:
                        tables.add((name, child.lineno))
            if not tables:
                return
            cols = columns_in(stmt)
            ops = operations_in(stmt)
            for name, lineno in tables:
                results.append((
                    name, cols, func_stack[-1] if func_stack else "<module>", lineno, ops
                ))

    Walker().visit(tree)
    return results


def _all_queries():
    files = []
    for directory in SCANNED_DIRS:
        files.extend(sorted((BACKEND / directory).glob("*.py")))
    files.append(BACKEND / "main.py")

    for path in files:
        for table, cols, func, lineno, ops in _collect(path):
            yield path.name, table, cols, func, lineno, ops


class TestEveryTenantQueryIsScoped:

    def test_tenant_owned_queries_carry_an_ownership_filter(self):
        violations = []

        for module, table, cols, func, lineno, ops in _all_queries():
            if table not in TENANT_OWNED_TABLES:
                continue
            if (module, table, func) in ACKNOWLEDGED_GLOBAL_QUERIES:
                continue

            # An insert is scoped by the tenant id in its PAYLOAD, not by a
            # filter - there are no existing rows to constrain. Only reads and
            # mutations of existing rows need an ownership filter.
            constrained_ops = ops & {"select", "update", "delete"}
            if not constrained_ops:
                continue

            if cols & OWNERSHIP_COLUMNS:
                continue
            violations.append(
                f"{module}:{lineno} {func}() -> {table} "
                f"[{'/'.join(sorted(constrained_ops))}] (filters: {sorted(cols) or 'none'})"
            )

        assert not violations, (
            "Service-role queries against tenant-owned tables with no ownership "
            "filter. Each of these reads across every tenant:\n  "
            + "\n  ".join(violations)
        )

    def test_the_check_actually_finds_queries(self):
        """Guard against the scanner silently matching nothing and passing."""
        found = list(_all_queries())
        assert len(found) > 30, f"scanner only found {len(found)} queries; it is broken"

    def test_acknowledged_exemptions_still_exist(self):
        """A stale exemption hides a real gap once the code moves."""
        actual = {(m, t, f) for m, t, _, f, _, _ in _all_queries()}
        stale = ACKNOWLEDGED_GLOBAL_QUERIES - actual

        assert not stale, f"exemptions no longer matching any query: {stale}"


class TestTenancyGuard:

    def test_scoped_query_passes(self):
        from app.db.tenancy import assert_scoped

        assert_scoped("repositories", {"user_id"})

    def test_unscoped_query_raises_outside_production(self, monkeypatch):
        from app.db import tenancy

        monkeypatch.setattr(tenancy.settings, "ENVIRONMENT", "development", raising=False)

        with pytest.raises(tenancy.UnscopedQueryError):
            tenancy.assert_scoped("repositories", set())

    def test_non_tenant_table_is_ignored(self):
        from app.db.tenancy import assert_scoped

        assert_scoped("some_lookup_table", set())

    def test_production_logs_instead_of_raising(self, monkeypatch):
        """A false positive must never take a working endpoint down."""
        from app.db import tenancy

        monkeypatch.setattr(tenancy.settings, "ENVIRONMENT", "production", raising=False)
        tenancy.assert_scoped("repositories", set())  # must not raise


class TestNoWildcardUserJoins:
    """
    C-4 in a second, third and fourth place.

    `select("*, users(*)")` returns the ENTIRE joined user row - including
    github_access_token and email. The original audit caught this in
    team_service.get_team_members; the static tenant scan surfaced three more.
    """

    def test_no_service_selects_all_user_columns(self):
        import re

        offenders = []
        for path in sorted((BACKEND / "app/services").glob("*.py")):
            for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if line.strip().startswith("#"):
                    continue
                if re.search(r'users\(\*\)', line):
                    offenders.append(f"{path.name}:{lineno}")

        assert not offenders, f"wildcard user joins leak credentials at: {offenders}"

    def test_allowlist_is_shared_not_duplicated(self):
        from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

        for forbidden in ("github_access_token", "email", "*"):
            assert forbidden not in TEAM_MEMBER_USER_COLUMNS
