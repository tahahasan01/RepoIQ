"""
Per-file analysis result caching, keyed by git blob SHA.

The analysis was capped at 15 files because every run re-analysed everything from
scratch: cost and latency scaled linearly with the file count, so the only way to
keep a run affordable was to look at a tiny sample. That made the product's
headline number - a repository score - a measurement of under 1% of the code.

A git blob SHA is a content hash. If a file's SHA is unchanged, last run's
findings for it are still exactly correct. So:

  - the first analysis of a repository pays full price;
  - every later analysis only pays for files that actually changed;
  - a typical push touches a handful of files out of thousands.

That inverts the economics. Coverage stops being bounded by what one run can
afford and becomes bounded by what the FIRST run can afford, amortised over
every run after it - which is why ANALYSIS_MAX_FILES can now be raised by an
order of magnitude.

Findings are cached globally by blob SHA rather than per-repository. Identical
content genuinely has identical findings, and it means forks, vendored files and
copy-pasted code are analysed once across the whole platform.
"""
import json
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.redis_service import get_redis_service

logger = get_logger(__name__)
settings = get_settings()

# Bumped when the prompt, model or issue schema changes, so cached findings from
# an older analyser are not served against a newer one.
ANALYSER_VERSION = "v2"

_KEY = "analysis:file:{version}:{model}:{sha}"


def _key(blob_sha: str) -> str:
    return _KEY.format(
        version=ANALYSER_VERSION,
        model=settings.OPENAI_MODEL,
        sha=blob_sha,
    )


def get_cached_findings(blob_sha: str) -> Optional[List[Dict[str, Any]]]:
    """Findings previously computed for this exact file content, if any."""
    if not blob_sha:
        return None

    redis = get_redis_service()
    if not redis.available:
        return None

    try:
        raw = redis.client.get(_key(blob_sha))
        if raw is None:
            return None
        return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except Exception as e:
        logger.debug(f"Incremental cache read failed: {type(e).__name__}: {e}")
        return None


def store_findings(blob_sha: str, findings: List[Dict[str, Any]], ttl: int = 30 * 24 * 3600) -> None:
    """
    Cache findings for a blob SHA.

    Long TTL (30 days): content-addressed entries can never go stale - the key IS
    the content. The TTL exists only to bound memory.
    """
    if not blob_sha:
        return

    redis = get_redis_service()
    if not redis.available:
        return

    try:
        redis.client.setex(_key(blob_sha), ttl, json.dumps(findings).encode("utf-8"))
    except Exception as e:
        logger.debug(f"Incremental cache write failed: {type(e).__name__}: {e}")


def partition_files(
    files: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Split files into (needs_analysis, cached_findings, unchanged_files).

    Args:
        files: dicts with at least `path`, `content` and `sha`.

    Returns:
        needs_analysis:   files whose content has not been analysed before.
        cached_findings:  findings recovered from cache, ready to merge.
        unchanged_files:  the file dicts that were served from cache, for logging
                          and for reporting coverage honestly.
    """
    needs_analysis: List[Dict[str, Any]] = []
    cached_findings: List[Dict[str, Any]] = []
    unchanged: List[Dict[str, Any]] = []

    for file_data in files:
        sha = file_data.get("sha")
        if not sha:
            # No SHA (raw-URL fallback path) - cannot key it, so analyse it.
            needs_analysis.append(file_data)
            continue

        hit = get_cached_findings(sha)
        if hit is None:
            needs_analysis.append(file_data)
            continue

        # Re-stamp the path: the same blob can live at different paths, and the
        # cached findings carry whatever path it had when first analysed.
        for finding in hit:
            finding["file_path"] = file_data.get("path", finding.get("file_path", ""))

        cached_findings.extend(hit)
        unchanged.append(file_data)

    return needs_analysis, cached_findings, unchanged


def record_batch_findings(
    analysed_files: List[Dict[str, Any]],
    findings: List[Dict[str, Any]],
) -> None:
    """
    Cache this run's findings against the SHAs of the files that produced them.

    Files that yielded no findings are cached as an empty list on purpose: "this
    content is clean" is exactly as reusable as "this content has three issues",
    and without it every clean file would be re-analysed forever.
    """
    by_path: Dict[str, List[Dict[str, Any]]] = {}
    for finding in findings:
        by_path.setdefault(finding.get("file_path", ""), []).append(finding)

    for file_data in analysed_files:
        sha = file_data.get("sha")
        if not sha:
            continue
        store_findings(sha, by_path.get(file_data.get("path", ""), []))
