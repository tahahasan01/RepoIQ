"""
Webhooks that fire: emission, Celery-retried delivery, and delivery history.

Before this nothing emitted an event (trigger_event had no callers), delivery
retried by sleeping 5s/30s/300s inline, and webhook_deliveries was written but
never read.
"""
import asyncio
import hashlib
import hmac
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


PUBLIC_ADDRINFO = [(2, 1, 6, "", ("93.184.216.34", 443))]


@pytest.fixture(autouse=True)
def fresh_webhook_service(monkeypatch):
    """The module caches one WebhookService; its client must be the test database's."""
    from app.services import webhook_service

    monkeypatch.setattr(webhook_service, "_webhook_service", None)


def _hook(db, owner, events, active=True, url="https://hooks.example.com/in"):  # noqa: F811
    return db.table("webhooks").insert({
        "user_id": owner["id"], "url": url, "events": events, "secret": "s3cret", "active": active,
    }).execute().data[0]


@pytest.fixture
def bob(db):  # noqa: F811
    return db.table("users").insert({"email": "bob@example.com", "full_name": "Bob"}).execute().data[0]


def _mock_http(handler):
    """Patch httpx.AsyncClient in the service so requests go to `handler`."""
    real = httpx.AsyncClient

    def factory(**kwargs):
        return real(transport=httpx.MockTransport(handler), **kwargs)

    return patch("app.services.webhook_service.httpx.AsyncClient", side_effect=factory)


def _public_dns():
    return patch("app.services.url_guard.socket.getaddrinfo", return_value=PUBLIC_ADDRINFO)


# ---------------------------------------------------------------------------
# Emission
# ---------------------------------------------------------------------------

@requires_db
class TestEmitEvent:

    def test_enqueues_one_task_per_subscribed_webhook_only(self, db, user, bob):  # noqa: F811
        from app.services.webhook_service import emit_event

        exact = _hook(db, user, ["analysis.completed"])
        wildcard = _hook(db, user, ["*"])
        _hook(db, user, ["analysis.failed"])            # other event
        _hook(db, user, ["*"], active=False)            # deactivated
        _hook(db, bob, ["*"])                           # someone else's

        with patch("app.services.analysis_dispatch.resolve_mode", return_value="queue"), \
                patch("app.tasks.webhook_tasks.deliver_webhook_task.delay") as delay:
            count = asyncio.run(emit_event(user["id"], "analysis.completed", {"analysis_id": "a"}))

        assert count == 2
        enqueued = [c.kwargs for c in delay.call_args_list]
        assert sorted(k["webhook_id"] for k in enqueued) == sorted([exact["id"], wildcard["id"]])
        for kwargs in enqueued:
            # SECURITY: the broker stores task arguments in plaintext. The
            # signing secret (and the row it lives in) must not be among them.
            assert set(kwargs) == {"webhook_id", "user_id", "event_type", "payload", "delivery_id"}
            assert "s3cret" not in json.dumps(kwargs)
            uuid.UUID(kwargs["delivery_id"])

    def test_no_subscribers_means_no_dispatch_and_no_worker_ping(self, db, user):  # noqa: F811
        from app.services.webhook_service import emit_event

        with patch("app.services.analysis_dispatch.resolve_mode") as resolve_mode:
            assert asyncio.run(emit_event(user["id"], "analysis.completed", {})) == 0
        resolve_mode.assert_not_called()

    def test_without_a_worker_it_delivers_inline_in_one_attempt(self, db, user):  # noqa: F811
        from app.services.webhook_service import WebhookService, emit_event

        _hook(db, user, ["*"])
        with patch("app.services.analysis_dispatch.resolve_mode", return_value="inline"), \
                patch("app.tasks.webhook_tasks.deliver_webhook_task.delay") as delay, \
                patch.object(WebhookService, "send_webhook", new=AsyncMock(return_value=True)) as send:
            assert asyncio.run(emit_event(user["id"], "analysis.failed", {"x": 1})) == 1

        delay.assert_not_called()
        send.assert_awaited_once()
        assert send.await_args.kwargs["max_attempts"] == 1

    def test_reuses_the_analysis_dispatch_worker_check(self):
        """One definition of "is a worker listening", not two."""
        import inspect
        from app.services import webhook_service

        assert "resolve_mode" in inspect.getsource(webhook_service._dispatch)
        assert "control.ping" not in inspect.getsource(webhook_service)

    def test_a_broker_failure_falls_back_to_inline(self, db, user):  # noqa: F811
        from app.services.webhook_service import WebhookService, emit_event

        _hook(db, user, ["*"])
        with patch("app.services.analysis_dispatch.resolve_mode", return_value="queue"), \
                patch("app.tasks.webhook_tasks.deliver_webhook_task.delay", side_effect=ConnectionError), \
                patch.object(WebhookService, "send_webhook", new=AsyncMock(return_value=True)) as send:
            asyncio.run(emit_event(user["id"], "analysis.completed", {}))

        send.assert_awaited_once()


