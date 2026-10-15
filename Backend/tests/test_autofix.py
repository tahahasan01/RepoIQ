"""
Auto-fix, against a real database with GitHub and the model faked.

It used to: write the model's raw reply over the whole file, run only for the
regex scanner's few auto_fixable categories, reuse one branch name per
analysis, create the branch before knowing there was anything to commit,
swallow GitHub write failures, and always queue to Celery even with no worker.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)

# A vulnerable file for auto-fix to repair. Test data only - never executed.
ORIGINAL = "def f(x):\n    return eval(x)\n\n\ndef g():\n    return 1\n"
FIXED = "import ast\n\n\ndef f(x):\n    return ast.literal_eval(x)\n\n\ndef g():\n    return 1\n"


@pytest.fixture
def repo(db, user):  # noqa: F811
    db.table("users").update({"github_username": "alice"}).eq("id", user["id"]).execute()
    return db.table("repositories").insert({
        "user_id": user["id"], "github_repo_id": 5, "name": "r", "full_name": "alice/r",
        "default_branch": "main",
    }).execute().data[0]


@pytest.fixture
def issues(db, repo):  # noqa: F811
    analysis = db.table("analysis_results").insert(
        {"repository_id": repo["id"], "status": "completed"}
    ).execute().data[0]
    return db.table("issues").insert([
        {"analysis_id": analysis["id"], "agent_type": "security", "severity": "critical",
         "category": "code_injection", "file_path": "app.py", "line_number": 2,
         "description": "eval on input"},
        {"analysis_id": analysis["id"], "agent_type": "quality", "severity": "low",
         "category": "naming", "file_path": "util.py", "line_number": 1, "description": "name"},
    ]).execute().data


def _github(files, permission="write"):
    github = MagicMock()
    github.get_user_permission.return_value = permission
    github.get_branch_head.return_value = "base-sha"
    github.get_file_at.side_effect = lambda full_name, path, ref: files.get(path)
    github.create_pull_request.return_value = {"number": 7, "url": "https://github.com/alice/r/pull/7"}
    return github


def _run(run_id, github, proposals):
    from app.services import autofix

    agent = MagicMock()
    agent.propose_fix = AsyncMock(side_effect=lambda path, content, issues, user_id: proposals[path])
    with patch("app.services.github_service.create_github_service", return_value=github), \
            patch("app.agents.fix_agent.FixAgent", return_value=agent):
        return asyncio.run(autofix.run_autofix(run_id, "token")), agent


def _good(addressed=(1,)):
    return {"changed": True, "updated_file": FIXED, "addressed": list(addressed), "summary": "Use literal_eval"}


@requires_db
class TestCreateRun:

    def test_issues_from_another_repository_are_rejected(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        other = db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 6, "name": "o", "full_name": "alice/o",
        }).execute().data[0]

        with pytest.raises(autofix.AutofixError):
            asyncio.run(autofix.create_run(other, user["id"], [issues[0]["id"]]))

    def test_limits(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        with pytest.raises(autofix.AutofixError):
            asyncio.run(autofix.create_run(repo, user["id"], []))
        import uuid

        with pytest.raises(autofix.AutofixError):
            asyncio.run(autofix.create_run(repo, user["id"], [str(uuid.uuid4()) for _ in range(21)]))
        with pytest.raises(autofix.AutofixError, match="UUIDs"):
            asyncio.run(autofix.create_run(repo, user["id"], ["not-a-uuid"]))

    def test_a_valid_request_is_recorded_pending(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"], issues[0]["id"]]))

        assert run["status"] == "pending"
        assert run["issue_ids"] == [issues[0]["id"]]  # de-duplicated


@requires_db
class TestRun:

    def test_success_opens_one_pull_request(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})

        result, _ = _run(run["id"], github, {"app.py": _good()})

        assert result["pull_request"]["number"] == 7
        github.create_branch.assert_called_once_with("alice/r", f"repoiq/fix-{run['id'][:8]}", "main")
        github.update_file.assert_called_once()
        assert github.update_file.call_args.args[2] == FIXED
        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert stored["status"] == "completed"
        assert stored["pr_url"].endswith("/pull/7")
        assert stored["fixed_issue_ids"] == [issues[0]["id"]]

    def test_content_is_read_at_the_branch_base_commit(self, db, user, repo, issues):  # noqa: F811
        """A cached copy older than the base would silently revert newer commits."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})

        _run(run["id"], github, {"app.py": _good()})

        github.get_file_at.assert_called_with("alice/r", "app.py", "base-sha")

    def test_nothing_safe_means_no_branch_and_no_pull_request(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        truncated = {"changed": True, "updated_file": "def f(", "addressed": [1], "summary": "x"}

        result, _ = _run(run["id"], github, {"app.py": truncated})

        assert result["pull_request"] is None
        github.create_branch.assert_not_called()
        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert stored["status"] == "completed" and stored["skipped"][0]["file_path"] == "app.py"

    def test_one_call_per_file_with_all_its_findings(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [i["id"] for i in issues]))
        github = _github({"app.py": ORIGINAL, "util.py": ORIGINAL})

        _, agent = _run(run["id"], github, {"app.py": _good(), "util.py": _good()})

        assert sorted(c.args[0] for c in agent.propose_fix.call_args_list) == ["app.py", "util.py"]

    def test_missing_write_permission_fails_with_an_actionable_message(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix
        from app.services.github_service import GitHubWriteError

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        github.create_branch.side_effect = GitHubWriteError("RepoIQ does not have write access", permission=True)

        with pytest.raises(GitHubWriteError):
            _run(run["id"], github, {"app.py": _good()})

        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert stored["status"] == "failed"
        assert "write access" in stored["error_message"]

    def test_read_only_users_cannot_push(self, db, user, repo, issues):  # noqa: F811
        """An installation token writes with the APP's permissions, not the user's."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL}, permission="read")

        with pytest.raises(autofix.AutofixError):
            _run(run["id"], github, {"app.py": _good()})

        github.create_branch.assert_not_called()
        github.get_user_permission.assert_called_with("alice/r", "alice")
        assert "write access" in asyncio.run(autofix.get_run(run["id"], user["id"]))["error_message"]

    def test_pull_requests_are_drafts(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        _run(run["id"], github, {"app.py": _good()})

        assert github.create_pull_request.call_args.args[-1] is True

    def test_files_ci_executes_are_never_changed(self, db, user, repo):  # noqa: F811
        from app.services import autofix

        analysis = db.table("analysis_results").insert(
            {"repository_id": repo["id"], "status": "completed"}
        ).execute().data[0]
        workflow = db.table("issues").insert({
            "analysis_id": analysis["id"], "agent_type": "security", "severity": "high",
            "category": "x", "file_path": ".github/workflows/ci.yml", "line_number": 1,
        }).execute().data[0]
        run = asyncio.run(autofix.create_run(repo, user["id"], [workflow["id"]]))
        github = _github({".github/workflows/ci.yml": "on: push\n"})

        result, agent = _run(run["id"], github, {})

        agent.propose_fix.assert_not_called()
        assert result["pull_request"] is None

    def test_runs_are_private_to_their_owner(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        assert asyncio.run(autofix.get_run(run["id"], "00000000-0000-0000-0000-000000000000")) is None


class TestProtectedPaths:

    @pytest.mark.parametrize("path", [
        ".github/workflows/ci.yml", "sub/.github/actions/x.yml", "Makefile", "package.json",
        "backend/requirements.txt", "scripts/deploy.sh", "Dockerfile", "pyproject.toml",
    ])
    def test_protected(self, path):
        from app.services.autofix import is_protected_path

        assert is_protected_path(path)

    @pytest.mark.parametrize("path", ["app.py", "src/db/query.ts", "docs/guide.md"])
    def test_ordinary(self, path):
        from app.services.autofix import is_protected_path

        assert not is_protected_path(path)


class TestValidation:

    @pytest.mark.parametrize("proposal,ok", [
        ({"changed": True, "updated_file": FIXED, "addressed": [1]}, True),
        ({"changed": False, "updated_file": ORIGINAL, "addressed": []}, False),
        ({"changed": True, "updated_file": "", "addressed": [1]}, False),
        ({"changed": True, "updated_file": ORIGINAL, "addressed": [1]}, False),
        ({"changed": True, "updated_file": "x", "addressed": [1]}, False),
        ({"changed": True, "updated_file": "```python\n" + FIXED + "```", "addressed": [1]}, False),
        ({"changed": True, "updated_file": FIXED, "addressed": []}, False),
    ])
    def test_proposals(self, proposal, ok):
        from app.services.autofix import validate_fix

        assert (validate_fix(ORIGINAL, proposal) is None) is ok

    def test_a_change_far_from_the_finding_is_rejected(self):
        """An injected payload elsewhere in the file must not ride along with the fix."""
        from app.services.autofix import validate_fix

        original = "\n".join(f"line{n}" for n in range(1, 101)) + "\n"
        lines = original.splitlines()
        lines[4] = "line5 fixed"          # near the finding at line 5
        lines[89] = "exfiltrate(secrets)"  # line 90, far away
        proposal = {"changed": True, "updated_file": "\n".join(lines) + "\n", "addressed": [1]}

        reason = validate_fix(original, proposal, [5])
        assert reason and "far from" in reason

    def test_a_change_near_the_finding_is_accepted(self):
        from app.services.autofix import validate_fix

        original = "\n".join(f"line{n}" for n in range(1, 101)) + "\n"
        lines = original.splitlines()
        lines[49] = "line50 fixed"
        proposal = {"changed": True, "updated_file": "\n".join(lines) + "\n", "addressed": [1]}

        assert validate_fix(original, proposal, [52]) is None


class TestDispatch:

    def test_falls_back_in_process_without_a_worker(self):
        from app.services import analysis_dispatch

        added = []
        with patch.object(analysis_dispatch, "resolve_mode", return_value="inline"):
            mode = analysis_dispatch.dispatch_autofix("run-1", "tok", lambda fn, **kw: added.append(kw))
        assert mode == "inline"
        assert added == [{"run_id": "run-1", "github_token": "tok"}]

    def test_queues_with_only_the_run_id(self):
        from app.services import analysis_dispatch

        with patch.object(analysis_dispatch, "resolve_mode", return_value="queue"), \
                patch("app.tasks.autofix_tasks.autofix_task") as task:
            analysis_dispatch.dispatch_autofix("run-1", "tok", None)
        task.delay.assert_called_once_with(run_id="run-1")
