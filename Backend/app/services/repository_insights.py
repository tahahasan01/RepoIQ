"""
Developer and code-ownership insights for one repository.

Refreshed after every completed analysis (and on demand), from two GitHub reads:

- contributor statistics: weekly commits / additions / deletions per author,
  one request for the whole repository;
- blame for the analysed files: who last changed each line, and when.

From those it writes three tables the team, developer and executive views read:

- developer_contributions: one row per developer per week (period_start is the
  week's Sunday, UTC). Weekly rows are idempotent to upsert and let any
  reporting window be summed exactly.
- code_ownership: each developer's share of each blamed file's lines, with the
  date of their most recent commit to it.
- issue_blame: which developer's commit introduced the line each finding
  points at.

Only authors who are RepoIQ users (matched on github_username) are recorded:
the tables reference users(id). Ownership percentages are still computed over
ALL lines, so a share is never inflated by contributors who are not users.

SECURITY: and only the repository owner or someone who shares an organization
with them. GitHub attributes a commit to whichever account owns its author
email, and anyone can author a commit with anyone's email. Matching every
RepoIQ user would let a stranger analyse a repository of spoofed commits to
write contribution and blame rows about any user - and see that user's name
and avatar in the ownership and blame views of their own repository.

Replaces DeveloperAnalyticsService.track_developer_contributions and
OwnershipService.analyze_code_ownership, neither of which could ever run: both
treated GitHubService.get_repository()'s dict as a PyGithub object, the former
spent one API request per commit, and the latter called a blame API PyGithub
does not have.
"""
import asyncio
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.concurrency import run_blocking
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.postgres import get_service_db
from app.services.github_service import create_github_service

logger = get_logger(__name__)
settings = get_settings()

# GitHub computes contributor statistics lazily and answers 202 until ready.
_STATS_ATTEMPTS = 4
_STATS_RETRY_SECONDS = 3.0
_BLAME_CONCURRENCY = 4


def _week_bounds(week_start: int):
    start = datetime.fromtimestamp(week_start, tz=timezone.utc)
    return start, start + timedelta(days=7)


