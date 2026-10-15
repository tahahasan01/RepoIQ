"""
Auto-fix: turn selected findings into a reviewable pull request.

    request -> autofix_runs row (pending) -> dispatch (Celery, or in-process
    when no worker is listening) -> run_autofix -> proposals + diffs ('ready')
    -> the user reviews them -> approve -> publish_run -> branch + commits +
    draft PR ('completed')   (or discard -> 'discarded')

SECURITY: nothing reaches GitHub until a person has seen the exact diff. A
proposal is model output built from the repository's own content, where
anyone with write access could have planted instructions, and pushing a
branch runs CI with the repository's secrets. No list of "files CI executes"
is complete - any source file a test imports runs in CI - so the protected
paths and locality checks below narrow what a proposal may touch, and the
approval step is what actually stands between model output and a push.

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

# SECURITY: the proposal is model output from untrusted repository content,
# so text planted in the repository can steer it. Pushing a branch triggers CI
# (GitHub Actions runs on pushes from an app token) with the repository's
# secrets BEFORE anyone reviews the pull request. So:
#  - files CI or the build executes are never changed;
#  - every changed line must sit near a finding the user selected, and the
#    change must be small - an injected payload elsewhere in the file is
#    rejected rather than committed;
#  - the pull request is a draft, and says why it must be reviewed.
CHANGE_WINDOW_LINES = 15
MAX_CHANGED_LINES = 150
_PROTECTED_DIRS = (".github/", ".circleci/", ".gitlab/", ".buildkite/", ".husky/", ".devcontainer/")
_PROTECTED_FILES = {
    ".gitlab-ci.yml", ".travis.yml", "jenkinsfile", "azure-pipelines.yml", "bitbucket-pipelines.yml",
    "makefile", "dockerfile", "docker-compose.yml", "docker-compose.yaml", "procfile",
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "setup.py", "setup.cfg",
    "pyproject.toml", "requirements.txt", "pipfile", "pipfile.lock", "poetry.lock", "tox.ini",
    "noxfile.py", "conftest.py", "gemfile", "gemfile.lock", "build.gradle", "pom.xml",
    "cargo.toml", "go.mod", "go.sum", ".pre-commit-config.yaml", "vercel.json", "netlify.toml",
}


def is_protected_path(path: str) -> bool:
    """
    Files CI, the build or the package manager execute - and any path that
    does not normalise to a plain relative path inside the repository.
    Finding paths come from model output during analysis, so "src/../.github/x"
    must not slip past a prefix check.
    """
    import posixpath

    raw = path.replace("\\", "/")
    if not raw or raw.startswith("/") or "\x00" in raw:
        return True
    collapsed = posixpath.normpath(raw)
    if collapsed.startswith("..") or collapsed in (".", "") or "/../" in f"/{raw}/":
        return True
    # normpath already dropped any leading "./"; never lstrip(".") - that
    # would turn ".github/x" into "github/x" and past the check below.
    normalised = collapsed.lower()
    name = normalised.rsplit("/", 1)[-1]
    if any(normalised.startswith(d) or f"/{d}" in normalised for d in _PROTECTED_DIRS):
        return True
    return name in _PROTECTED_FILES or name.endswith((".sh", ".ps1", ".bat", ".cmd"))


def _changed_original_lines(original: str, updated: str) -> List[int]:
    """1-based lines of `original` touched by the change (insert points included)."""
    import difflib

    lines = []
    matcher = difflib.SequenceMatcher(a=original.splitlines(), b=updated.splitlines(), autojunk=False)
    for tag, i1, i2, _j1, _j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        lines.extend(range(i1 + 1, i2 + 1) if i2 > i1 else [i1 + 1])
    return lines


class AutofixError(ValueError):
    """
    A request that cannot be accepted. Message is user-facing - a ValueError,
    following the codebase's convention for authored validation messages.
    """


def validate_fix(
    original: str, proposal: Dict[str, Any], issue_lines: Optional[List[int]] = None
) -> Optional[str]:
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

    changed = _changed_original_lines(original, updated)
    if len(changed) > MAX_CHANGED_LINES:
        return "The proposal changed too much of the file to be a targeted fix"
    anchors = [line for line in (issue_lines or []) if isinstance(line, int) and line > 0]
    if anchors:
        # Imports are the one legitimate far-away edit a fix needs.
        far = [
            n for n in changed
            if n > CHANGE_WINDOW_LINES and all(abs(n - a) > CHANGE_WINDOW_LINES for a in anchors)
        ]
        if far:
            return f"The proposal changed lines far from the selected findings (line {far[0]})"
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


def public_view(run: Dict[str, Any]) -> Dict[str, Any]:
    """A run as the API returns it: proposals carry their diff, not the whole file."""
    view = {k: v for k, v in run.items() if k != "base_sha"}
    view["proposals"] = [
        {k: v for k, v in p.items() if k != "content"} for p in (run.get("proposals") or [])
    ]
    return view


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


def _unified_diff(path: str, original: str, updated: str) -> str:
    import difflib

    return "".join(difflib.unified_diff(
        original.splitlines(keepends=True), updated.splitlines(keepends=True),
        fromfile=f"a/{path}", tofile=f"b/{path}", n=3,
    ))


async def _transition(run_id: str, user_id: str, from_status: str, fields: Dict[str, Any]) -> bool:
    """Conditional update: of two concurrent approvals, exactly one wins."""
    changed = (await run_blocking(
        get_service_db().table("autofix_runs").update(fields)
        .eq("id", run_id).eq("user_id", user_id).eq("status", from_status).execute
    )).data
    return bool(changed)


async def approve_run(run_id: str, user_id: str) -> Dict[str, Any]:
    """Mark a 'ready' run for publishing. The caller then runs publish_run."""
    run = await get_run(run_id, user_id)
    if not run:
        raise AutofixError("Auto-fix run not found")
    if not await _transition(run_id, user_id, "ready", {"status": "publishing"}):
        raise AutofixError(f"This auto-fix is {run['status']}, not waiting for review")
    return run


async def discard_run(run_id: str, user_id: str) -> Dict[str, Any]:
    run = await get_run(run_id, user_id)
    if not run:
        raise AutofixError("Auto-fix run not found")
    if not await _transition(run_id, user_id, "ready", {
        "status": "discarded", "completed_at": datetime.now(timezone.utc).isoformat(),
    }):
        raise AutofixError(f"This auto-fix is {run['status']}, not waiting for review")
    return await get_run(run_id, user_id)


async def _update(run_id: str, fields: Dict[str, Any]) -> None:
    await run_blocking(get_service_db().table("autofix_runs").update(fields).eq("id", run_id).execute)


def _pr_body(fixed: List[Dict[str, Any]], skipped: List[Dict[str, Any]]) -> str:
    lines = [
        "Proposed by **RepoIQ** for the findings below. **Review the diff before merging** -",
        "it was generated by an AI model from the repository's own code, which anyone with",
        "write access could have influenced. It is opened as a draft for that reason.",
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


async def _require_write_access(github, full_name: str, user_id: str) -> None:
    rows = (await run_blocking(
        get_service_db().table("users").select("github_username").eq("id", user_id).execute
    )).data
    login = (rows[0].get("github_username") if rows else None) or ""
    permission = await run_blocking(github.get_user_permission, full_name, login) if login else None
    if permission not in ("admin", "write"):
        raise AutofixError(
            f"You need write access to {full_name} on GitHub to open an auto-fix pull request."
        )


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
        # SECURITY: an installation token can write wherever the app can; the
        # person asking must be able to write to this repository themselves.
        # Checked first, so no model call is spent on a fix they cannot open.
        await _require_write_access(github, repo["full_name"], run["user_id"])
        base_sha = await run_blocking(github.get_branch_head, repo["full_name"], base)
        agent = FixAgent()

        fixed, skipped = [], []
        for path, file_issues in by_file.items():
            if path and is_protected_path(path):
                skipped.append({"file_path": path, "reason": "Files that CI or the build runs are never changed automatically"})
                continue
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
            reason = validate_fix(original, proposal, [i.get("line_number") for i in file_issues])
            if reason:
                skipped.append({"file_path": path, "reason": reason})
                continue
            addressed = {n for n in proposal["addressed"] if isinstance(n, int) and 1 <= n <= len(file_issues)}
            fixed.append({
                "file_path": path,
                "original": original,
                "content": proposal["updated_file"],
                "summary": proposal.get("summary") or "Fix for the listed findings",
                "issues": [file_issues[n - 1] for n in sorted(addressed)],
            })

        if not fixed:
            # No proposal, so no review and no pull request.
            await _update(run_id, {
                "status": "completed", "skipped": skipped,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return {"run_id": run_id, "status": "completed", "pull_request": None}

        # Stop here. Nothing is pushed until the user approves these diffs.
        await _update(run_id, {
            "status": "ready",
            "base_sha": base_sha,
            "skipped": skipped,
            "proposals": [
                {
                    "file_path": c["file_path"],
                    "summary": c["summary"],
                    "issue_ids": [i["id"] for i in c["issues"]],
                    "diff": _unified_diff(c["file_path"], c["original"], c["content"]),
                    "content": c["content"],
                }
                for c in fixed
            ],
        })
        return {"run_id": run_id, "status": "ready", "pull_request": None}
    except Exception as e:
        message = str(e) if isinstance(e, (AutofixError, GitHubWriteError)) else "Auto-fix failed unexpectedly"
        logger.error(f"Auto-fix run {run_id} failed: {type(e).__name__}: {e}")
        await _update(run_id, {
            "status": "failed", "error_message": message,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        raise


async def publish_run(run_id: str, github_token: str) -> Dict[str, Any]:
    """
    Push an approved run: branch at the commit the proposals were built from,
    one commit per file, one draft pull request. Always leaves the run
    completed or failed.
    """
    from app.services.github_service import GitHubWriteError, create_github_service

    db = get_service_db()
    rows = (await run_blocking(db.table("autofix_runs").select("*").eq("id", run_id).execute)).data
    if not rows or rows[0]["status"] != "publishing":
        raise AutofixError("This auto-fix has not been approved")
    run = rows[0]

    try:
        repo = (await run_blocking(
            db.table("repositories").select("id, full_name, default_branch")
            .eq("id", run["repository_id"]).eq("user_id", run["user_id"]).execute
        )).data
        if not repo:
            raise AutofixError("The repository is no longer available")
        repo = repo[0]
        base = repo.get("default_branch") or "main"
        github = create_github_service(github_token)
        # Permission can change between review and approval.
        await _require_write_access(github, repo["full_name"], run["user_id"])

        proposals = run.get("proposals") or []
        issues = {i["id"]: i for i in (await run_blocking(
            db.table("issues").select("id, severity, category, line_number")
            .in_("id", [iid for p in proposals for iid in p.get("issue_ids", [])] or [run["issue_ids"][0]]).execute
        )).data or []}

        # Unique per run: a reused name made the second fix for an analysis fail.
        branch = f"repoiq/fix-{run_id[:8]}"
        await run_blocking(github.create_branch_at, repo["full_name"], branch, run["base_sha"])
        for proposal in proposals:
            if is_protected_path(proposal["file_path"]):
                raise AutofixError("A proposal touches a protected path; it was not published")
            await run_blocking(
                github.update_file, repo["full_name"], proposal["file_path"], proposal["content"],
                f"fix: {proposal['summary']}"[:200], branch,
            )

        fixed = [
            {"file_path": p["file_path"], "summary": p["summary"],
             "issues": [issues[i] for i in p.get("issue_ids", []) if i in issues]}
            for p in proposals
        ]
        count = sum(len(p.get("issue_ids", [])) for p in proposals)
        pr = await run_blocking(
            github.create_pull_request, repo["full_name"],
            f"RepoIQ: fix {count} finding{'s' if count != 1 else ''}",
            _pr_body(fixed, run.get("skipped") or []), branch, base, True,
        )
        await _update(run_id, {
            "status": "completed",
            "branch": branch,
            "pr_number": pr["number"],
            "pr_url": pr["url"],
            "fixed_issue_ids": [i for p in proposals for i in p.get("issue_ids", [])],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"run_id": run_id, "status": "completed", "pull_request": pr}
    except Exception as e:
        message = str(e) if isinstance(e, (AutofixError, GitHubWriteError)) else "Publishing the fix failed unexpectedly"
        logger.error(f"Auto-fix publish {run_id} failed: {type(e).__name__}: {e}")
        await _update(run_id, {
            "status": "failed", "error_message": message,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        raise

