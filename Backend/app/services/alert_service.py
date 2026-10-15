"""
Organisation alerts: conditions in a repository's latest analysis that someone
should look at, stored in the `alerts` table.

What was broken, and why it is shaped like this now:

  - create_alert did `await (await run_blocking(...))`. The inner await returns
    a Result, awaiting that raises TypeError, and a broad except swallowed it -
    so no alert was ever stored, while the check reported alerts "found".
  - It also wrote to audit_logs, although the baseline has an `alerts` table.
    Audit rows have no acknowledged flag, so alerts could not be dismissed.
  - Two of the three checks iterated EVERY completed analysis of every
    repository, not the latest one: a repository that scored 40 a year ago and
    95 today still raised "quality below threshold". Every check now reads only
    the latest completed analysis per repository.
  - `analysis.get("overall_score", 100)` returns None when the column is NULL,
    and `None < 70` raises. A missing score now raises no alert - absence of a
    number is not evidence of a problem.
  - Nothing deduplicated, so an hourly schedule would have re-raised the same
    condition 24 times a day. Each alert carries a dedupe key naming the
    analysis it describes; one condition in one analysis is one alert, however
    often the checks run, and acknowledging it is final.

Alert types (alert_type):
  critical_issues         latest analysis has critical_issues > 0 (any agent)
  security_vulnerability  latest analysis has >= 1 critical finding from the
                          security agent (counted from `issues`)
  quality_threshold       latest analysis overall_score < ALERT_QUALITY_THRESHOLD

Which repositories belong to an organisation is OrganizationService's answer
(repositories assigned to one of its teams).
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.concurrency import run_blocking
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.postgres import get_service_db

logger = get_logger(__name__)
settings = get_settings()


class AlertTypes:
    CRITICAL_ISSUES = "critical_issues"
    SECURITY_VULNERABILITY = "security_vulnerability"
    QUALITY_THRESHOLD = "quality_threshold"


# Columns returned to clients. dedupe_key is an internal mechanism.
ALERT_COLUMNS = (
    "id, organization_id, repository_id, alert_type, severity, message, details, "
    "acknowledged, acknowledged_at, acknowledged_by, created_at"
)


def _analysis_key(analysis: Dict[str, Any]) -> str:
    return f"analysis:{analysis['id']}"


def _base_details(repo: Dict[str, Any], analysis: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "repository_name": repo.get("name"),
        "repository_full_name": repo.get("full_name"),
        "analysis_id": analysis["id"],
        "analysis_completed_at": analysis.get("completed_at"),
    }


def critical_issues_condition(
    repo: Dict[str, Any], analysis: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """The latest analysis reported at least one critical issue."""
    count = analysis.get("critical_issues") or 0
    if count <= 0:
        return None
    noun = "issue" if count == 1 else "issues"
    return {
        "alert_type": AlertTypes.CRITICAL_ISSUES,
        "severity": "critical",
        "repository_id": repo["id"],
        "dedupe_key": _analysis_key(analysis),
        "message": f"{count} critical {noun} in the latest analysis of {repo.get('name')}",
        "details": {**_base_details(repo, analysis), "critical_issues": count},
    }


def quality_threshold_condition(
    repo: Dict[str, Any], analysis: Dict[str, Any], threshold: int
) -> Optional[Dict[str, Any]]:
    """The latest analysis scored below the configured threshold."""
    score = analysis.get("overall_score")
    if score is None or score >= threshold:
        return None
    return {
        "alert_type": AlertTypes.QUALITY_THRESHOLD,
        "severity": "high" if score < 50 else "medium",
        "repository_id": repo["id"],
        "dedupe_key": _analysis_key(analysis),
        "message": f"Quality score {score} is below the threshold of {threshold} in {repo.get('name')}",
        "details": {**_base_details(repo, analysis), "score": score, "threshold": threshold},
    }


def security_vulnerability_condition(
    repo: Dict[str, Any], analysis: Dict[str, Any], critical_security_findings: int
) -> Optional[Dict[str, Any]]:
    """The latest analysis has critical findings from the security agent."""
    if critical_security_findings <= 0:
        return None
    noun = "vulnerability" if critical_security_findings == 1 else "vulnerabilities"
    return {
        "alert_type": AlertTypes.SECURITY_VULNERABILITY,
        "severity": "critical",
        "repository_id": repo["id"],
        "dedupe_key": _analysis_key(analysis),
        "message": f"{critical_security_findings} critical security {noun} in {repo.get('name')}",
        "details": {
            **_base_details(repo, analysis),
            "vulnerability_count": critical_security_findings,
            "security_score": analysis.get("security_score"),
        },
    }


class AlertService:
    def __init__(self):
        self.db = get_service_db()

    # -- evaluation --------------------------------------------------------

    async def _latest_analyses(
        self, organization_id: str
    ) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
        """(repository, its latest completed analysis) for each org repository."""
        from app.services.organization_service import OrganizationService
        from app.services.repository_service import RepositoryService

        org = (await run_blocking(
            self.db.table("organizations").select("owner_id").eq("id", organization_id).single().execute
        )).data
        if not org:
            return []

        # The owner always passes the organisation access check, so this is the
        # organisation's full repository set, not one member's view of it.
        repos = await OrganizationService().get_organization_repositories(
            organization_id, org["owner_id"]
        )
        repo_service = RepositoryService()
        pairs = []
        for repo in repos:
            analysis = await repo_service.get_latest_analysis(repo["id"])
            if analysis:
                pairs.append((repo, analysis))
        return pairs

    async def _critical_security_findings(self, analysis_id: str) -> int:
        rows = (await run_blocking(
            self.db.table("issues")
            .select("id")
            .eq("analysis_id", analysis_id)
            .eq("agent_type", "security")
            .eq("severity", "critical")
            .execute
        )).data or []
        return len(rows)

    async def evaluate_organization(self, organization_id: str) -> List[Dict[str, Any]]:
        """
        Every alert condition currently true for the organisation, unstored.
        Derived only from each repository's latest completed analysis.
        """
        threshold = settings.ALERT_QUALITY_THRESHOLD
        conditions = []
        for repo, analysis in await self._latest_analyses(organization_id):
            conditions.append(critical_issues_condition(repo, analysis))
            conditions.append(quality_threshold_condition(repo, analysis, threshold))
            # Only an analysis that reported critical issues can have critical
            # security findings; skip the query otherwise.
            if (analysis.get("critical_issues") or 0) > 0:
                findings = await self._critical_security_findings(analysis["id"])
                conditions.append(security_vulnerability_condition(repo, analysis, findings))
        return [c for c in conditions if c]

    async def check_organization(self, organization_id: str) -> Dict[str, Any]:
        """
        Evaluate and store. Returns
            {"alerts_found": int, "alerts_created": int, "alerts": [created rows]}
        where alerts_found counts conditions currently true and alerts_created
        how many of them were new (the rest were raised by an earlier check).
        """
        conditions = await self.evaluate_organization(organization_id)
        created = []
        for condition in conditions:
            row = await self.create_alert(organization_id=organization_id, **condition)
            if row:
                created.append(row)
        if created:
            logger.info(f"Organization {organization_id}: {len(created)} new alert(s)")
        return {
            "alerts_found": len(conditions),
            "alerts_created": len(created),
            "alerts": created,
        }

    # -- storage -----------------------------------------------------------

    async def create_alert(
        self,
        organization_id: str,
        repository_id: str,
        alert_type: str,
        severity: str,
        message: str,
        dedupe_key: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Store an alert unless this exact condition was already raised.
        Returns the new row, or None when it was a duplicate.
        """
        existing = (await run_blocking(
            self.db.table("alerts")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("repository_id", repository_id)
            .eq("alert_type", alert_type)
            .eq("dedupe_key", dedupe_key)
            .limit(1)
            .execute
        )).data
        if existing:
            return None

        import psycopg

        try:
            result = await run_blocking(
                self.db.table("alerts").insert({
                    "organization_id": organization_id,
                    "repository_id": repository_id,
                    "alert_type": alert_type,
                    "severity": severity,
                    "message": message,
                    "dedupe_key": dedupe_key,
                    "details": details or {},
                }).execute
            )
        except psycopg.errors.UniqueViolation:
            # Another check (the schedule and a manual check) stored it between
            # our lookup and this insert. The unique index is what decided.
            return None

        row = result.data[0]
        row.pop("dedupe_key", None)
        return row

    async def visible_repository_ids(self, organization_id: str, user_id: str) -> List[str]:
        """
        Repositories whose alerts this user may see: the organization's owner
        sees all; anyone else sees those assigned to teams they are on.

        SECURITY: alerts carry a repository's name, scores and finding counts.
        Organization membership alone exposed every team's repositories - the
        same boundary as OrganizationService.get_organization_repositories,
        which this reuses.
        """
        from app.services.organization_service import OrganizationService

        repos = await OrganizationService().get_organization_repositories(organization_id, user_id)
        return [r["id"] for r in repos]

    async def get_organization_alerts(
        self,
        organization_id: str,
        user_id: str,
        days: int = 7,
        include_acknowledged: bool = True,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Alerts from the last `days` days, newest first. None when the user is
        not a member of the organisation (the route answers 404).
        """
        from app.services.organization_service import OrganizationService

        if not await OrganizationService().get_organization(organization_id, user_id):
            return None

        visible = await self.visible_repository_ids(organization_id, user_id)
        if not visible:
            return []

        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query = (
            self.db.table("alerts")
            .select(ALERT_COLUMNS)
            .eq("organization_id", organization_id)
            .in_("repository_id", visible)
            .gte("created_at", since)
        )
        if not include_acknowledged:
            query = query.eq("acknowledged", False)
        result = await run_blocking(query.order("created_at", desc=True).execute)
        return result.data or []

    async def acknowledge_alert(self, alert_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Mark an alert acknowledged. Any member of the alert's organisation may.

        Returns the alert, or None when it does not exist or the user is not a
        member - the same answer for both, so ids cannot be probed. Idempotent:
        acknowledging twice keeps the first acknowledger and time.
        """
        from app.services.organization_service import OrganizationService

        try:
            uuid.UUID(str(alert_id))
        except ValueError:
            # Not an id at all. Postgres would reject the cast with an error
            # that surfaces as a 500; it is simply "not found".
            return None

        alert = (await run_blocking(
            self.db.table("alerts").select("organization_id, repository_id").eq("id", alert_id).single().execute
        )).data
        if not alert or not alert.get("organization_id"):
            return None

        organization_id = alert["organization_id"]
        if not await OrganizationService().get_organization(organization_id, user_id):
            return None
        if alert.get("repository_id") not in await self.visible_repository_ids(organization_id, user_id):
            return None

        await run_blocking(
            self.db.table("alerts")
            .update({
                "acknowledged": True,
                "acknowledged_at": datetime.now(timezone.utc).isoformat(),
                "acknowledged_by": user_id,
            })
            .eq("id", alert_id)
            .eq("organization_id", organization_id)
            .eq("acknowledged", False)
            .execute
        )
        return (await run_blocking(
            self.db.table("alerts")
            .select(ALERT_COLUMNS)
            .eq("id", alert_id)
            .eq("organization_id", organization_id)
            .single()
            .execute
        )).data
