"""
Code ownership and issue blame.

Read-only: code_ownership and issue_blame are written by
app/services/repository_insights.py from the GitHub blame of each analysed
file. Access is the owner of the repository, checked through
RepositoryService.get_repository like every other repository read.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.core.concurrency import run_blocking
from app.core.logging import get_logger
from app.db.postgres import get_service_db
from app.services.team_service import TEAM_MEMBER_USER_COLUMNS

logger = get_logger(__name__)

# A file whose most recent commit by any current owner is older than this has
# nobody actively looking after it.
DEFAULT_ORPHAN_DAYS = 90
# One person holding more than this share of a file is a bus-factor risk.
CONCENTRATION_THRESHOLD = 80


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class OwnershipService:
    def __init__(self):
        self.db = get_service_db()

    async def _owned_repository(self, repository_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        from app.services.repository_service import RepositoryService

        return await RepositoryService().get_repository(repository_id, user_id)

    async def get_repository_ownership(
        self, repository_id: str, user_id: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """file_path -> owners, largest share first."""
        repo = await self._owned_repository(repository_id, user_id)
        if not repo:
            return {}

        # SECURITY: explicit column allowlist, never users(*) (AUDIT.md C-4).
        rows = (await run_blocking(
            self.db.table("code_ownership").select(
                f"file_path, user_id, ownership_percentage, lines_owned, last_modified, "
                f"users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("repository_id", repo["id"]).execute
        )).data or []

        ownership: Dict[str, List[Dict[str, Any]]] = {}
        for row in rows:
            ownership.setdefault(row["file_path"], []).append({
                "user_id": row["user_id"],
                "user": row.get("users"),
                "ownership_percentage": row["ownership_percentage"],
                "lines_owned": row["lines_owned"],
                "last_modified": row["last_modified"],
            })
        for owners in ownership.values():
            owners.sort(key=lambda o: o["ownership_percentage"] or 0, reverse=True)
        return ownership

    async def get_orphaned_code(
        self, repository_id: str, user_id: str, days_threshold: int = DEFAULT_ORPHAN_DAYS
    ) -> List[Dict[str, Any]]:
        """Files where no owner has committed within the threshold."""
        ownership = await self.get_repository_ownership(repository_id, user_id)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_threshold)

        orphaned = []
        for path, owners in ownership.items():
            dates = [d for d in (_parse(o["last_modified"]) for o in owners) if d]
            latest = max(dates) if dates else None
            if latest is None or latest < cutoff:
                orphaned.append({
                    "file_path": path,
                    "last_modified": latest.isoformat() if latest else None,
                    "owners": [
                        {"user_id": o["user_id"], "ownership_percentage": o["ownership_percentage"]}
                        for o in owners
                    ],
                })
        return orphaned

    async def get_ownership_health(self, repository_id: str, user_id: str) -> Dict[str, Any]:
        """
        Spread of ownership across the blamed files.

        health_score starts at 100 and loses up to 30 points for the share of
        orphaned files and up to 20 for the share of files one person holds more
        than CONCENTRATION_THRESHOLD percent of. None when nothing is blamed yet,
        rather than a 0 that would read as "terrible".
        """
        ownership = await self.get_repository_ownership(repository_id, user_id)
        total = len(ownership)
        if not total:
            return {
                "health_score": None,
                "total_files": 0,
                "orphaned_files": 0,
                "high_concentration_files": 0,
                "average_owners_per_file": 0,
            }

        orphaned = len(await self.get_orphaned_code(repository_id, user_id))
        concentrated = sum(
            1 for owners in ownership.values()
            if owners and (owners[0]["ownership_percentage"] or 0) > CONCENTRATION_THRESHOLD
        )
        score = 100 - (orphaned / total) * 30 - (concentrated / total) * 20
        return {
            "health_score": round(max(0.0, score), 1),
            "total_files": total,
            "orphaned_files": orphaned,
            "high_concentration_files": concentrated,
            "average_owners_per_file": round(sum(len(o) for o in ownership.values()) / total, 2),
        }

    async def get_issue_blame(self, issue_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Who introduced the line a finding points at, if they are a RepoIQ user."""
        issue = (await run_blocking(
            self.db.table("issues").select("id, analysis_results(repository_id)")
            .eq("id", issue_id).single().execute
        )).data
        repository_id = ((issue or {}).get("analysis_results") or {}).get("repository_id")
        if not repository_id or not await self._owned_repository(repository_id, user_id):
            return []

        return (await run_blocking(
            self.db.table("issue_blame").select(
                f"user_id, blame_type, created_at, users({TEAM_MEMBER_USER_COLUMNS})"
            ).eq("issue_id", issue_id).execute
        )).data or []
