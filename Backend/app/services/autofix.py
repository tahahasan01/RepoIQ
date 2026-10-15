"""
Auto-fix: turn selected findings into a reviewable pull request.

    request -> autofix_runs row (pending) -> dispatch (Celery, or in-process
    when no worker is listening) -> run_autofix -> branch + commits + PR

One model call per file, covering every selected finding in it. Nothing is
committed unless the proposed file passes validate_fix, and nothing is pushed
to the default branch: every change lands on a new branch as a pull request
for a human to review. Findings are not marked fixed here - that happens when
a later analysis no longer reports them (repository_insights.mark_resolved_issues).

The GitHub App needs the repository permission "Contents: Read and write" (and
"Pull requests: Read and write") for this; without it the run fails with a
message saying exactly that.
"""
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.db.postgres import get_service_db

logger = get_logger(__name__)

MAX_ISSUES_PER_RUN = 20
MAX_FILES_PER_RUN = 10
# A proposed file shorter than this fraction of the original is rejected: a
# fix that deletes half a file is far more likely a truncated or confused
# answer than a fix.
MIN_LENGTH_RATIO = 0.5


class AutofixError(ValueError):
    """
    A request that cannot be accepted. Message is user-facing - a ValueError,
    following the codebase's convention for authored validation messages.
    """


def validate_fix(original: str, proposal: Dict[str, Any]) -> Optional[str]:
    """None when the proposal may be committed, otherwise the reason it may not."""
    if not proposal.get("changed"):
        return "No safe change was found for this file"
    updated = proposal.get("updated_file") or ""
    if not updated.strip():
        return "The proposed file was empty"
    if updated == original:
        return "The proposal did not change the file"
    if len(updated) < len(original) * MIN_LENGTH_RATIO:
        return "The proposal removed too much of the file to be trusted"
    if updated.lstrip().startswith("```"):
        return "The proposal was wrapped in a markdown fence"
    if not proposal.get("addressed"):
        return "The proposal did not say which findings it addresses"
    return None


async def create_run(repo: Dict[str, Any], user_id: str, issue_ids: List[str]) -> Dict[str, Any]:
    """
    Validate a request and record it. Every issue must belong to an analysis of
    this repository - issue ids come from the client, and an id from someone
    else's repository must not be fixable through yours.
    """
    db = get_service_db()
    unique_ids = list(OrderedDict.fromkeys(issue_ids))
    if not unique_ids:
        raise AutofixError("Select at least one issue to fix")
    if len(unique_ids) > MAX_ISSUES_PER_RUN:
        raise AutofixError(f"Select at most {MAX_ISSUES_PER_RUN} issues per fix")
    try:
        unique_ids = [str(uuid.UUID(str(i))) for i in unique_ids]
    except ValueError:
        # Otherwise a malformed id reaches Postgres and comes back as a 500.
        raise AutofixError("Issue ids must be UUIDs")

    issues = (await run_blocking(
        db.table("issues").select("id, analysis_id, file_path")
        .in_("id", unique_ids).execute
    )).data or []
    analysis_ids = sorted({i["analysis_id"] for i in issues})
    owned = set()
    if analysis_ids:
        owned = {a["id"] for a in (await run_blocking(
            db.table("analysis_results").select("id")
            .eq("repository_id", repo["id"]).in_("id", analysis_ids).execute
        )).data or []}
    valid = [i for i in issues if i["analysis_id"] in owned]
    if len(valid) != len(unique_ids):
        raise AutofixError("Some selected issues do not belong to this repository")
    if len({i["file_path"] for i in valid}) > MAX_FILES_PER_RUN:
        raise AutofixError(f"Selected issues span more than {MAX_FILES_PER_RUN} files; fix them in smaller batches")

    # The analysis the findings came from, when they all came from one.
    source_analysis = analysis_ids[0] if len(analysis_ids) == 1 else None
    run = (await run_blocking(
        db.table("autofix_runs").insert({
            "repository_id": repo["id"],
            "user_id": user_id,
            "analysis_id": source_analysis,
            "issue_ids": unique_ids,
        }).execute
    )).data[0]
    return run


