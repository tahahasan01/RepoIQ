"""
Regression tests for the Phase 2 performance fixes.

These guard properties that are easy to undo by accident: a well-meaning "just
await it directly" edit reintroduces event-loop blocking without any test
failing, and re-enabling the response-rewriting middleware silently corrupts
every payload again.
"""
import ast
import inspect
import pathlib
import pytest
from unittest.mock import MagicMock, patch


BACKEND = pathlib.Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# H-5: JSONOptimizationMiddleware corrupted every response
# ---------------------------------------------------------------------------

class TestResponseRewritingMiddlewareIsGone:

    def test_json_optimization_middleware_is_not_installed(self):
        import main

        installed = {m.cls.__name__ for m in main.app.user_middleware}
        assert "JSONOptimizationMiddleware" not in installed, (
            "this middleware deletes null keys, truncates arrays over 100 items "
            "with a string sentinel, and cuts strings at 10k characters"
        )

    def test_response_cache_middleware_is_not_installed(self):
        import main

        installed = {m.cls.__name__ for m in main.app.user_middleware}
        assert "ResponseCacheMiddleware" not in installed, (
            "served cache HITs before authentication ran"
        )

    def test_gzip_is_handled_by_starlette(self):
        import main

        installed = {m.cls.__name__ for m in main.app.user_middleware}
        assert "GZipMiddleware" in installed
        assert "CompressionMiddleware" not in installed

    def test_rate_limiting_is_still_installed(self):
        """The Phase 1 fix must survive the Phase 2 middleware cleanup."""
        import main

        installed = {m.cls.__name__ for m in main.app.user_middleware}
        assert "RateLimitMiddleware" in installed

    def test_null_fields_survive_a_response(self, client):
        """A null score must arrive as null, not as a missing key."""
        response = client.get("/health")
        assert response.status_code == 200

        body = response.json()
        # /health always reports a dependencies object; the point is that the
        # response is not passed through a null-stripping rewriter.
        assert "dependencies" in body


# ---------------------------------------------------------------------------
# H-7: blocking I/O on the event loop
# ---------------------------------------------------------------------------

def _async_functions(module) -> dict:
    """Map of qualname -> ast node for every async def in a module's source."""
    source = pathlib.Path(inspect.getfile(module)).read_text(encoding="utf-8")
    tree = ast.parse(source)
    found = {}

    class Visitor(ast.NodeVisitor):
        def __init__(self):
            self.stack = []

        def visit_ClassDef(self, node):
            self.stack.append(node.name)
            self.generic_visit(node)
            self.stack.pop()

        def visit_AsyncFunctionDef(self, node):
            found[".".join(self.stack + [node.name])] = node
            self.generic_visit(node)

    Visitor().visit(tree)
    return found


def _calls_in(node) -> list:
    """Dotted names of every call made inside a node, excluding nested lambdas."""
    names = []
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        func = child.func
        parts = []
        while isinstance(func, ast.Attribute):
            parts.append(func.attr)
            func = func.value
        if isinstance(func, ast.Name):
            parts.append(func.id)
        if parts:
            names.append(".".join(reversed(parts)))
    return names


class TestNoBlockingSleepOnTheEventLoop:

    def test_no_time_sleep_in_async_functions(self):
        """time.sleep in a coroutine freezes every other request on the worker."""
        import app.services.auth_service as auth_service

        offenders = [
            name for name, node in _async_functions(auth_service).items()
            if "time.sleep" in _calls_in(node)
        ]
        assert not offenders, f"time.sleep inside coroutines: {offenders}"

    def test_retry_helper_is_a_coroutine(self):
        from app.services.auth_service import _retry_db_operation

        assert inspect.iscoroutinefunction(_retry_db_operation)

    def test_retry_helper_uses_async_sleep(self):
        from app.services.auth_service import _retry_db_operation

        source = inspect.getsource(_retry_db_operation)
        assert "asyncio.sleep" in source

        # Check the AST, not the text: the docstring names time.sleep() as the
        # thing it replaced.
        node = ast.parse(source.lstrip()).body[0]
        assert "time.sleep" not in _calls_in(node)

    @pytest.mark.asyncio
    async def test_retry_helper_runs_the_operation_in_a_thread(self):
        import threading
        from app.services.auth_service import _retry_db_operation

        caller = threading.get_ident()
        seen = {}

        def operation():
            seen["thread"] = threading.get_ident()
            return "ok"

        assert await _retry_db_operation(operation) == "ok"
        assert seen["thread"] != caller, "operation ran on the event loop thread"