@requires_db
class TestAnalysisEvents:

    @pytest.fixture
    def repo(self, db, user):  # noqa: F811
        return db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 1, "name": "api", "full_name": "alice/api",
        }).execute().data[0]

    def test_completed_carries_the_stored_scores(self, db, user, repo):  # noqa: F811
        from app.services import webhook_service

        analysis = db.table("analysis_results").insert({
            "repository_id": repo["id"], "status": "completed", "overall_score": 77, "security_score": 66,
            "quality_score": 88, "total_issues": 5, "critical_issues": 1, "high_issues": 2,
        }).execute().data[0]
        _hook(db, user, ["analysis.completed"])

        with patch.object(webhook_service, "_dispatch", new=AsyncMock(return_value=1)) as dispatch:
            asyncio.run(webhook_service.emit_analysis_completed(repo, analysis["id"]))

        user_id, hooks, event, payload = dispatch.await_args.args
        assert (user_id, event, len(hooks)) == (user["id"], "analysis.completed", 1)
        assert payload == {
            "repository_id": repo["id"], "analysis_id": analysis["id"], "overall_score": 77,
            "security_score": 66, "quality_score": 88, "total_issues": 5, "critical_issues": 1,
            "high_issues": 2,
        }

    def test_completed_is_not_sent_for_an_unfinished_analysis(self, db, user, repo):  # noqa: F811
        from app.services import webhook_service

        analysis = db.table("analysis_results").insert(
            {"repository_id": repo["id"], "status": "in_progress"}
        ).execute().data[0]
        _hook(db, user, ["*"])

        with patch.object(webhook_service, "_dispatch", new=AsyncMock()) as dispatch:
            assert asyncio.run(webhook_service.emit_analysis_completed(repo, analysis["id"])) == 0
        dispatch.assert_not_awaited()

    def test_failed_hides_internal_error_text(self, db, user, repo):  # noqa: F811
        from app.services import webhook_service

        with patch.object(webhook_service, "emit_event", new=AsyncMock(return_value=1)) as emit:
            asyncio.run(webhook_service.emit_analysis_failed(
                user["id"], repo["id"], "an-id", RuntimeError("relation users at 10.0.0.5"),
            ))
        assert emit.await_args.args[2]["error"] == "Analysis failed"

        class Actionable(Exception):
            user_facing = True

        with patch.object(webhook_service, "emit_event", new=AsyncMock(return_value=1)) as emit:
            asyncio.run(webhook_service.emit_analysis_failed(
                user["id"], repo["id"], "an-id", Actionable("Configure an API key"),
            ))
        assert emit.await_args.args[1:] == (
            "analysis.failed",
            {"repository_id": repo["id"], "analysis_id": "an-id", "error": "Configure an API key"},
        )

    def test_failed_never_raises(self):
        from app.services import webhook_service

        with patch.object(webhook_service, "emit_event", new=AsyncMock(side_effect=RuntimeError)):
            assert asyncio.run(webhook_service.emit_analysis_failed("u", "r", "a", ValueError())) == 0