async def get_run(run_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    rows = (await run_blocking(
        get_service_db().table("autofix_runs").select("*")
        .eq("id", run_id).eq("user_id", user_id).execute
    )).data
    return rows[0] if rows else None


async def list_runs(repository_id: str, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    return (await run_blocking(
        get_service_db().table("autofix_runs").select("*")
        .eq("repository_id", repository_id).eq("user_id", user_id)
        .order("created_at", desc=True).limit(limit).execute
    )).data or []


async def _update(run_id: str, fields: Dict[str, Any]) -> None:
    await run_blocking(get_service_db().table("autofix_runs").update(fields).eq("id", run_id).execute)


def _pr_body(fixed: List[Dict[str, Any]], skipped: List[Dict[str, Any]]) -> str:
    lines = [
        "Proposed by **RepoIQ** for the findings below. Review the diff before merging -",
        "it was generated by an AI model from the repository's own code.",
        "",
        "### Changes",
    ]
    for f in fixed:
        lines.append(f"- `{f['file_path']}`: {f['summary']}")
        for issue in f["issues"]:
            lines.append(f"  - [{issue.get('severity')}] {issue.get('category')} (line {issue.get('line_number')})")
    if skipped:
        lines += ["", "### Not changed"]
        lines += [f"- `{s.get('file_path', '?')}`: {s['reason']}" for s in skipped]
    return "\n".join(lines)


async def run_autofix(run_id: str, github_token: str) -> Dict[str, Any]:
    """Execute a recorded run. Always leaves the run completed or failed."""
    from app.agents.fix_agent import FixAgent
    from app.services.github_service import GitHubWriteError, create_github_service

    db = get_service_db()
    run = (await run_blocking(db.table("autofix_runs").select("*").eq("id", run_id).execute)).data
    if not run:
        raise AutofixError("Auto-fix run not found")
    run = run[0]
    await _update(run_id, {"status": "running"})

    try:
        repo = (await run_blocking(
            db.table("repositories").select("id, full_name, default_branch")
            .eq("id", run["repository_id"]).eq("user_id", run["user_id"]).execute
        )).data
        if not repo:
            raise AutofixError("The repository is no longer available")
        repo = repo[0]
        base = repo.get("default_branch") or "main"

        issues = (await run_blocking(
            db.table("issues").select("id, severity, category, file_path, line_number, description, suggestion")
            .in_("id", run["issue_ids"]).execute
        )).data or []
        by_file: Dict[str, List[Dict[str, Any]]] = OrderedDict()
        for issue in sorted(issues, key=lambda i: (i.get("file_path") or "", i.get("line_number") or 0)):
            by_file.setdefault(issue.get("file_path"), []).append(issue)

        github = create_github_service(github_token)
        base_sha = await run_blocking(github.get_branch_head, repo["full_name"], base)
        agent = FixAgent()

        fixed, skipped = [], []
        for path, file_issues in by_file.items():
            original = await run_blocking(github.get_file_at, repo["full_name"], path, base_sha) if path else None
            if original is None:
                skipped.append({"file_path": path, "reason": "The file no longer exists or is not text"})
                continue
            try:
                proposal = await agent.propose_fix(path, original, file_issues, run["user_id"])
            except Exception as e:
                logger.warning(f"Auto-fix proposal failed for {path}: {type(e).__name__}: {e}")
                skipped.append({"file_path": path, "reason": "The fix could not be generated"})
                continue
            reason = validate_fix(original, proposal)
            if reason:
                skipped.append({"file_path": path, "reason": reason})
                continue
            addressed = {n for n in proposal["addressed"] if isinstance(n, int) and 1 <= n <= len(file_issues)}
            fixed.append({
                "file_path": path,
                "content": proposal["updated_file"],
                "summary": proposal.get("summary") or "Fix for the listed findings",
                "issues": [file_issues[n - 1] for n in sorted(addressed)],
            })

        if not fixed:
            # No branch, no empty pull request.
            await _update(run_id, {
                "status": "completed", "skipped": skipped,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return {"run_id": run_id, "status": "completed", "pull_request": None}

        # Unique per run: a reused name made the second fix for an analysis fail.
        branch = f"repoiq/fix-{run_id[:8]}"
        await run_blocking(github.create_branch, repo["full_name"], branch, base)
        for change in fixed:
            await run_blocking(
                github.update_file, repo["full_name"], change["file_path"], change["content"],
                f"fix: {change['summary']}"[:200], branch,
            )

        count = sum(len(c["issues"]) for c in fixed)
        pr = await run_blocking(
            github.create_pull_request, repo["full_name"],
            f"RepoIQ: fix {count} finding{'s' if count != 1 else ''}",
            _pr_body(fixed, skipped), branch, base,
        )
        await _update(run_id, {
            "status": "completed",
            "branch": branch,
            "pr_number": pr["number"],
            "pr_url": pr["url"],
            "fixed_issue_ids": [i["id"] for c in fixed for i in c["issues"]],
            "skipped": skipped,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"run_id": run_id, "status": "completed", "pull_request": pr}
    except Exception as e:
        message = str(e) if isinstance(e, (AutofixError, GitHubWriteError)) else "Auto-fix failed unexpectedly"
        logger.error(f"Auto-fix run {run_id} failed: {type(e).__name__}: {e}")
        await _update(run_id, {
            "status": "failed", "error_message": message,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        raise
