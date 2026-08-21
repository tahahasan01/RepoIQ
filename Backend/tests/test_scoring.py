"""
Tests for repository scoring.

The score is the product's headline number, so the properties that matter are
that it is deterministic, monotonic, explainable, and cannot flatter a repository
that has serious problems.
"""
import pytest

from app.services.scoring import (
    DIMENSION_WEIGHTS,
    MAX_SPREAD_ABOVE_WEAKEST,
    score_findings,
    summarise,
)


def finding(severity="low", agent_type="quality"):
    return {"severity": severity, "agent_type": agent_type}


def criticals(n, agent_type="security"):
    return [finding("critical", agent_type) for _ in range(n)]


class TestDeterminism:
    """
    The bug this replaces: two scoring formulas, so the same repository scored
    differently depending on whether the incremental cache was warm.
    """

    def test_same_findings_always_give_the_same_score(self):
        findings = criticals(2) + [finding("high"), finding("low", "documentation")]

        assert score_findings(findings) == score_findings(list(findings))

    def test_order_does_not_matter(self):
        a = criticals(1) + [finding("high", "quality")]
        b = [finding("high", "quality")] + criticals(1)

        assert score_findings(a) == score_findings(b)

    def test_both_analysis_paths_use_this_module(self):
        """Full analysis and incremental must not diverge again."""
        import inspect
        from app.agents.orchestrator import AgentOrchestrator

        for method in (
            AgentOrchestrator.analyze_repository,
            AgentOrchestrator.recalculate_totals,
            AgentOrchestrator._calculate_overall_scores,
        ):
            source = inspect.getsource(method)
            assert "scoring" in source, f"{method.__name__} does not use the shared scorer"

    def test_a_warm_cache_and_a_cold_one_agree(self):
        """
        Simulates the real divergence: the incremental path merges reused
        findings and recalculates, the full path scores everything at once.
        Both must land on the same number.
        """
        from app.agents.orchestrator import AgentOrchestrator

        findings = criticals(2) + [finding("high"), finding("medium", "architecture")]

        full = summarise(findings)
        incremental = AgentOrchestrator.recalculate_totals({"issues": list(findings)})

        for key in ("overall_score", "security_score", "quality_score",
                    "architecture_score", "documentation_score"):
            assert full[key] == incremental[key], f"{key} diverges between paths"


class TestMonotonicity:
    """
    The old formula clamped at 30, so six critical vulnerabilities and sixty
    scored identically - no signal exactly where signal matters most.
    """

    def test_more_findings_never_score_higher(self):
        previous = 101
        for n in range(0, 30):
            current = score_findings(criticals(n))["security"]
            assert current <= previous, f"{n} criticals scored above {n-1}"
            previous = current

    def test_six_and_sixty_criticals_are_distinguishable(self):
        assert score_findings(criticals(60))["security"] < score_findings(criticals(6))["security"]

    def test_severity_is_ordered(self):
        scores = {
            severity: score_findings([finding(severity)] * 5)["quality"]
            for severity in ("critical", "high", "medium", "low")
        }
        assert scores["critical"] < scores["high"] < scores["medium"] < scores["low"]


class TestBounds:

    def test_clean_code_can_score_100(self):
        """The old ceiling of 95 made the top of the scale unusable."""
        assert score_findings([])["overall"] == 100

    def test_scores_never_leave_0_100(self):
        for n in (0, 1, 10, 100, 1000):
            for value in score_findings(criticals(n)).values():
                assert 0 <= value <= 100

    def test_score_never_goes_negative(self):
        assert score_findings(criticals(500))["security"] >= 0


class TestOneBadDimensionCannotHide:
    """
    A weighted average alone let sixty critical vulnerabilities average out to
    65 against three healthy dimensions - a headline number that actively
    reassures about a repository that should alarm you.
    """

    def test_catastrophic_security_drags_the_overall_down(self):
        result = score_findings(criticals(6))

        assert result["security"] < 30
        assert result["overall"] < 40, "6 critical vulnerabilities must not read as 'fine'"

    def test_overall_stays_near_the_weakest_dimension(self):
        result = score_findings(criticals(20))
        weakest = min(result[d] for d in DIMENSION_WEIGHTS)

        assert result["overall"] <= weakest + MAX_SPREAD_ABOVE_WEAKEST

    def test_one_weak_area_does_not_erase_everything_else(self):
        """The cap is a ceiling, not a collapse - some credit remains."""
        result = score_findings(criticals(6))

        assert result["overall"] > result["security"]


class TestDimensionRouting:

    def test_security_findings_only_hit_the_security_score(self):
        result = score_findings(criticals(3, "security"))

        assert result["security"] < 60
        assert result["quality"] == 100
        assert result["architecture"] == 100

    def test_documentation_counts_toward_the_overall(self):
        """It used to be computed, displayed, and then ignored."""
        clean = score_findings([])["overall"]
        with_doc = score_findings([finding("high", "documentation")] * 5)["overall"]

        assert with_doc < clean

    def test_unknown_agent_types_fall_into_quality(self):
        """Matches how agent_type is assigned when a category does not map."""
        result = score_findings([finding("high", "something_unmapped")] * 3)

        assert result["quality"] < 100
        assert result["security"] == 100

    def test_all_weights_sum_to_one(self):
        assert abs(sum(DIMENSION_WEIGHTS.values()) - 1.0) < 1e-9


class TestSummaryIsExplainable:
    """The counts travel with the score so the number can be justified."""

    def test_counts_match_the_findings(self):
        findings = criticals(2) + [finding("high")] * 3 + [finding("low")] * 4
        result = summarise(findings)

        assert result["total_issues"] == 9
        assert result["critical_issues"] == 2
        assert result["high_issues"] == 3
        assert result["low_issues"] == 4

    def test_empty_input_is_safe(self):
        for value in (None, []):
            result = summarise(value)
            assert result["overall_score"] == 100
            assert result["total_issues"] == 0

    def test_malformed_findings_do_not_crash(self):
        """Model output is not trusted to be well-formed."""
        result = summarise([{}, {"severity": None}, {"severity": "nonsense"}])

        assert 0 <= result["overall_score"] <= 100


class TestNoDoubleCounting:
    """
    The model lowered its self-reported score because it found a SQL injection,
    then the code lowered it again for the same SQL injection.
    """

    def test_model_reported_scores_are_ignored(self):
        import inspect
        from app.agents.orchestrator import AgentOrchestrator

        source = inspect.getsource(AgentOrchestrator.analyze_repository)
        code = "\n".join(
            line for line in source.splitlines() if not line.strip().startswith("#")
        )
        assert "total_security_score" not in code
        assert 'batch_result.get("security_score"' not in code
