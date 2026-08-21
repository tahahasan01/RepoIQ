"""
Tests for the honesty of an analysis result.

Two failures found by running a real analysis against a real repository:

1. Every AI batch failed with a 401, and the run still reported `completed`
   with a score. The dashboard showed a green result for a review that never
   happened - the most damaging failure mode a code-review product has, because
   the user acts on a clean bill of health that was never issued.

2. The static scanner ignored the `language` argument it was given, so Python
   rules ran against every file. A .sql file scored a CRITICAL "command
   injection" because the word EXECUTE matched a subprocess pattern.
"""
import pytest

from app.agents.security_agent import SecurityAgent


@pytest.fixture
def scanner():
    return SecurityAgent.__new__(SecurityAgent)


def categories(findings):
    return sorted(f["category"] for f in findings)


class TestScannerIsLanguageAware:

    def test_sql_file_is_not_a_python_command_injection(self, scanner):
        """The original false positive, verbatim."""
        code = "CREATE PROCEDURE p AS\nBEGIN\n  EXECUTE sp_helpdb;\nEND"

        assert scanner._run_static_analysis(code, "schema.sql", "unknown") == []

    def test_the_word_executed_in_a_comment_is_not_a_finding(self, scanner):
        code = "# this is executed once at startup\nx = 1"

        assert scanner._run_static_analysis(code, "app.py", "python") == []

    def test_javascript_regex_exec_is_not_a_finding(self, scanner):
        """`exec` in JS is overwhelmingly RegExp.prototype.exec."""
        code = "const m = /ab/.exec(str);\nconst e = new Executor();"

        assert scanner._run_static_analysis(code, "app.js", "javascript") == []

    def test_python_rules_do_not_run_on_unknown_languages(self, scanner):
        code = "subprocess.run(cmd, shell=True)"

        assert scanner._run_static_analysis(code, "notes.txt", "unknown") == []
        assert scanner._run_static_analysis(code, "app.py", "python") != []


class TestScannerStillCatchesRealProblems:
    """Precision must not have been bought with recall."""

    def test_shell_true_is_still_critical(self, scanner):
        found = scanner._run_static_analysis(
            "subprocess.run(cmd, shell=True)", "app.py", "python"
        )

        assert categories(found) == ["command_injection"]
        assert found[0]["severity"] == "critical"

    def test_fstring_sql_is_still_critical(self, scanner):
        found = scanner._run_static_analysis(
            "cursor.execute(f'SELECT * FROM u WHERE id={uid}')", "db.py", "python"
        )

        assert "sql_injection_fstring" in categories(found)

    def test_parameterised_query_is_clean(self, scanner):
        found = scanner._run_static_analysis(
            "cursor.execute('SELECT 1 FROM u WHERE id = %s', (uid,))", "db.py", "python"
        )

        assert found == []

    def test_hardcoded_secret_is_found_in_any_language(self, scanner):
        code = 'api_key = "sk-abcdef123456789"'

        for path, lang in (("cfg.py", "python"), ("cfg.js", "javascript"), ("cfg.conf", "unknown")):
            assert categories(scanner._run_static_analysis(code, path, lang)) == ["hardcoded_secret"]

    def test_node_command_injection_is_found(self, scanner):
        found = scanner._run_static_analysis(
            'child_process.exec("ls " + userInput)', "run.js", "javascript"
        )

        assert "command_injection_js" in categories(found)


class TestNoDuplicateFindings:
    """
    `subprocess.run(cmd, shell=True)` matched the command-injection rule twice,
    and the scorer penalised each match - one real problem read as two.
    """

    def test_one_line_yields_one_finding_per_rule(self, scanner):
        found = scanner._run_static_analysis(
            "subprocess.run(cmd, shell=True)", "app.py", "python"
        )

        assert len(found) == 1

    def test_distinct_lines_are_still_reported_separately(self, scanner):
        code = "subprocess.run(a, shell=True)\nsubprocess.call(b, shell=True)"
        found = scanner._run_static_analysis(code, "app.py", "python")

        assert sorted(f["line_number"] for f in found) == [1, 2]


class TestAFailedAIReviewIsNotAResult:
    """
    With an invalid API key every batch 401'd, the LLM contributed nothing, and
    the run still reported `completed` with a score derived from the regex
    scanner alone. It must fail loudly instead.
    """

    @pytest.fixture
    def orchestrator(self):
        from app.agents.orchestrator import AgentOrchestrator
        return AgentOrchestrator()

    @pytest.mark.asyncio
    async def test_every_batch_failing_raises(self, orchestrator, monkeypatch):
        from app.agents.orchestrator import AIAnalysisUnavailable

        async def always_401(*args, **kwargs):
            raise RuntimeError("Error code: 401 - invalid_api_key")

        monkeypatch.setattr(orchestrator, "_analyze_file_batch", always_401)

        files = [{"path": "app.py", "content": "x = 1"}]

        with pytest.raises(AIAnalysisUnavailable):
            await orchestrator.analyze_repository(files)

    @pytest.mark.asyncio
    async def test_the_message_tells_the_user_what_to_do(self, orchestrator, monkeypatch):
        from app.agents.orchestrator import AIAnalysisUnavailable

        async def always_fail(*args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(orchestrator, "_analyze_file_batch", always_fail)

        with pytest.raises(AIAnalysisUnavailable) as excinfo:
            await orchestrator.analyze_repository([{"path": "a.py", "content": "x = 1"}])

        assert "credential" in str(excinfo.value).lower()
        # Rendered to the user as written, without a class-name prefix.
        assert getattr(excinfo.value, "user_facing", False) is True

    @pytest.mark.asyncio
    async def test_a_successful_run_records_full_coverage(self, orchestrator, monkeypatch):
        async def one_finding(*args, **kwargs):
            return {"issues": [{"severity": "high", "agent_type": "quality",
                                "file_path": "a.py", "line_number": 1}]}

        monkeypatch.setattr(orchestrator, "_analyze_file_batch", one_finding)

        result = await orchestrator.analyze_repository([{"path": "a.py", "content": "x = 1"}])

        assert result["ai_batches_succeeded"] == result["ai_batches_total"] == 1
        assert result["total_issues"] == 1
        assert result["overall_score"] < 100

    @pytest.mark.asyncio
    async def test_partial_coverage_is_recorded_not_hidden(self, orchestrator, monkeypatch):
        """
        Some batches failing is a usable result - but the user must be able to
        find out it was based on part of the sample.
        """
        calls = {"n": 0}

        async def every_other_batch_fails(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] % 2 == 0:
                raise RuntimeError("transient")
            return {"issues": []}

        monkeypatch.setattr(orchestrator, "_analyze_file_batch", every_other_batch_fails)

        from app.core.config import get_settings
        per_batch = get_settings().ANALYSIS_BATCH_SIZE
        files = [{"path": f"f{i}.py", "content": "x = 1"} for i in range(per_batch * 4)]

        result = await orchestrator.analyze_repository(files)

        assert result["ai_batches_total"] == 4
        assert 0 < result["ai_batches_succeeded"] < 4