class TestAnalysisPipelineEmits:

    def test_followups_emit_analysis_completed(self):
        from app.tasks import analysis_tasks

        orchestrator = MagicMock()
        orchestrator.generate_improvement_roadmap = AsyncMock(return_value={})
        repo = {"id": "r", "user_id": "u"}
        with patch.object(analysis_tasks, "emit_analysis_completed", new=AsyncMock(return_value=0)) as emit, \
                patch("app.services.repository_insights.mark_resolved_issues", new=AsyncMock()), \
                patch("app.services.repository_insights.refresh_repository_insights", new=AsyncMock()):
            asyncio.run(analysis_tasks._run_followups(
                repo=repo, github_token="t", analysis_id="a", issues=[],
                analysed_paths=[], orchestrator=orchestrator, repo_service=MagicMock(save_improvement_roadmap=AsyncMock()),
            ))
        emit.assert_awaited_once_with(repo, "a")

    def test_celery_failure_emits_analysis_failed(self):
        from app.tasks import analysis_tasks

        task = analysis_tasks.CallbackTask()
        error = RuntimeError("x")
        with patch.object(analysis_tasks.CallbackTask, "_mark_analysis_failed", new=AsyncMock()), \
                patch.object(analysis_tasks, "emit_analysis_failed", new=AsyncMock(return_value=1)) as emit:
            task.on_failure(error, "task-id", (), {"repo_id": "r", "user_id": "u", "analysis_id": "a"}, None)
        emit.assert_awaited_once_with("u", "r", "a", error)

    def test_a_cancellation_is_not_a_failure_event(self):
        from app.tasks import analysis_tasks

        task = analysis_tasks.CallbackTask()
        with patch.object(analysis_tasks.CallbackTask, "_mark_analysis_failed", new=AsyncMock()), \
                patch.object(analysis_tasks, "emit_analysis_failed", new=AsyncMock()) as emit:
            task.on_failure(analysis_tasks.AnalysisCancelled("a"), "t", (), {"user_id": "u", "analysis_id": "a"}, None)
        emit.assert_not_awaited()

    def test_inline_failure_emits_analysis_failed(self):
        from app.tasks import analysis_tasks

        with patch.object(analysis_tasks, "_run_analysis", new=AsyncMock(side_effect=RuntimeError("x"))), \
                patch.object(analysis_tasks, "RepositoryService") as repo_service, \
                patch.object(analysis_tasks, "clear_running"), \
                patch.object(analysis_tasks, "emit_analysis_failed", new=AsyncMock(return_value=0)) as emit:
            repo_service.return_value.update_analysis = AsyncMock()
            with pytest.raises(RuntimeError):
                asyncio.run(analysis_tasks.run_analysis_sync("r", "u", "token", "a"))
        assert emit.await_args.args[:3] == ("u", "r", "a")


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------