def _week_of(moment: datetime) -> datetime:
    """The Sunday 00:00 UTC that starts moment's week, as GitHub's stats use."""
    moment = moment.astimezone(timezone.utc)
    days_since_sunday = (moment.weekday() + 1) % 7
    return (moment - timedelta(days=days_since_sunday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def _parse_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def _contributor_stats(github, full_name: str) -> List[Dict[str, Any]]:
    for attempt in range(_STATS_ATTEMPTS):
        stats = await run_blocking(github.get_contributor_weekly_stats, full_name)
        if stats is not None:
            return stats
        if attempt < _STATS_ATTEMPTS - 1:
            await asyncio.sleep(_STATS_RETRY_SECONDS)
    logger.info(f"Contributor statistics for {full_name} are still being computed by GitHub")
    return []


async def _blame_files(github, repo: Dict[str, Any], paths: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    semaphore = asyncio.Semaphore(_BLAME_CONCURRENCY)
    branch = repo.get("default_branch") or "main"

    async def one(path: str):
        async with semaphore:
            try:
                return path, await run_blocking(github.get_file_blame, repo["full_name"], branch, path)
            except Exception as e:
                logger.warning(f"Blame failed for {path}: {type(e).__name__}: {e}")
                return path, None

    results = await asyncio.gather(*(one(p) for p in paths))
    return {path: ranges for path, ranges in results if ranges}


def _choose_files(issues: List[Dict[str, Any]], analysed_paths: List[str]) -> List[str]:
    """Files with findings first (their blame answers "who introduced this"), then the rest."""
    with_issues = [p for p, _ in Counter(i["file_path"] for i in issues if i.get("file_path")).most_common()]
    chosen = list(dict.fromkeys(with_issues + list(analysed_paths)))
    return chosen[: settings.INSIGHTS_MAX_BLAME_FILES]


def _line_owner(ranges: List[Dict[str, Any]], line: int) -> Optional[Dict[str, Any]]:
    for r in ranges:
        if r["start"] <= line <= r["end"]:
            return r
    return None


async def refresh_repository_insights(
    repo: Dict[str, Any],
    github_token: str,
    analysis_id: Optional[str],
    analysed_paths: List[str],
) -> Dict[str, int]:
    """Recompute contributions, ownership and issue blame for `repo`."""
    db = get_service_db()
    github = create_github_service(github_token)
    repo_id = repo["id"]

    issues: List[Dict[str, Any]] = []
    if analysis_id:
        issues = (await run_blocking(
            lambda: db.table("issues").select("id, file_path, line_number")
            .eq("analysis_id", analysis_id).execute()
        )).data or []

    stats, blame = await asyncio.gather(
        _contributor_stats(github, repo["full_name"]),
        _blame_files(github, repo, _choose_files(issues, analysed_paths)),
    )

    logins = {s["login"] for s in stats if s.get("login")}
    logins |= {r["login"] for ranges in blame.values() for r in ranges if r.get("login")}
    users = {}
    if logins:
        from app.services.organization_service import OrganizationService

        attributable = {repo["user_id"]} | await OrganizationService().get_colleague_ids(repo["user_id"])
        rows = (await run_blocking(
            lambda: db.table("users").select("id, github_username")
            .in_("github_username", sorted(logins)).in_("id", sorted(attributable)).execute()
        )).data or []
        users = {r["github_username"]: r["id"] for r in rows}

    # -- issue blame -----------------------------------------------------------
    blame_rows = []
    introduced = Counter()  # (user_id, week_start) -> findings introduced
    for issue in issues:
        ranges = blame.get(issue.get("file_path"))
        line = issue.get("line_number")
        if not ranges or not isinstance(line, int):
            continue
        owner = _line_owner(ranges, line)
        user_id = users.get(owner["login"]) if owner and owner.get("login") else None
        if not user_id:
            continue
        blame_rows.append({"issue_id": issue["id"], "user_id": user_id, "blame_type": "introduced"})
        committed = _parse_time(owner.get("committed_at"))
        if committed:
            introduced[(user_id, _week_of(committed))] += 1

    issue_ids = [i["id"] for i in issues]

    def _write_blame():
        if issue_ids:
            db.table("issue_blame").delete().in_("issue_id", issue_ids).execute()
        if blame_rows:
            db.table("issue_blame").insert(blame_rows).execute()

    await run_blocking(_write_blame)

    # -- ownership -------------------------------------------------------------
    ownership_rows = []
    for path, ranges in blame.items():
        total = sum(r["end"] - r["start"] + 1 for r in ranges)
        lines = Counter()
        latest: Dict[str, datetime] = {}
        for r in ranges:
            user_id = users.get(r.get("login"))
            if not user_id:
                continue
            lines[user_id] += r["end"] - r["start"] + 1
            committed = _parse_time(r.get("committed_at"))
            if committed and (user_id not in latest or committed > latest[user_id]):
                latest[user_id] = committed
        for user_id, owned in lines.items():
            ownership_rows.append({
                "repository_id": repo_id,
                "file_path": path,
                "user_id": user_id,
                "ownership_percentage": round(owned / total * 100, 2) if total else 0,
                "lines_owned": owned,
                "last_modified": latest[user_id].isoformat() if user_id in latest else None,
            })

    blamed_paths = list(blame.keys())

    def _write_ownership():
        # Replace, not merge: someone whose lines were all rewritten no longer
        # owns any part of the file, and an upsert would keep their old row.
        if blamed_paths:
            db.table("code_ownership").delete().eq("repository_id", repo_id) \
                .in_("file_path", blamed_paths).execute()
        if ownership_rows:
            db.table("code_ownership").insert(ownership_rows).execute()

    await run_blocking(_write_ownership)

    # -- weekly contributions --------------------------------------------------
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=settings.INSIGHTS_WEEKS)
    weekly: Dict[tuple, Dict[str, int]] = defaultdict(lambda: {"commits": 0, "added": 0, "removed": 0})
    for contributor in stats:
        user_id = users.get(contributor.get("login"))
        if not user_id:
            continue
        for week in contributor["weeks"]:
            start, _ = _week_bounds(week["week_start"])
            if start < cutoff or not (week["commits"] or week["additions"] or week["deletions"]):
                continue
            bucket = weekly[(user_id, start)]
            bucket["commits"] += week["commits"]
            bucket["added"] += week["additions"]
            bucket["removed"] += week["deletions"]
    for key in introduced:
        # A week with findings introduced but no commit statistics yet (GitHub
        # computes them lazily) still gets a row, so the count is not lost.
        if key[1] >= cutoff and key not in weekly:
            weekly[key] = {"commits": 0, "added": 0, "removed": 0}

    contribution_rows = [
        {
            "user_id": user_id,
            "repository_id": repo_id,
            "period_start": start.isoformat(),
            "period_end": (start + timedelta(days=7)).isoformat(),
            "commits_count": b["commits"],
            "lines_added": b["added"],
            "lines_removed": b["removed"],
            "issues_introduced": introduced.get((user_id, start), 0),
        }
        for (user_id, start), b in weekly.items()
    ]
    if contribution_rows:
        await run_blocking(
            lambda: db.table("developer_contributions")
            .upsert(contribution_rows, on_conflict="user_id,repository_id,period_start,period_end")
            .execute()
        )

    summary = {
        "contributors": len({r["user_id"] for r in contribution_rows}),
        "files_blamed": len(blamed_paths),
        "issues_blamed": len(blame_rows),
    }
    logger.info(f"Insights refreshed for {repo['full_name']}: {summary}")
    return summary


async def mark_resolved_issues(
    repo_id: str, analysis_id: str, analysed_paths: List[str]
) -> int:
    """
    Mark findings from the previous analysis that this one no longer reports.

    Nothing ever wrote issues.fixed, so "issues fixed" and team velocity were
    always zero. A finding counts as resolved when its file was reviewed again
    and the same kind of finding (file, agent, category) is now reported fewer
    times. Files this run did not review are left alone - not seeing an issue
    in a file nobody looked at is not evidence it was fixed. Line numbers are
    deliberately not part of the match: unrelated edits move them.
    """
    db = get_service_db()
    reviewed = set(analysed_paths)

    previous = (await run_blocking(
        lambda: db.table("analysis_results").select("id")
        .eq("repository_id", repo_id).eq("status", "completed").neq("id", analysis_id)
        .order("completed_at", desc=True).limit(1).execute()
    )).data
    if not previous:
        return 0

    def _fingerprint(issue):
        return (issue.get("file_path"), issue.get("agent_type"), issue.get("category"))

    old = (await run_blocking(
        lambda: db.table("issues").select("id, file_path, agent_type, category")
        .eq("analysis_id", previous[0]["id"]).eq("fixed", False).execute()
    )).data or []
    new = (await run_blocking(
        lambda: db.table("issues").select("file_path, agent_type, category")
        .eq("analysis_id", analysis_id).execute()
    )).data or []

    remaining = Counter(_fingerprint(i) for i in new)
    resolved = []
    for issue in old:
        if issue.get("file_path") not in reviewed:
            continue
        fp = _fingerprint(issue)
        if remaining[fp] > 0:
            remaining[fp] -= 1
        else:
            resolved.append(issue["id"])

    if resolved:
        now = datetime.now(timezone.utc).isoformat()
        await run_blocking(
            lambda: db.table("issues").update({"fixed": True, "fix_applied_at": now})
            .in_("id", resolved).execute()
        )
    return len(resolved)
