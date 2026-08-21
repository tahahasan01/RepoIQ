"""
Regression tests for the scale work: queue dispatch, hot-path caching,
incremental analysis, and full async conversion.

These properties are all easy to undo with a well-meaning edit and produce no
visible failure when they are - the app keeps working, just badly.
"""
import ast
import inspect
import pathlib
import pytest
from unittest.mock import MagicMock, patch

BACKEND = pathlib.Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# No blocking DB call may return to the event loop
# ---------------------------------------------------------------------------

def _own_scope(node):
    """Child nodes in this function's own scope, not nested sync ones."""
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.Lambda, ast.AsyncFunctionDef)):
            continue
        yield child
        yield from _own_scope(child)


def _blocking_calls(path: pathlib.Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = []

    class Visitor(ast.NodeVisitor):
        def visit_AsyncFunctionDef(self, node):
            scope = list(_own_scope(node))

            protected = set()
            for child in scope:
                if (
                    isinstance(child, ast.Call)
                    and isinstance(child.func, ast.Name)
                    and child.func.id == "run_blocking"
                ):
                    for inner in ast.walk(child):
                        protected.add(id(inner))

            for child in scope:
                if (
                    isinstance(child, ast.Call)
                    and isinstance(child.func, ast.Attribute)
                    and child.func.attr == "execute"
                    and id(child) not in protected
                ):
                    found.append(f"{path.name}:{child.lineno} {node.name}()")

            self.generic_visit(node)

    Visitor().visit(tree)
    return found


class TestNoBlockingDatabaseCallsOnTheEventLoop:
    """
    supabase-py is synchronous. An `async def` that calls it directly does not
    yield - it stalls every other request on that worker for the round trip.
    There were 111 of these.
    """

    def test_no_unwrapped_execute_in_async_functions(self):
        offenders = []
        for directory in ("app/services", "app/api/routes", "app/tasks"):
            for path in sorted((BACKEND / directory).glob("*.py")):
                offenders.extend(_blocking_calls(path))

        assert not offenders, (
            "blocking supabase calls on the event loop:\n  " + "\n  ".join(offenders)
        )

    def test_the_scanner_is_not_vacuously_passing(self):
        """A scanner that finds nothing anywhere is broken, not clean."""
        wrapped = 0
        for directory in ("app/services", "app/api/routes", "app/tasks"):
            for path in sorted((BACKEND / directory).glob("*.py")):
                wrapped += path.read_text(encoding="utf-8").count("run_blocking(")

        assert wrapped > 80, f"only {wrapped} wrapped calls; the conversion is missing"


# ---------------------------------------------------------------------------
# Analysis runs on the queue, not in the API process
# ---------------------------------------------------------------------------

class TestAnalysisDispatch:

    def test_route_does_not_hardcode_background_tasks(self):
        from app.api.routes import analysis

        source = inspect.getsource(analysis.start_analysis)
        assert "dispatch_analysis" in source
        assert "background_tasks.add_task(\n            run_analysis_sync" not in source

    def test_queue_mode_uses_celery(self, monkeypatch):
        from app.services import analysis_dispatch

        monkeypatch.setattr(
            analysis_dispatch.settings, "ANALYSIS_EXECUTION_MODE", "queue", raising=False
        )
        with patch("app.tasks.analysis_tasks.analyze_repository_task") as task:
            mode = analysis_dispatch.dispatch_analysis(
                repo_id="r", user_id="u", analysis_id="a", github_token="t"
            )

        assert mode == "queue"
        task.delay.assert_called_once()

    def test_queued_task_never_receives_the_github_token(self, monkeypatch):
        """Celery serialises kwargs into the Redis broker in plaintext."""
        from app.services import analysis_dispatch

        monkeypatch.setattr(
            analysis_dispatch.settings, "ANALYSIS_EXECUTION_MODE", "queue", raising=False
        )
        with patch("app.tasks.analysis_tasks.analyze_repository_task") as task:
            analysis_dispatch.dispatch_analysis(
                repo_id="r", user_id="u", analysis_id="a", github_token="ghp_secret"
            )

        kwargs = task.delay.call_args.kwargs
        assert "github_token" not in kwargs
        assert "ghp_secret" not in str(kwargs)

    def test_inline_mode_uses_the_fallback(self, monkeypatch):
        from app.services import analysis_dispatch

        monkeypatch.setattr(
            analysis_dispatch.settings, "ANALYSIS_EXECUTION_MODE", "inline", raising=False
        )
        calls = []
        mode = analysis_dispatch.dispatch_analysis(
            repo_id="r", user_id="u", analysis_id="a", github_token="t",
            add_background_task=lambda *a, **k: calls.append((a, k)),
        )

        assert mode == "inline"
        assert len(calls) == 1

    def test_inline_without_a_fallback_raises(self, monkeypatch):
        from app.services import analysis_dispatch

        monkeypatch.setattr(
            analysis_dispatch.settings, "ANALYSIS_EXECUTION_MODE", "inline", raising=False
        )
        with pytest.raises(RuntimeError):
            analysis_dispatch.dispatch_analysis(
                repo_id="r", user_id="u", analysis_id="a", github_token="t"
            )


class TestCeleryIsTunedForLongTasks:

    def test_prefetch_is_one(self):
        """4 parked three users' analyses behind one worker."""
        from app.core.celery_app import celery_app

        assert celery_app.conf.worker_prefetch_multiplier == 1

    def test_tasks_are_acked_late(self):
        """So a worker killed mid-analysis requeues instead of losing the job."""
        from app.core.celery_app import celery_app

        assert celery_app.conf.task_acks_late is True
        assert celery_app.conf.task_reject_on_worker_lost is True


# ---------------------------------------------------------------------------
# The hottest query in the system
# ---------------------------------------------------------------------------

class TestUserLookupIsCached:
    """get_user runs on EVERY authenticated request via get_current_user."""

    @pytest.fixture
    def service(self):
        from app.services.auth_service import AuthService

        instance = AuthService.__new__(AuthService)
        instance.service_db = MagicMock()
        instance.redis = MagicMock()
        return instance

    @pytest.mark.asyncio
    async def test_cache_hit_skips_the_database(self, service):
        service.redis.get.return_value = {"id": "u1", "email": "a@b.c"}

        result = await service.get_user("u1")

        assert result["id"] == "u1"
        service.service_db.table.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_miss_populates(self, service):
        service.redis.get.return_value = None
        service.service_db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = \
            MagicMock(data={"id": "u1"})

        await service.get_user("u1")

        service.redis.set.assert_called_once()
        assert service.redis.set.call_args.kwargs.get("ttl") == 60

    def test_mutations_invalidate(self):
        from app.services.auth_service import AuthService

        for method in (AuthService.update_user, AuthService.delete_user):
            assert "invalidate_user_cache" in inspect.getsource(method)

    def test_github_link_invalidates(self):
        """A reconnect changes the stored token; the cache must not hide that."""
        from app.services.auth_service import AuthService

        assert "invalidate_user_cache" in inspect.getsource(AuthService.github_oauth)


# ---------------------------------------------------------------------------
# Incremental analysis
# ---------------------------------------------------------------------------

@pytest.fixture
def incremental_redis(monkeypatch):
    store = {}

    class FakeClient:
        def get(self, key):
            return store.get(key)

        def setex(self, key, ttl, value):
            store[key] = value
            return True

    service = MagicMock()
    service.available = True
    service.client = FakeClient()
    monkeypatch.setattr(
        "app.services.incremental_analysis.get_redis_service", lambda: service
    )
    return store


class TestIncrementalAnalysis:

    def test_unseen_files_need_analysis(self, incremental_redis):
        from app.services.incremental_analysis import partition_files

        files = [{"path": "a.py", "content": "x", "sha": "sha-a"}]
        needs, reused, unchanged = partition_files(files)

        assert len(needs) == 1
        assert reused == [] and unchanged == []

    def test_previously_analysed_content_is_reused(self, incremental_redis):
        from app.services.incremental_analysis import partition_files, store_findings

        store_findings("sha-a", [{"severity": "high", "file_path": "a.py"}])

        needs, reused, unchanged = partition_files(
            [{"path": "a.py", "content": "x", "sha": "sha-a"}]
        )

        assert needs == []
        assert len(reused) == 1 and len(unchanged) == 1

    def test_clean_files_are_cached_too(self, incremental_redis):
        """Otherwise every clean file is re-analysed forever."""
        from app.services.incremental_analysis import partition_files, store_findings

        store_findings("sha-clean", [])
        needs, reused, unchanged = partition_files(
            [{"path": "a.py", "content": "x", "sha": "sha-clean"}]
        )

        assert needs == []
        assert reused == [] and len(unchanged) == 1

    def test_changed_content_gets_a_different_key(self, incremental_redis):
        from app.services.incremental_analysis import partition_files, store_findings

        store_findings("sha-old", [{"severity": "low"}])
        needs, _, _ = partition_files(
            [{"path": "a.py", "content": "x", "sha": "sha-new"}]
        )

        assert len(needs) == 1, "an edited file must be re-analysed"

    def test_findings_are_restamped_with_the_current_path(self, incremental_redis):
        """The same blob can live at a different path in another repo."""
        from app.services.incremental_analysis import partition_files, store_findings

        store_findings("sha-a", [{"severity": "high", "file_path": "old/place.py"}])
        _, reused, _ = partition_files(
            [{"path": "new/place.py", "content": "x", "sha": "sha-a"}]
        )

        assert reused[0]["file_path"] == "new/place.py"

    def test_files_without_a_sha_are_analysed(self, incremental_redis):
        from app.services.incremental_analysis import partition_files

        needs, _, _ = partition_files([{"path": "a.py", "content": "x"}])
        assert len(needs) == 1

    def test_cache_key_includes_the_model_and_analyser_version(self):
        """Findings from an older prompt or model must not be served as current."""
        from app.services import incremental_analysis

        key = incremental_analysis._key("abc")
        assert incremental_analysis.ANALYSER_VERSION in key
        assert incremental_analysis.settings.OPENAI_MODEL in key

    def test_record_batch_caches_per_file(self, incremental_redis):
        from app.services.incremental_analysis import record_batch_findings, get_cached_findings

        files = [
            {"path": "a.py", "sha": "sha-a"},
            {"path": "b.py", "sha": "sha-b"},
        ]
        record_batch_findings(files, [{"file_path": "a.py", "severity": "high"}])

        assert len(get_cached_findings("sha-a")) == 1
        assert get_cached_findings("sha-b") == []  # clean, but cached

    def test_pipeline_carries_the_blob_sha(self):
        source = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")
        assert '"sha": file.get("sha")' in source

    def test_totals_are_recalculated_after_merging(self):
        """Reused findings must count toward the score, not be dropped from it."""
        from app.agents.orchestrator import AgentOrchestrator

        merged = AgentOrchestrator.recalculate_totals({
            "issues": [
                {"severity": "critical", "agent_type": "security"},
                {"severity": "low", "agent_type": "quality"},
            ],
            "architecture_score": 80,
        })

        assert merged["total_issues"] == 2
        assert merged["critical_issues"] == 1
        assert merged["security_score"] < 100

    def test_file_limit_was_raised(self):
        """The whole point of incremental analysis."""
        from app.core.config import get_settings

        assert get_settings().ANALYSIS_MAX_FILES >= 100


# ---------------------------------------------------------------------------
# Observability
# ---------------------------------------------------------------------------

class TestRequestCorrelation:
    """
    At scale, log lines from hundreds of concurrent requests interleave. Without
    a correlation id a single user's failed analysis cannot be reconstructed.
    """

    def test_every_response_carries_a_request_id(self, client):
        response = client.get("/live")
        assert response.headers.get("X-Request-ID")

    def test_ids_are_unique_per_request(self, client):
        first = client.get("/live").headers["X-Request-ID"]
        second = client.get("/live").headers["X-Request-ID"]
        assert first != second

    def test_upstream_id_is_honoured(self, client):
        """So a trace spans the proxy and the app."""
        response = client.get("/live", headers={"X-Request-ID": "trace-abc123"})
        assert response.headers["X-Request-ID"] == "trace-abc123"

    def test_malicious_upstream_id_is_rejected(self, client):
        """This value reaches the logs; newlines would forge log entries."""
        response = client.get("/live", headers={"X-Request-ID": "evil\nFAKE LOG LINE"})
        assert "\n" not in response.headers["X-Request-ID"]
        assert response.headers["X-Request-ID"] != "evil\nFAKE LOG LINE"

    def test_overlong_upstream_id_is_rejected(self):
        from app.middleware.request_context import RequestContextMiddleware
        source = inspect.getsource(RequestContextMiddleware.dispatch)
        assert "[:64]" in source

    def test_responses_report_server_timing(self, client):
        assert "Server-Timing" in client.get("/live").headers

    def test_errors_quote_the_request_id(self):
        """'It broke' is unactionable without one."""
        import main
        source = inspect.getsource(main.global_exception_handler)
        assert "request_id" in source


class TestHealthCheckIsNotALoadAmplifier:
    """/health is unauthenticated and runs a real Supabase query."""

    def test_result_is_cached(self):
        import main
        source = inspect.getsource(main.health_check)
        assert "_health_cache" in source

    def test_only_healthy_results_are_cached(self):
        """A degraded result must be re-checked so recovery is seen at once."""
        import main
        source = inspect.getsource(main.health_check)
        assert "if overall_healthy:" in source


class TestLifecycle:

    def test_shutdown_closes_connections(self):
        """It previously logged the same line twice and did nothing."""
        import main
        source = inspect.getsource(main.lifespan)
        assert "close()" in source
        assert source.count("Shutting down application...") == 0

    def test_startup_warms_shared_clients(self):
        """
        Opens the connection pool and Redis up front so the first request after
        a deploy does not pay to establish them. (Was get_service_client() under
        Supabase; the pool is the equivalent now.)
        """
        import main
        source = inspect.getsource(main.lifespan)
        assert "Database.get_pool()" in source
        assert "get_redis_service()" in source

    def test_shutdown_returns_pooled_connections(self):
        """A deploy that leaks connections eats into Postgres max_connections."""
        import main
        source = inspect.getsource(main.lifespan)
        assert "Database.close" in source
