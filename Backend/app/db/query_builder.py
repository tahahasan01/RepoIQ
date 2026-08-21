"""
A PostgREST-shaped query builder over plain PostgreSQL.

WHY THIS EXISTS
---------------
The codebase was written against supabase-py, whose fluent API is PostgREST's:

    db.table("repositories").select("*").eq("user_id", uid).single().execute()

There are ~350 such call sites across 18 operators. Rewriting each one into SQL
would be a very large, very risky diff touching every data-access path in the
product - and it would silently break the tenant-isolation guarantees the audit
work established, because those are expressed as `.eq("user_id", ...)` and are
checked by a static scanner that matches exactly this shape
(tests/test_tenant_isolation.py).

So instead of changing 350 call sites, this implements the same surface on top
of psycopg. One module to get right and test, and every existing query - and
every existing tenant-isolation check - keeps working unchanged.

WHAT IS SUPPORTED
-----------------
Exactly what the codebase uses, and nothing more. Anything unsupported raises
rather than silently returning wrong data:

  select insert update delete upsert
  eq neq in_ ilike like is_ not_.is_ gte lte gt lt match
  order limit offset single execute

Embedded resources (`select("*, users(id, full_name)")`) are translated to a
LEFT JOIN with a JSON object, which is how PostgREST presents them.

SAFETY
------
Every value is passed as a bound parameter. Identifiers (table and column names)
come from source code, never from request data, but are still validated against
a strict pattern so a future caller cannot turn one into an injection point.
"""
import json
import re
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from psycopg import sql
from psycopg.rows import dict_row

from app.core.logging import get_logger

logger = get_logger(__name__)

# Identifiers must look like identifiers. Defence in depth: these come from
# source, but an identifier can never be a bound parameter, so it is the one
# place a mistake would become injectable.
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# "users(id, full_name)" or "analysis_results(*)"
_EMBED = re.compile(r"(\w+)\s*\(([^)]*)\)")


class QueryError(RuntimeError):
    """A query could not be built or executed."""


def _ident(name: str) -> sql.Identifier:
    name = name.strip()
    if not _IDENT.match(name):
        raise QueryError(f"Unsafe identifier: {name!r}")
    return sql.Identifier(name)


class Result:
    """Mirrors supabase-py's APIResponse: the caller only ever reads `.data`."""

    __slots__ = ("data", "count")

    def __init__(self, data: Any, count: Optional[int] = None):
        self.data = data
        self.count = count


