"""
Regression tests for the Phase 4 work: AI call correctness, async behaviour,
cost control, and the GitHub scope correction.

The AI defects here were all silent - the analysis kept returning a result, it
was just the wrong one. Nothing surfaced them.
"""
import ast
import asyncio
import inspect
import pathlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

BACKEND = pathlib.Path(__file__).resolve().parent.parent


def _make_completion(content: str, finish_reason: str = "stop", total_tokens: int = 100):
    choice = MagicMock()
    choice.message.content = content
    choice.finish_reason = finish_reason

    response = MagicMock()
    response.choices = [choice]
    response.usage.total_tokens = total_tokens
    return response


@pytest.fixture
def agent():
    """A concrete BaseAgent with a mocked OpenAI client."""
    from app.agents.base_agent import BaseAgent

    class _Agent(BaseAgent):
        async def analyze(self, code, file_path, context=None):
            return {}

        def get_agent_type(self):
            return "security"

    instance = _Agent()
    instance.client = MagicMock()
    return instance


# ---------------------------------------------------------------------------
# Truncated responses silently became "no issues found"
# ---------------------------------------------------------------------------

class TestTruncatedResponsesAreNotSilent:

    @pytest.mark.asyncio
    async def test_length_finish_reason_raises(self, agent):
        """
        max_tokens was hardcoded at 2000. The analysis prompt asks for several
        findings with descriptions and suggestions, which exceeds that for a
        batch of 8 files - the model stopped mid-JSON, the parse failed, and the
        failure was caught into an empty issue list.
        """
        from app.agents.base_agent import LLMResponseTruncated

        agent.client.chat.completions.create.return_value = _make_completion(
            '{"issues": [{"severity": "cri', finish_reason="length"
        )

        with pytest.raises(LLMResponseTruncated):
            await agent._call_llm([{"role": "user", "content": "x"}])

    @pytest.mark.asyncio
    async def test_complete_response_returns_content(self, agent):
        agent.client.chat.completions.create.return_value = _make_completion('{"issues": []}')

        result = await agent._call_llm([{"role": "user", "content": "x"}])
        assert result == '{"issues": []}'

    def test_output_token_limit_is_configurable_and_generous(self):
        from app.core.config import get_settings

        assert get_settings().OPENAI_MAX_OUTPUT_TOKENS >= 4000

    def test_limit_is_not_hardcoded(self):
        source = (BACKEND / "app/agents/base_agent.py").read_text(encoding="utf-8")
        assert "self.max_tokens = 2000" not in source


class TestJsonModeIsUsedForParsedResponses:

    @pytest.mark.asyncio
    async def test_json_mode_sets_response_format(self, agent):
        agent.client.chat.completions.create.return_value = _make_completion("{}")

        await agent._call_llm([{"role": "user", "content": "x"}], json_mode=True)

        kwargs = agent.client.chat.completions.create.call_args.kwargs
        assert kwargs["response_format"] == {"type": "json_object"}

    @pytest.mark.asyncio
    async def test_json_mode_is_off_by_default(self, agent):
        agent.client.chat.completions.create.return_value = _make_completion("hi")

        await agent._call_llm([{"role": "user", "content": "x"}])

        assert "response_format" not in agent.client.chat.completions.create.call_args.kwargs

    def test_batch_analysis_requests_json_mode(self):
        """Removes the markdown-fence hunting that failed silently."""
        from app.agents.orchestrator import AgentOrchestrator

        source = inspect.getsource(AgentOrchestrator._analyze_file_batch)
        assert "json_mode=True" in source
        assert '"```json" in json_str' not in source


# ---------------------------------------------------------------------------
# A failed batch is not "clean code, score 50"
# ---------------------------------------------------------------------------

class TestFailedBatchesDoNotSkewScores:

    def test_batch_failure_returns_none_not_neutral_scores(self):
        from app.agents.orchestrator import AgentOrchestrator

        source = inspect.getsource(AgentOrchestrator._analyze_file_batch)
        # The old sentinel pulled the repository average toward 50 and was
        # indistinguishable from a genuine "mediocre code" finding.
        assert '{"issues": [], "security_score": 50' not in source

    def test_a_failed_batch_contributes_no_findings(self):
        """
        The original defect: a failed batch returned zero issues with neutral 50
        scores, which were averaged in - dragging the repository toward
        "mediocre" and looking identical in the UI to a genuine finding.

        Scoring is now computed from findings rather than from averaged
        per-batch scores, so a batch that fails simply contributes nothing.
        What still has to hold is that its result is skipped rather than treated
        as an empty-but-successful batch.
        """
        from app.agents.orchestrator import AgentOrchestrator

        source = inspect.getsource(AgentOrchestrator.analyze_repository)
        assert 'if batch_result and isinstance(batch_result, dict) and "issues" in batch_result:' in source
        assert "elif batch_result is not None:" in source

    def test_scores_come_from_findings_not_batch_averages(self):
        from app.services.scoring import score_findings

        # No findings from any batch -> a clean result, not a neutral 50.
        assert score_findings([])["overall"] == 100


