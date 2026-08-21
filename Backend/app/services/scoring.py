"""
Repository scoring.

THE PROBLEM THIS REPLACES
-------------------------
Scores are the product's headline number, and three different formulas were
computing them:

1. `analyze_repository()` averaged the scores the MODEL reported for itself,
   then deducted again for the same findings, then clamped to 30-95.
2. `recalculate_totals()` (the incremental path) computed purely from finding
   counts and clamped to 20-100.
3. `_calculate_overall_scores()` used a fourth weighting including documentation.

Consequences:

  - **The same repository scored differently depending on cache state.** Warm
    incremental cache took path 2, cold took path 1. Identical code, identical
    findings, different number on screen. That is the worst kind of bug in a
    measurement product: it destroys trust in every score, including the correct
    ones.
  - **Findings were counted twice.** The model lowered its self-reported score
    because it found a SQL injection, then the code lowered it again for the
    same SQL injection.
  - **The clamps hid the truth at both ends.** `max(30, ...)` meant a repository
    with six critical vulnerabilities and one with sixty both scored 30 - no
    signal exactly where signal matters most. `min(..., 95)` meant genuinely
    clean code could never score above 95, so the top of the scale was unusable.
  - **Documentation was displayed but excluded** from the overall score.

THE APPROACH
------------
One pure function from findings to scores. Deterministic, so the same findings
always produce the same number. Computed from what was actually found rather
than from the model's opinion of its own output, so it is explainable: a user
can be shown "3 critical findings" and the arithmetic that follows.

The curve is exponential decay rather than linear subtraction. Linear penalties
saturate - once you pass the floor, more findings change nothing. Decay keeps
every additional finding meaningful while never producing a negative score, so
60 criticals really does rank below 6.
"""
import math
from typing import Any, Dict, Iterable, List

# What each severity costs. Roughly: one critical ~ two highs ~ five mediums.
SEVERITY_WEIGHTS: Dict[str, int] = {
    "critical": 15,
    "high": 7,
    "medium": 3,
    "low": 1,
    "info": 0,
}

# Sensitivity of the decay curve. Larger is more forgiving.
# At K=60: one critical -> 78, four criticals -> 37, ten -> 8.
DECAY_CONSTANT = 60.0

# Which findings count against which dimension. A finding with an unrecognised
# agent_type counts toward quality, matching how issues are stored.
DIMENSION_AGENTS: Dict[str, set] = {
    "security": {"security"},
    "quality": {"quality", "best_practices", "performance", "testing"},
    "architecture": {"architecture"},
    "documentation": {"documentation"},
}

# How the dimensions combine. Security dominates because a vulnerability is
# categorically worse than a long function; documentation is included because
# it was previously computed, displayed, and then silently ignored.
DIMENSION_WEIGHTS: Dict[str, float] = {
    "security": 0.35,
    "quality": 0.30,
    "architecture": 0.20,
    "documentation": 0.15,
}

# How far the overall score may sit above the weakest dimension. Stops one
# catastrophic area hiding behind three healthy ones - see score_findings().
MAX_SPREAD_ABOVE_WEAKEST = 15


def _penalty(findings: Iterable[Dict[str, Any]]) -> int:
    return sum(
        SEVERITY_WEIGHTS.get(str(f.get("severity", "low")).lower(), 1)
        for f in findings
    )


def _score_from_penalty(penalty: int) -> int:
    """
    Map an accumulated penalty to 0-100.

    Exponential decay, not `100 - penalty`. Linear subtraction saturates at the
    floor, so past a certain point additional findings stop changing the score -
    precisely the range where the difference matters most. Decay is strictly
    monotonic over the whole range and cannot go negative, so no clamping is
    needed to keep it in bounds.
    """
    if penalty <= 0:
        return 100
    return int(round(100 * math.exp(-penalty / DECAY_CONSTANT)))


def _for_dimension(findings: List[Dict[str, Any]], dimension: str) -> List[Dict[str, Any]]:
    agents = DIMENSION_AGENTS[dimension]
    if dimension == "quality":
        # Quality is the catch-all, matching how agent_type is assigned when a
        # finding's category does not map to a specific dimension.
        known = set().union(*DIMENSION_AGENTS.values())
        return [
            f for f in findings
            if str(f.get("agent_type", "")).lower() in agents
            or str(f.get("agent_type", "")).lower() not in known
        ]
    return [f for f in findings if str(f.get("agent_type", "")).lower() in agents]


def score_findings(findings: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Compute every score from a list of findings.

    The single source of truth: both the full-analysis path and the incremental
    path call this, so a repository's score depends only on what was found - not
    on whether the cache happened to be warm.

    Returns overall/security/quality/architecture/documentation, each 0-100.
    """
    findings = findings or []

    scores = {
        dimension: _score_from_penalty(_penalty(_for_dimension(findings, dimension)))
        for dimension in DIMENSION_WEIGHTS
    }

    weighted = sum(
        scores[dimension] * weight for dimension, weight in DIMENSION_WEIGHTS.items()
    )

    # A weighted average alone lets one catastrophic dimension hide behind three
    # healthy ones: sixty critical vulnerabilities with tidy architecture and
    # good docs averaged to 65, which reads as "fine". For a security product
    # that headline number is worse than useless - it is actively reassuring
    # about a repository that should alarm you.
    #
    # So the overall score is also capped relative to the weakest dimension. It
    # can sit somewhat above it - one weak area should not erase everything
    # else - but it cannot sit far above it. Stated plainly: a repository is
    # never much better than its worst dimension.
    weakest = min(scores[d] for d in DIMENSION_WEIGHTS)
    scores["overall"] = int(round(min(weighted, weakest + MAX_SPREAD_ABOVE_WEAKEST)))

    return scores


def summarise(findings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Scores plus the counts they were derived from.

    The counts travel with the scores so the number can always be explained.
    An unexplainable score in a code-review product is one the user has no
    reason to believe.
    """
    findings = findings or []
    counts = {
        severity: sum(
            1 for f in findings
            if str(f.get("severity", "low")).lower() == severity
        )
        for severity in ("critical", "high", "medium", "low")
    }

    scores = score_findings(findings)

    return {
        "overall_score": scores["overall"],
        "security_score": scores["security"],
        "quality_score": scores["quality"],
        "architecture_score": scores["architecture"],
        "documentation_score": scores["documentation"],
        "total_issues": len(findings),
        "critical_issues": counts["critical"],
        "high_issues": counts["high"],
        "medium_issues": counts["medium"],
        "low_issues": counts["low"],
    }