class QueryBuilder:
    """
    One table query. Chainable, executed by .execute().

    Instances are single-use per statement, matching how the call sites are
    written (a fresh `.table(...)` starts every chain).
    """

    def __init__(self, pool, table: str):
        self._pool = pool
        self._table = table
        self._op = "select"

        self._columns = "*"
        self._embeds: List[Tuple[str, str]] = []
        self._filters: List[Tuple[str, str, Any]] = []
        self._order: List[Tuple[str, bool]] = []
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None
        self._single = False
        self._payload: Any = None
        self._on_conflict: Optional[str] = None
        self._negate_next = False

    # -- operations ---------------------------------------------------------

    def select(self, columns: str = "*", **_) -> "QueryBuilder":
        self._op = "select"
        plain = columns

        # Pull out embedded resources: "*, users(id, name)" -> join on users.
        for match in _EMBED.finditer(columns):
            self._embeds.append((match.group(1), match.group(2).strip()))
            plain = plain.replace(match.group(0), "")

        plain = ", ".join(p.strip() for p in plain.split(",") if p.strip())
        self._columns = plain or "*"
        return self

    def insert(self, payload: Any) -> "QueryBuilder":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: Dict[str, Any]) -> "QueryBuilder":
        self._op = "update"
        self._payload = payload
        return self

    def upsert(self, payload: Any, on_conflict: Optional[str] = None) -> "QueryBuilder":
        self._op = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def delete(self) -> "QueryBuilder":
        self._op = "delete"
        return self

    # -- filters ------------------------------------------------------------

    def _add(self, column: str, operator: str, value: Any) -> "QueryBuilder":
        if self._negate_next:
            operator = f"NOT {operator}"
            self._negate_next = False
        self._filters.append((column, operator, value))
        return self

    def eq(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, "=", value)

    def neq(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, "<>", value)

    def gt(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, ">", value)

    def gte(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, ">=", value)

    def lt(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, "<", value)

    def lte(self, column: str, value: Any) -> "QueryBuilder":
        return self._add(column, "<=", value)

    def like(self, column: str, pattern: str) -> "QueryBuilder":
        return self._add(column, "LIKE", pattern)

    def ilike(self, column: str, pattern: str) -> "QueryBuilder":
        return self._add(column, "ILIKE", pattern)

    def in_(self, column: str, values: List[Any]) -> "QueryBuilder":
        return self._add(column, "IN", list(values))

    def is_(self, column: str, value: Any) -> "QueryBuilder":
        # PostgREST spells the null check is_("col", "null").
        if isinstance(value, str) and value.lower() == "null":
            value = None
        return self._add(column, "IS", value)

    def match(self, criteria: Dict[str, Any]) -> "QueryBuilder":
        for column, value in criteria.items():
            self.eq(column, value)
        return self

    @property
    def not_(self) -> "QueryBuilder":
        """PostgREST's `.not_.is_(...)` negation."""
        self._negate_next = True
        return self

    # -- shaping ------------------------------------------------------------

    def order(self, column: str, desc: bool = False, **_) -> "QueryBuilder":
        self._order.append((column, desc))
        return self

    def limit(self, count: int) -> "QueryBuilder":
        self._limit = count
        return self

    def offset(self, count: int) -> "QueryBuilder":
        self._offset = count
        return self

    def range(self, start: int, end: int) -> "QueryBuilder":
        self._offset = start
        self._limit = max(0, end - start + 1)
        return self

    def single(self) -> "QueryBuilder":
        """
        Exactly one row, as an object rather than a list.

        supabase-py raises when a .single() query matches nothing. Callers here
        universally wrap that in try/except and treat it as "not found", so this
        returns data=None instead - same observable behaviour, without using
        exceptions for an expected outcome.
        """
        self._single = True
        self._limit = 1
        return self

    def maybe_single(self) -> "QueryBuilder":
        return self.single()

    # -- SQL ----------------------------------------------------------------

    def _where(self) -> Tuple[sql.Composable, List[Any]]:
        if not self._filters:
            return sql.SQL(""), []

        parts, params = [], []
        for column, operator, value in self._filters:
            col = sql.SQL("{}.{}").format(_ident(self._table), _ident(column))

            if operator.endswith("IS"):
                clause = sql.SQL("IS NOT NULL") if operator.startswith("NOT") else sql.SQL("IS NULL")
                if value is not None:
                    # A non-null IS comparison is really an equality test.
                    clause = sql.SQL("= %s") if not operator.startswith("NOT") else sql.SQL("<> %s")
                    params.append(value)
                parts.append(sql.SQL("{} {}").format(col, clause))
                continue

            if operator.endswith("IN"):
                if not value:
                    # An empty IN matches nothing. `IN ()` is a syntax error, so
                    # say it explicitly.
                    parts.append(sql.SQL("TRUE") if operator.startswith("NOT") else sql.SQL("FALSE"))
                    continue

                # `= ANY(%s)` with a list, NOT `IN %s` with a tuple. psycopg 3
                # adapts a tuple as a composite/record type rather than an
                # expression list, so `IN %s` fails with "syntax error at or
                # near $1". psycopg2 accepted it; this is one of the real
                # behavioural differences between the two drivers.
                comparison = sql.SQL("<> ALL") if operator.startswith("NOT") else sql.SQL("= ANY")
                parts.append(sql.SQL("{} {}(%s)").format(col, comparison))
                params.append(list(value))
                continue

            negate_open = sql.SQL("NOT (") if operator.startswith("NOT ") else sql.SQL("")
            negate_close = sql.SQL(")") if operator.startswith("NOT ") else sql.SQL("")
            bare = operator.replace("NOT ", "")
            parts.append(
                sql.SQL("{}{} {} %s{}").format(negate_open, col, sql.SQL(bare), negate_close)
            )
            params.append(value)

        return sql.SQL(" WHERE ") + sql.SQL(" AND ").join(parts), params

    def _select_list(self) -> sql.Composable:
        if self._columns == "*":
            base = [sql.SQL("{}.*").format(_ident(self._table))]
        else:
            base = [
                sql.SQL("{}.{}").format(_ident(self._table), _ident(c))
                for c in self._columns.split(",")
            ]

        for table, columns in self._embeds:
            # PostgREST returns an embedded resource as a nested object keyed by
            # the related table name. json_build_object reproduces that shape.
            if columns.strip() == "*":
                obj = sql.SQL("to_jsonb({})").format(_ident(table))
            else:
                pairs = []
                for column in columns.split(","):
                    column = column.strip()
                    if not column:
                        continue
                    pairs.append(sql.Literal(column))
                    pairs.append(sql.SQL("{}.{}").format(_ident(table), _ident(column)))
                obj = sql.SQL("json_build_object({})").format(sql.SQL(", ").join(pairs))
            base.append(sql.SQL("{} AS {}").format(obj, _ident(table)))

        return sql.SQL(", ").join(base)

    def _joins(self) -> sql.Composable:
        """
        LEFT JOIN each embedded resource.

        Assumes the FK is `<singular_table>_id` on this table, which is the
        convention throughout this schema (team_members.user_id -> users.id).
        """
        if not self._embeds:
            return sql.SQL("")

        clauses = []
        for table, _ in self._embeds:
            fk = f"{table[:-1]}_id" if table.endswith("s") else f"{table}_id"
            clauses.append(
                sql.SQL(" LEFT JOIN {t} ON {t}.id = {base}.{fk}").format(
                    t=_ident(table), base=_ident(self._table), fk=_ident(fk)
                )
            )
        return sql.SQL("").join(clauses)

    def _build(self) -> Tuple[sql.Composable, List[Any]]:
        table = _ident(self._table)

        if self._op == "select":
            where, params = self._where()
            query = sql.SQL("SELECT {cols} FROM {t}{joins}{where}").format(
                cols=self._select_list(), t=table, joins=self._joins(), where=where
            )
            if self._order:
                items = [
                    sql.SQL("{}.{} {}").format(
                        table, _ident(c), sql.SQL("DESC" if d else "ASC")
                    )
                    for c, d in self._order
                ]
                query = query + sql.SQL(" ORDER BY ") + sql.SQL(", ").join(items)
            if self._limit is not None:
                query = query + sql.SQL(" LIMIT {}").format(sql.Literal(self._limit))
            if self._offset:
                query = query + sql.SQL(" OFFSET {}").format(sql.Literal(self._offset))
            return query, params

        if self._op in ("insert", "upsert"):
            rows = self._payload if isinstance(self._payload, list) else [self._payload]
            if not rows:
                raise QueryError("insert with no rows")

            columns = list(rows[0].keys())
            placeholders = sql.SQL(", ").join(
                sql.SQL("({})").format(
                    sql.SQL(", ").join(sql.Placeholder() for _ in columns)
                )
                for _ in rows
            )
            params = [row.get(c) for row in rows for c in columns]

            query = sql.SQL("INSERT INTO {t} ({cols}) VALUES {vals}").format(
                t=table,
                cols=sql.SQL(", ").join(_ident(c) for c in columns),
                vals=placeholders,
            )

            if self._op == "upsert":
                conflict = [c.strip() for c in (self._on_conflict or "id").split(",")]
                updates = sql.SQL(", ").join(
                    sql.SQL("{c} = EXCLUDED.{c}").format(c=_ident(c))
                    for c in columns if c not in conflict
                )
                query = query + sql.SQL(" ON CONFLICT ({}) DO UPDATE SET {}").format(
                    sql.SQL(", ").join(_ident(c) for c in conflict), updates
                )

            return query + sql.SQL(" RETURNING *"), params

        if self._op == "update":
            assignments = sql.SQL(", ").join(
                sql.SQL("{} = %s").format(_ident(c)) for c in self._payload
            )
            params = list(self._payload.values())
            where, where_params = self._where()
            if not self._filters:
                # Refuse an unfiltered UPDATE. Every caller scopes by id or
                # user_id; one that does not is a bug that would rewrite the
                # whole table.
                raise QueryError(f"Refusing unfiltered UPDATE on {self._table}")
            return (
                sql.SQL("UPDATE {t} SET {sets}{where} RETURNING *").format(
                    t=table, sets=assignments, where=where
                ),
                params + where_params,
            )

        if self._op == "delete":
            where, params = self._where()
            if not self._filters:
                raise QueryError(f"Refusing unfiltered DELETE on {self._table}")
            return (
                sql.SQL("DELETE FROM {t}{where} RETURNING *").format(t=table, where=where),
                params,
            )

        raise QueryError(f"Unsupported operation: {self._op}")

    # -- execution ----------------------------------------------------------

    def execute(self) -> Result:
        query, params = self._build()

        with self._pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                try:
                    cur.execute(query, params)
                except Exception as e:
                    logger.error(
                        f"Query failed on {self._table} ({self._op}): {type(e).__name__}: {e}"
                    )
                    raise

                rows = cur.fetchall() if cur.description else []

        rows = [_jsonify(r) for r in rows]

        if self._single:
            return Result(rows[0] if rows else None)
        return Result(rows)