@requires_db
class TestDeliver:

    def _deliver(self, webhook, handler, **kwargs):
        from app.services.webhook_service import WebhookService

        with _public_dns(), _mock_http(handler):
            return asyncio.run(WebhookService().deliver(webhook, "analysis.completed", {"a": 1}, **kwargs))

    def _rows(self, db, webhook):  # noqa: F811
        return db.table("webhook_deliveries").select("*").eq("webhook_id", webhook["id"]).execute().data

    def test_success_is_signed_and_recorded(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        seen = {}

        def handler(request):
            seen["request"] = request
            return httpx.Response(204)

        delivery_id = str(uuid.uuid4())
        outcome = self._deliver(webhook, handler, delivery_id=delivery_id, attempt=2)

        assert outcome.ok and outcome.status == "success"
        request = seen["request"]
        expected = hmac.new(b"s3cret", request.content, hashlib.sha256).hexdigest()
        assert request.headers["X-RepoIQ-Signature"] == f"sha256={expected}"
        assert request.headers["X-RepoIQ-Delivery"] == delivery_id
        assert json.loads(request.content)["data"] == {"a": 1}
        [row] = self._rows(db, webhook)
        assert (row["status"], row["attempt"], row["delivery_id"], row["response_code"]) == \
            ("success", 2, delivery_id, 204)

    def test_a_5xx_is_retryable_and_says_so(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        outcome = self._deliver(webhook, lambda r: httpx.Response(503), retries_left=True)

        assert (outcome.ok, outcome.retryable, outcome.status) == (False, True, "retrying")
        assert self._rows(db, webhook)[0]["error"] == "http_503"

    def test_the_last_retryable_failure_is_recorded_as_failed(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        outcome = self._deliver(webhook, lambda r: httpx.Response(503), retries_left=False)

        assert outcome.status == "failed"

    def test_a_4xx_rejection_is_final(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        outcome = self._deliver(webhook, lambda r: httpx.Response(404), retries_left=True)

        assert (outcome.retryable, outcome.status) == (False, "failed")

    def test_a_timeout_is_retryable(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])

        def handler(request):
            raise httpx.ReadTimeout("slow", request=request)

        outcome = self._deliver(webhook, handler, retries_left=True)
        assert (outcome.retryable, outcome.error) == (True, "timeout")

    def test_redirects_are_not_followed(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        calls = []

        def handler(request):
            calls.append(str(request.url))
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/latest"})

        outcome = self._deliver(webhook, handler)
        assert calls == [webhook["url"]]
        assert outcome.ok  # a 3xx is the receiver's answer; it is not chased

    def test_an_unsafe_destination_is_blocked_and_not_retried(self, db, user):  # noqa: F811
        from app.services.webhook_service import WebhookService

        webhook = _hook(db, user, ["*"])
        with patch("app.services.url_guard.socket.getaddrinfo",
                   return_value=[(2, 1, 6, "", ("169.254.169.254", 443))]):
            outcome = asyncio.run(WebhookService().deliver(webhook, "x", {}, retries_left=True))

        assert (outcome.status, outcome.retryable) == ("blocked", False)
        assert self._rows(db, webhook)[0]["error"] == "unsafe_destination"


class TestInlineDeliveryNeverSleeps:

    def test_send_webhook_makes_one_attempt_without_sleeping(self):
        from app.services import webhook_service

        service = webhook_service.WebhookService.__new__(webhook_service.WebhookService)
        service._log_delivery = AsyncMock()
        calls = []

        def handler(request):
            calls.append(1)
            return httpx.Response(500)

        with _public_dns(), _mock_http(handler), \
                patch.object(webhook_service.asyncio, "sleep", new=AsyncMock()) as sleep:
            ok = asyncio.run(service.send_webhook({"id": "w", "url": "https://h.example.com", "secret": "s"}, "e", {}))

        assert ok is False
        assert calls == [1]
        sleep.assert_not_awaited()

    def test_more_than_one_inline_attempt_is_refused(self):
        from app.services.webhook_service import WebhookService

        service = WebhookService.__new__(WebhookService)
        with pytest.raises(ValueError):
            asyncio.run(service.send_webhook({}, "e", {}, max_attempts=3))


class TestDeliveryTask:
    """Retries are Celery's: a countdown on a re-queued task, not a sleep."""

    KWARGS = dict(webhook_id="w", user_id="u", event_type="analysis.completed",
                  payload={}, delivery_id="d")

    def _run(self, outcome, retries=0):
        from celery.exceptions import Retry
        from app.tasks import webhook_tasks

        task = webhook_tasks.deliver_webhook_task
        deliver = AsyncMock(return_value=outcome)
        task.push_request(retries=retries)
        try:
            with patch.object(webhook_tasks, "_deliver", new=deliver), \
                    patch.object(task, "retry", side_effect=Retry()) as retry:
                try:
                    result = task.run(**self.KWARGS)
                except Retry:
                    result = None
        finally:
            task.pop_request()
        return result, retry, deliver

    def _outcome(self, ok=False, retryable=True, status="retrying"):
        from app.services.webhook_service import DeliveryOutcome
        return DeliveryOutcome(ok, status, 503 if not ok else 200, retryable)

    def test_registered_with_the_worker(self):
        from app.core.celery_app import celery_app
        import app.tasks.webhook_tasks  # noqa: F401

        assert "deliver_webhook" in celery_app.tasks
        assert "app.tasks.webhook_tasks" in celery_app.conf.include

    def test_a_retryable_failure_is_requeued_with_a_countdown(self):
        from app.services.webhook_service import RETRY_DELAYS_SECONDS

        for retries, delay in enumerate(RETRY_DELAYS_SECONDS):
            result, retry, deliver = self._run(self._outcome(), retries=retries)
            assert result is None
            retry.assert_called_once_with(countdown=delay, max_retries=len(RETRY_DELAYS_SECONDS))
            assert deliver.await_args.kwargs == {"attempt": retries + 1, "retries_left": True}

    def test_the_last_attempt_is_not_retried(self):
        from app.services.webhook_service import RETRY_DELAYS_SECONDS

        result, retry, deliver = self._run(
            self._outcome(status="failed"), retries=len(RETRY_DELAYS_SECONDS)
        )
        retry.assert_not_called()
        assert result["status"] == "failed"
        assert deliver.await_args.kwargs["retries_left"] is False

    def test_a_final_rejection_is_not_retried(self):
        result, retry, _ = self._run(self._outcome(retryable=False, status="failed"))
        retry.assert_not_called()
        assert result["status"] == "failed"

    def test_success_is_not_retried(self):
        result, retry, _ = self._run(self._outcome(ok=True, retryable=False, status="success"))
        retry.assert_not_called()
        assert result["status"] == "success"

    def test_a_deleted_webhook_is_skipped(self):
        result, retry, _ = self._run(None)
        retry.assert_not_called()
        assert result["status"] == "skipped"

    def test_nothing_on_the_delivery_path_sleeps(self):
        import ast
        import inspect
        from app.tasks import webhook_tasks
        from app.services import webhook_service

        for module in (webhook_tasks, webhook_service):
            calls = [
                node for node in ast.walk(ast.parse(inspect.getsource(module)))
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "sleep"
            ]
            assert not calls, f"{module.__name__} sleeps"

    @requires_db
    def test_the_worker_rereads_the_webhook_scoped_to_its_owner(self, db, user, bob):  # noqa: F811
        from app.tasks import webhook_tasks

        webhook = _hook(db, user, ["*"])
        # Bob's id with Alice's webhook: not his, so nothing is sent.
        assert asyncio.run(webhook_tasks._deliver(webhook["id"], bob["id"], "e", {}, "d", 1, True)) is None

        db.table("webhooks").update({"active": False}).eq("id", webhook["id"]).execute()
        assert asyncio.run(webhook_tasks._deliver(webhook["id"], user["id"], "e", {}, "d", 1, True)) is None


# ---------------------------------------------------------------------------
# History endpoint
# ---------------------------------------------------------------------------

@pytest.fixture
def as_user(app):
    from app.api.dependencies import get_current_user

    def _as(user_row):  # noqa: F811
        app.dependency_overrides[get_current_user] = lambda: user_row
    yield _as
    app.dependency_overrides.pop(get_current_user, None)


@requires_db
class TestDeliveriesEndpoint:

    @pytest.fixture
    def webhook(self, db, user):  # noqa: F811
        webhook = _hook(db, user, ["*"])
        db.table("webhook_deliveries").insert([
            {"webhook_id": webhook["id"], "event_type": "analysis.completed", "status": "retrying",
             "attempt": i + 1, "response_code": 503, "delivered_at": f"2026-01-01T00:0{i}:00+00:00"}
            for i in range(3)
        ]).execute()
        return webhook

    def test_owner_sees_newest_first_with_pagination(self, client, as_user, user, webhook):  # noqa: F811
        as_user(user)

        first = client.get(f"/api/v1/webhooks/{webhook['id']}/deliveries?limit=2")
        assert first.status_code == 200
        body = first.json()
        assert [d["attempt"] for d in body["deliveries"]] == [3, 2]
        assert (body["limit"], body["offset"], body["has_more"]) == (2, 0, True)
        assert "secret" not in json.dumps(body)

        rest = client.get(f"/api/v1/webhooks/{webhook['id']}/deliveries?limit=2&offset=2").json()
        assert [d["attempt"] for d in rest["deliveries"]] == [1]
        assert rest["has_more"] is False

    def test_another_user_gets_404(self, client, as_user, bob, webhook):
        as_user(bob)
        assert client.get(f"/api/v1/webhooks/{webhook['id']}/deliveries").status_code == 404

    def test_unknown_and_malformed_ids_are_404(self, client, as_user, user):  # noqa: F811
        as_user(user)
        assert client.get(f"/api/v1/webhooks/{uuid.uuid4()}/deliveries").status_code == 404
        assert client.get("/api/v1/webhooks/not-a-uuid/deliveries").status_code == 404

    def test_a_deactivated_webhook_keeps_its_history(self, client, as_user, db, user, webhook):  # noqa: F811
        db.table("webhooks").update({"active": False}).eq("id", webhook["id"]).execute()
        as_user(user)
        assert len(client.get(f"/api/v1/webhooks/{webhook['id']}/deliveries").json()["deliveries"]) == 3
