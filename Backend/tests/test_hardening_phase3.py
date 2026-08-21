"""
Regression tests for the Phase 3 hardening work.

Deployment shape, cross-worker state, analysis honesty and dependency hygiene -
all things that were wrong in ways no test would have noticed.
"""
import inspect
import pathlib
import pytest
from unittest.mock import MagicMock, patch

import yaml


REPO = pathlib.Path(__file__).resolve().parent.parent.parent
BACKEND = REPO / "Backend"


# ---------------------------------------------------------------------------
# H-14: CI could not fail
# ---------------------------------------------------------------------------

class TestCIHasRealGates:

    @pytest.fixture(scope="class")
    def workflow_text(self):
        return (REPO / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    @pytest.fixture(scope="class")
    def workflow(self, workflow_text):
        return yaml.safe_load(workflow_text)

    def test_no_step_is_neutralised_with_or_true(self, workflow_text):
        """Every gate ended in `|| true`, so CI was incapable of failing."""
        assert "|| true" not in workflow_text

    def test_advisory_steps_are_explicitly_marked(self, workflow):
        """Steps that may fail must say so via continue-on-error, not `|| true`."""
        for job_name, job in workflow["jobs"].items():
            for step in job.get("steps", []):
                name = step.get("name", "")
                if "advisory" in name.lower():
                    assert step.get("continue-on-error") is True, (
                        f"{job_name}/{name} is labelled advisory but is blocking"
                    )

    def test_blocking_steps_exist_in_every_quality_job(self, workflow):
        for job_name in ("backend-test", "backend-lint", "frontend-test", "security-scan"):
            job = workflow["jobs"][job_name]
            blocking = [
                s for s in job.get("steps", [])
                if s.get("name") and not s.get("continue-on-error")
            ]
            assert blocking, f"{job_name} has no blocking step"

    def test_frontend_typecheck_actually_typechecks(self, workflow):
        """`npm run build -- --noEmit` forwards a tsc flag to vite, which ignores it."""
        runs = [
            s.get("run", "")
            for s in workflow["jobs"]["frontend-test"]["steps"]
        ]
        assert any("npx tsc --noEmit" in r for r in runs)
        # Check the executed commands, not the comment explaining the old one.
        assert not any("npm run build -- --noEmit" in r for r in runs)

    def test_coverage_floor_is_enforced(self, workflow_text):
        assert "--cov-fail-under" in workflow_text

    def test_build_uses_a_reproducible_install(self, workflow_text):
        """`rm -rf package-lock.json && npm install` discards the lockfile."""
        assert "rm -rf node_modules package-lock.json" not in workflow_text
        assert "npm ci" in workflow_text


class TestConftestHasNoFallbackApp:
    """H-14: the fixture substituted a stub whose handlers matched the assertions."""

    def test_app_fixture_does_not_swallow_import_errors(self):
        source = (BACKEND / "tests/conftest.py").read_text(encoding="utf-8")
        assert "minimal_app" not in source
        assert "Using minimal fallback app" not in source


# ---------------------------------------------------------------------------
# M-1: two divergent entrypoints
# ---------------------------------------------------------------------------

class TestSingleEntrypoint:

    MANIFESTS = [
        "Backend/Dockerfile",
        "Backend/docker-compose.yml",
        "Backend/start.sh",
        "Backend/Procfile",
        "Backend/railway.toml",
        "Backend/nixpacks.toml",
    ]

    @pytest.mark.parametrize("manifest", MANIFESTS)
    def test_manifest_runs_the_real_app(self, manifest):
        """
        Docker, compose and start.sh ran app.main:app, which registered 5 of the
        11 routers, used allow_methods=["*"], and had no rate limiting.
        """
        text = (REPO / manifest).read_text(encoding="utf-8")
        assert "main:app" in text
        assert "app.main:app" not in text

    def test_app_main_is_a_shim_over_the_real_app(self):
        import main
        import app.main

        assert app.main.app is main.app

    def test_every_router_is_registered(self):
        import main

        paths = " ".join(r.path for r in main.app.routes if hasattr(r, "path"))
        for prefix in (
            "auth", "users", "github", "analysis", "chat", "webhooks",
            "organizations", "teams", "developers", "executive", "alerts",
        ):
            assert f"/api/v1/{prefix}" in paths, f"{prefix} router missing"


# ---------------------------------------------------------------------------
# H-9: per-process analysis state
# ---------------------------------------------------------------------------

@pytest.fixture
def registry_redis(monkeypatch):
    store = {}

    class FakeClient:
        def setex(self, key, ttl, value):
            store[key] = value if isinstance(value, bytes) else str(value).encode()
            return True

        def get(self, key):
            return store.get(key)

        def delete(self, *keys):
            return sum(1 for k in keys if store.pop(k, None) is not None)

        def exists(self, key):
            return 1 if key in store else 0

    service = MagicMock()
    service.available = True
    service.client = FakeClient()
    monkeypatch.setattr(
        "app.services.analysis_registry.get_redis_service", lambda: service
    )
    return service


class TestAnalysisRegistryIsSharedAcrossWorkers:

    def test_running_marker_roundtrips(self, registry_redis):
        from app.services import analysis_registry

        analysis_registry.set_running("user-1", "analysis-1")
        assert analysis_registry.get_running("user-1") == "analysis-1"

    def test_clear_running_is_idempotent(self, registry_redis):
        from app.services import analysis_registry

        analysis_registry.set_running("user-1", "analysis-1")
        analysis_registry.clear_running("user-1", "analysis-1")
        assert analysis_registry.get_running("user-1") is None

    def test_clear_running_does_not_evict_a_superseding_analysis(self, registry_redis):
        """A task finishing late must not release the slot of the one that replaced it."""
        from app.services import analysis_registry

        analysis_registry.set_running("user-1", "analysis-2")
        analysis_registry.clear_running("user-1", "analysis-1")  # the old one, finishing late

        assert analysis_registry.get_running("user-1") == "analysis-2"

    def test_cancellation_is_visible_to_another_worker(self, registry_redis):
        from app.services import analysis_registry

        assert analysis_registry.request_cancellation("analysis-1") is True
        assert analysis_registry.is_cancelled("analysis-1") is True

    def test_cancellation_clears(self, registry_redis):
        from app.services import analysis_registry

        analysis_registry.request_cancellation("analysis-1")
        analysis_registry.clear_cancellation("analysis-1")
        assert analysis_registry.is_cancelled("analysis-1") is False

    def test_cancellation_reports_failure_when_redis_is_down(self, monkeypatch):
        from app.services import analysis_registry

        down = MagicMock()
        down.available = False
        monkeypatch.setattr(
            "app.services.analysis_registry.get_redis_service", lambda: down
        )
        # The route turns False into a 503 rather than claiming the analysis stopped.
        assert analysis_registry.request_cancellation("analysis-1") is False

    def test_no_module_level_state_remains(self):
        analysis_route = (BACKEND / "app/api/routes/analysis.py").read_text(encoding="utf-8")
        tasks = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")

        assert "_running_analyses: dict" not in analysis_route
        assert "_cancelled_analyses: set" not in tasks

    def test_running_marker_is_released_on_every_exit_path(self):
        from app.tasks.analysis_tasks import run_analysis_sync

        source = inspect.getsource(run_analysis_sync)
        assert "finally:" in source
        assert "clear_running" in source


class TestCompletedAnalysesAreNotOverwritten:
    """Starting a new analysis marked the previous COMPLETED one as cancelled."""

    def test_only_in_flight_analyses_are_cancelled(self):
        from app.api.routes import analysis

        source = inspect.getsource(analysis.start_analysis)
        assert 'in ("pending", "starting", "in_progress")' in source


# ---------------------------------------------------------------------------
# P-1 / P-2: analysis honesty
# ---------------------------------------------------------------------------

class TestAnalysisSamplingIsDisclosed:

    def test_file_limit_is_configurable(self):
        from app.core.config import get_settings

        settings = get_settings()
        assert settings.ANALYSIS_MAX_FILES >= 1
        assert settings.ANALYSIS_MAX_FILE_BYTES > 0

    def test_limit_is_not_hardcoded(self):
        source = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")
        assert "MAX_FILES = 15" not in source
        assert "settings.ANALYSIS_MAX_FILES" in source

    def test_sample_size_is_reported_with_the_result(self):
        """Scores presented as repo-wide were computed from <1% of the code."""
        source = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")
        assert '"files_eligible": files_eligible' in source


class TestAnalysisCacheIsKeyedOnTheCommit:

    def test_commit_sha_is_resolved(self):
        source = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")
        assert "commit_sha = None  # TODO" not in source
        assert "get_default_branch_sha" in source

    def test_no_cache_lookup_without_a_sha(self):
        """Without a SHA there is no safe key, so it must analyse fresh."""
        source = (BACKEND / "app/tasks/analysis_tasks.py").read_text(encoding="utf-8")
        assert "if commit_sha else None" in source

    def test_github_service_exposes_head_sha(self):
        from app.services.github_service import GitHubService

        assert hasattr(GitHubService, "get_default_branch_sha")


# ---------------------------------------------------------------------------
# M-5: pickle deserialisation
# ---------------------------------------------------------------------------

class TestCacheNeverUnpickles:

    def test_pickle_is_not_imported(self):
        """Checked via AST - the docstring names pickle as the thing it removed."""
        import ast

        tree = ast.parse(
            (BACKEND / "app/services/redis_service.py").read_text(encoding="utf-8")
        )

        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])

        assert "pickle" not in imported

        called = {
            f"{n.func.value.id}.{n.func.attr}"
            for n in ast.walk(tree)
            if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Attribute)
            and isinstance(n.func.value, ast.Name)
        }
        assert "pickle.loads" not in called
        assert "pickle.dumps" not in called

    def test_unparseable_entry_is_treated_as_a_miss(self):
        from app.services.redis_service import RedisService

        service = RedisService.__new__(RedisService)
        assert service._deserialize(b"\x80\x04\x95not-json") is None