# ---------------------------------------------------------------------------
# Prompt hardening
# ---------------------------------------------------------------------------

class TestPromptDoesNotManufactureFindings:

    @pytest.fixture(scope="class")
    def prompt_source(self):
        from app.agents.orchestrator import AgentOrchestrator
        return inspect.getsource(AgentOrchestrator._analyze_file_batch)

    def test_no_minimum_findings_quota(self, prompt_source):
        """
        The prompt instructed the model to invent issues: "YOU MUST FIND ISSUES",
        "You MUST find at least 5 real issues", "Perfect 100 is IMPOSSIBLE". On
        clean code that manufactures false positives, which is worse than a miss
        because it discredits every genuine finding alongside it.
        """
        assert "You MUST find at least 5" not in prompt_source
        assert "YOU MUST FIND ISSUES" not in prompt_source
        assert "Perfect 100 is IMPOSSIBLE" not in prompt_source

    def test_empty_result_is_explicitly_allowed(self, prompt_source):
        assert "empty issues array is an acceptable answer" in prompt_source

    def test_repository_content_is_delimited_as_untrusted(self, prompt_source):
        """Repo content goes straight into the prompt; it must be framed as data."""
        assert "BEGIN UNTRUSTED REPOSITORY CONTENT" in prompt_source
        assert "END UNTRUSTED REPOSITORY CONTENT" in prompt_source

    def test_injection_attempts_are_reportable(self, prompt_source):
        assert "prompt_injection" in prompt_source


# ---------------------------------------------------------------------------
# Cost control
# ---------------------------------------------------------------------------

@pytest.fixture
def budget_redis(monkeypatch):
    store = {}

    class FakeClient:
        def get(self, key):
            return str(store.get(key, 0)).encode()

        def incrby(self, key, amount):
            store[key] = store.get(key, 0) + amount
            return store[key]

        def expire(self, key, ttl):
            return True

    service = MagicMock()
    service.available = True
    service.client = FakeClient()
    monkeypatch.setattr("app.services.llm_budget.get_redis_service", lambda: service)
    return store


class TestPerUserSpendCap:

    @pytest.mark.asyncio
    async def test_under_budget_is_allowed(self, budget_redis, monkeypatch):
        from app.services import llm_budget

        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 1000, raising=False
        )
        llm_budget.record_spend("user-1", 100)

        await llm_budget.enforce_spend_budget("user-1")  # must not raise

    @pytest.mark.asyncio
    async def test_over_budget_is_refused(self, budget_redis, monkeypatch):
        from app.services import llm_budget

        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 1000, raising=False
        )
        llm_budget.record_spend("user-1", 1500)

        with pytest.raises(llm_budget.LLMBudgetExceeded):
            await llm_budget.enforce_spend_budget("user-1")

    @pytest.mark.asyncio
    async def test_budget_is_per_user(self, budget_redis, monkeypatch):
        from app.services import llm_budget

        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 1000, raising=False
        )
        llm_budget.record_spend("user-1", 1500)

        await llm_budget.enforce_spend_budget("user-2")  # unaffected

    @pytest.mark.asyncio
    async def test_zero_disables_the_cap(self, budget_redis, monkeypatch):
        from app.services import llm_budget

        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 0, raising=False
        )
        llm_budget.record_spend("user-1", 10_000_000)

        await llm_budget.enforce_spend_budget("user-1")

    @pytest.mark.asyncio
    async def test_fails_open_when_redis_is_down(self, monkeypatch):
        """A cache outage must not stop the product working; the cap catches
        runaway usage, it is not a security boundary."""
        from app.services import llm_budget

        down = MagicMock()
        down.available = False
        monkeypatch.setattr("app.services.llm_budget.get_redis_service", lambda: down)
        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 1, raising=False
        )

        await llm_budget.enforce_spend_budget("user-1")

    @pytest.mark.asyncio
    async def test_usage_is_recorded_from_the_response(self, agent, budget_redis, monkeypatch):
        from app.services import llm_budget

        monkeypatch.setattr(
            llm_budget.settings, "OPENAI_DAILY_TOKEN_BUDGET_PER_USER", 100_000, raising=False
        )
        agent.client.chat.completions.create.return_value = _make_completion(
            "{}", total_tokens=4242
        )

        await agent._call_llm([{"role": "user", "content": "x"}], user_id="user-1")

        assert llm_budget.get_spend("user-1") == 4242

    def test_orchestrator_attributes_spend_to_a_user(self):
        from app.agents.orchestrator import AgentOrchestrator

        assert "user_id" in inspect.signature(AgentOrchestrator.__init__).parameters


# ---------------------------------------------------------------------------
# Async correctness
# ---------------------------------------------------------------------------