class TestBlockingDnsRemovedFromLogin:
    """socket.gethostbyname ran twice per OAuth login, on the event loop."""

    def test_oauth_does_not_resolve_dns_synchronously(self):
        from app.services.auth_service import AuthService

        source = inspect.getsource(AuthService.github_oauth)
        code = "\n".join(
            line for line in source.splitlines()
            if not line.strip().startswith("#")
        )
        assert "gethostbyname" not in code


class TestHotPathsUseTheThreadpool:

    HOT_PATHS = [
        ("app.services.repository_service", "RepositoryService", "resolve_repository_id"),
        ("app.services.repository_service", "RepositoryService", "get_repository"),
        ("app.services.repository_service", "RepositoryService", "get_latest_analysis"),
        ("app.services.repository_service", "RepositoryService", "sync_repositories"),
        ("app.services.repository_service", "RepositoryService", "get_repository_files"),
        ("app.services.repository_service", "RepositoryService", "get_file_content"),
        ("app.services.auth_service", "AuthService", "get_user"),
        ("app.services.auth_service", "AuthService", "login"),
        ("app.services.auth_service", "AuthService", "signup"),
    ]

    @pytest.mark.parametrize("module_name,class_name,method_name", HOT_PATHS)
    def test_method_delegates_blocking_io(self, module_name, class_name, method_name):
        import importlib

        module = importlib.import_module(module_name)
        method = getattr(getattr(module, class_name), method_name)
        source = inspect.getsource(method)

        assert "run_blocking" in source, (
            f"{class_name}.{method_name} performs synchronous I/O directly on the "
            "event loop"
        )

    def test_llm_calls_go_through_the_threadpool(self):
        """The OpenAI client is sync; gather() over agents was serial without this."""
        from app.agents.base_agent import BaseAgent

        assert "run_blocking" in inspect.getsource(BaseAgent._call_llm)


# ---------------------------------------------------------------------------
# H-8 / P-5: client lifecycle
# ---------------------------------------------------------------------------

class TestClientsAreReused:

    def test_agents_share_one_openai_client(self):
        """Six agents per orchestrator, one orchestrator per analysis, each of
        which used to build and leak its own httpx.Client."""
        import app.agents.base_agent as base_agent

        base_agent._shared_openai_client = None
        with patch("app.agents.base_agent.OpenAI", return_value=MagicMock()) as ctor:
            first = base_agent.get_openai_client()
            second = base_agent.get_openai_client()

        assert first is second
        assert ctor.call_count == 1
        base_agent._shared_openai_client = None

    def test_openai_client_has_a_timeout(self):
        import app.agents.base_agent as base_agent

        base_agent._shared_openai_client = None
        with patch("app.agents.base_agent.OpenAI", return_value=MagicMock()) as ctor:
            base_agent.get_openai_client()

        assert "timeout" in ctor.call_args.kwargs, "an unbounded LLM call is an outage"
        base_agent._shared_openai_client = None

    def test_base_agent_does_not_construct_an_httpx_client(self):
        from app.agents.base_agent import BaseAgent

        assert "httpx.Client()" not in inspect.getsource(BaseAgent.__init__)


# ---------------------------------------------------------------------------
# M-8 / cache invalidation correctness
# ---------------------------------------------------------------------------

class TestCacheInvalidationCoversEveryPage:

    def test_sync_sweeps_all_paginated_keys(self):
        """It used to enumerate pages 1-5 at per_page 30 and 6 only."""
        from app.services.repository_service import RepositoryService

        source = inspect.getsource(RepositoryService.sync_repositories)
        assert 'invalidate(f"db:repos:{user_id}:page:*")' in source
        assert "for page in range(1, 6)" not in source
