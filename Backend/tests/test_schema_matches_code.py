"""
Every column the code writes or filters on must exist in postgres_schema.sql.

The move off Supabase rewrote the schema by hand, and nothing compared it with
the code. chat_service kept writing chat_messages.context_files, the new
schema had no such column, and every chat message failed with UndefinedColumn
- in production code, behind a broad except, with a green test suite.

This walks the AST of every data-access call shaped like

    db.table("t").insert({...}) / .update({...}) / .upsert({...}) / .eq("col", ...)

resolving a dict passed by name to its literal assignment in the same
function, and checks each column name against the CREATE TABLE statements.
"""
import ast
import pathlib
import re

BACKEND = pathlib.Path(__file__).resolve().parent.parent
SCHEMA = BACKEND / "database" / "postgres_schema.sql"

_FILTERS = {"eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in_", "is_", "order"}
_WRITES = {"insert", "update", "upsert"}


def _schema_columns():
    text = SCHEMA.read_text(encoding="utf-8")
    tables = {}
    for match in re.finditer(
        r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", text, re.DOTALL
    ):
        name, body = match.groups()
        columns = set()
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith(("--", "UNIQUE", "PRIMARY KEY", "CONSTRAINT", "CHECK", "FOREIGN")):
                continue
            columns.add(line.split()[0].strip('"'))
        tables[name] = columns
    # ALTER TABLE ... ADD COLUMN in the schema file itself.
    for table, column in re.findall(
        r"ALTER TABLE (?:public\.)?(\w+)\s+ADD COLUMN (?:IF NOT EXISTS )?(\w+)", text
    ):
        tables.setdefault(table, set()).add(column)
    return tables


def _table_of(node):
    """The table name if `node` is a chain rooted in .table("<literal>")."""
    while isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        if node.func.attr == "table" and node.args and isinstance(node.args[0], ast.Constant):
            return node.args[0].value
        node = node.func.value
    return None


def _dict_keys(node, assignments):
    if isinstance(node, ast.Name):
        node = assignments.get(node.id)
    if isinstance(node, ast.List) and node.elts:
        node = node.elts[0]
    if isinstance(node, ast.Dict):
        return [k.value for k in node.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)]
    return []


def _references():
    found = []
    for path in (BACKEND / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            assignments = {}
            for node in ast.walk(func):
                if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                    assignments[node.targets[0].id] = node.value
            for node in ast.walk(func):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
                    continue
                method = node.func.attr
                table = _table_of(node.func.value)
                if not table or not node.args:
                    continue
                if method in _WRITES:
                    columns = _dict_keys(node.args[0], assignments)
                elif method in _FILTERS and isinstance(node.args[0], ast.Constant):
                    columns = [node.args[0].value]
                else:
                    continue
                for column in columns:
                    found.append((table, column, f"{path.relative_to(BACKEND)}:{node.lineno}"))
    return found


def test_scanner_is_not_vacuous():
    refs = _references()
    assert len(refs) > 200, "the scanner stopped finding data-access calls"
    assert any(t == "chat_messages" for t, _, _ in refs)


def test_every_table_exists():
    tables = _schema_columns()
    missing = sorted({f"{t} ({where})" for t, _, where in _references() if t not in tables})
    assert not missing, f"tables used in code but absent from the schema: {missing}"


def test_every_column_exists():
    tables = _schema_columns()
    missing = sorted({
        f"{t}.{c} ({where})"
        for t, c, where in _references()
        if t in tables and c not in tables[t]
    })
    assert not missing, f"columns used in code but absent from the schema: {missing}"