# ---------------------------------------------------------------------------
# Dependency hygiene
# ---------------------------------------------------------------------------

class TestRequirementsAreHonest:

    @pytest.fixture(scope="class")
    def requirements(self):
        return (BACKEND / "requirements.txt").read_text(encoding="utf-8")

    def test_celery_is_pinned(self, requirements):
        """It was unpinned, so builds were not reproducible."""
        lines = [
            l.strip() for l in requirements.splitlines()
            if l.strip().startswith("celery")
        ]
        assert lines and "==" in lines[0]

    @pytest.mark.parametrize("package", ["langchain", "langgraph", "slowapi", "radon"])
    def test_unused_heavy_packages_are_removed(self, requirements, package):
        declared = [
            l for l in requirements.splitlines()
            if l.strip().startswith(package)
        ]
        assert not declared, f"{package} is declared but imported nowhere"

    def test_every_pin_is_exact_or_bounded(self, requirements):
        for line in requirements.splitlines():
            line = line.split("#")[0].strip()
            if not line:
                continue
            assert any(op in line for op in ("==", ">=", "<=", "~=")), (
                f"unpinned requirement: {line}"
            )


class TestNoPipLogsCommitted:

    @pytest.mark.parametrize("name", ["install_log.txt", "install_log_2.txt"])
    def test_log_is_gone(self, name):
        assert not (BACKEND / name).exists()