class TestStaticAnalysisIsGenuinelyParallel:

    def test_wrappers_do_not_call_sync_code_inline(self):
        """
        The old wrappers were `async def` bodies calling _run_static_analysis
        with no await, so gather() over them was sequential execution plus
        coroutine overhead - and it blocked the loop throughout.
        """
        from app.agents.orchestrator import AgentOrchestrator

        source = inspect.getsource(AgentOrchestrator.analyze_repository)
        assert "run_blocking(" in source
        assert "async def run_best_practices" not in source
        assert "async def run_security" not in source

    @pytest.mark.asyncio
    async def test_run_blocking_uses_a_worker_thread(self):
        import threading
        from app.core.concurrency import run_blocking

        caller = threading.get_ident()
        worker = await run_blocking(threading.get_ident)

        assert worker != caller


class TestNoBlockingLlmCallOnTheEventLoop:

    def test_call_llm_delegates_to_the_threadpool(self):
        from app.agents.base_agent import BaseAgent

        assert "run_blocking" in inspect.getsource(BaseAgent._call_llm)

    @pytest.mark.asyncio
    async def test_concurrent_calls_actually_overlap(self, agent):
        """A sync client called inline would serialise these."""
        import time

        started = []

        def slow_create(**kwargs):
            started.append(time.time())
            time.sleep(0.15)
            return _make_completion("{}")

        agent.client.chat.completions.create.side_effect = slow_create

        began = time.time()
        await asyncio.gather(*[
            agent._call_llm([{"role": "user", "content": str(i)}]) for i in range(4)
        ])
        elapsed = time.time() - began

        assert len(started) == 4
        # Serial would be ~0.6s; overlapping should land well under that.
        assert elapsed < 0.45, f"calls did not overlap (took {elapsed:.2f}s)"


# ---------------------------------------------------------------------------
# GitHub OAuth scope - correcting an earlier over-correction
# ---------------------------------------------------------------------------

class TestGitHubScopeSupportsThePfroduct:
    """
    Phase 1 narrowed the scope to `read:user user:email` on least-privilege
    grounds. That was wrong: an OAuth App has no read-only private-repository
    scope, so `repo` is the minimum that can read a private repo at all, and
    auto-fix needs write access to open pull requests. Narrowing it would have
    broken private-repo analysis and the entire auto-fix feature.
    """

    def test_repo_scope_is_requested(self):
        from app.core.config import get_settings

        assert "repo" in get_settings().GITHUB_OAUTH_SCOPES

    def test_scope_is_configurable_not_hardcoded(self):
        from app.api.routes import auth

        source = inspect.getsource(auth.github_authorize)
        assert "settings.GITHUB_OAUTH_SCOPES" in source
        assert '"scope": "read:user user:email"' not in source

    def test_write_operations_that_require_repo_scope_exist(self):
        """Documents WHY the broad scope is needed, so it is not re-narrowed."""
        from app.services.github_service import GitHubService

        for method in ("create_branch", "update_file", "create_pull_request"):
            assert hasattr(GitHubService, method)


# ---------------------------------------------------------------------------
# 4.3 / 4.4
# ---------------------------------------------------------------------------

class TestWebhookDeletionIsHonest:

    @pytest.mark.asyncio
    async def test_deleting_a_foreign_webhook_reports_failure(self):
        from app.services.webhook_service import WebhookService

        service = WebhookService.__new__(WebhookService)
        service.db = MagicMock()
        service.db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = \
            MagicMock(data=[])

        assert await service.delete_webhook("someone-elses-id", "user-1") is False

    @pytest.mark.asyncio
    async def test_deleting_an_owned_webhook_reports_success(self):
        from app.services.webhook_service import WebhookService

        service = WebhookService.__new__(WebhookService)
        service.db = MagicMock()
        service.db.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = \
            MagicMock(data=[{"id": "wh-1"}])

        assert await service.delete_webhook("wh-1", "user-1") is True


class TestRevokedRepositoriesArePruned:

    @pytest.fixture
    def service(self):
        from app.services.repository_service import RepositoryService

        instance = RepositoryService.__new__(RepositoryService)
        instance.db = MagicMock()
        instance.redis = MagicMock()
        return instance

    @pytest.mark.asyncio
    async def test_rows_for_inaccessible_repos_are_removed(self, service):
        service.db.table.return_value.select.return_value.eq.return_value.execute.return_value = \
            MagicMock(data=[
                {"id": "repo-a", "github_repo_id": 1},
                {"id": "repo-b", "github_repo_id": 2},  # no longer visible
            ])

        removed = await service._prune_revoked_repositories("user-1", [1])

        assert removed == 1

    @pytest.mark.asyncio
    async def test_empty_sync_result_deletes_nothing(self, service):
        """An empty GitHub response is far more likely to be an API blip than
        the user genuinely owning zero repositories."""
        removed = await service._prune_revoked_repositories("user-1", [])

        assert removed == 0
        service.db.table.return_value.delete.assert_not_called()

    def test_sync_prunes(self):
        from app.services.repository_service import RepositoryService

        source = inspect.getsource(RepositoryService.sync_repositories)
        assert "_prune_revoked_repositories" in source