def _coerce(value: Any) -> Any:
    """
    Convert a psycopg value to the JSON-ish shape PostgREST returned.

    This matters more than it looks. The codebase was written against PostgREST,
    which speaks JSON, so it assumes:

      - UUIDs are strings. They are used as dict keys, sliced for log redaction
        (`user_id[:8]`), interpolated into Redis cache keys, and compared with
        `==` against strings from JWT claims. psycopg returns uuid.UUID, which
        breaks every one of those - subscripting a UUID raises TypeError.
      - timestamps are ISO strings, because they go straight into API responses.
      - NUMERIC is a number. psycopg returns Decimal, which json.dumps refuses.

    Coercing here keeps ~350 call sites working untouched.
    """
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        # int when it is one, so counts do not render as "3.0".
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, memoryview):
        return bytes(value)
    if isinstance(value, list):
        return [_coerce(v) for v in value]
    if isinstance(value, dict):
        return {k: _coerce(v) for k, v in value.items()}
    return value


def _jsonify(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalise a row for callers that expect JSON-ish values.

    See _coerce for why this is not optional.
    """
    out = {}
    for key, value in row.items():
        if isinstance(value, str) and key.endswith("_jsonb"):
            try:
                out[key] = json.loads(value)
                continue
            except (ValueError, TypeError):
                pass
        out[key] = _coerce(value)
    return out
