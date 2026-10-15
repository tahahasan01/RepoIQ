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


def _digest(run_id, user_id):
    from app.services import autofix

    return autofix.public_view(asyncio.run(autofix.get_run(run_id, user_id)))["proposals_digest"]


def _approve_and_publish(run_id, user_id, github):
    from app.services import autofix

    digest = _digest(run_id, user_id)
    asyncio.run(autofix.approve_run(run_id, user_id, digest))
    with patch("app.services.github_service.create_github_service", return_value=github):
        return asyncio.run(autofix.publish_run(run_id, "token", digest))


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

    def test_nothing_is_pushed_before_approval(self, db, user, repo, issues):  # noqa: F811
        """
        A proposal is model output from untrusted repository content, and a
        push runs CI with the repository's secrets. A person sees the diff first.
        """
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})

        result, _ = _run(run["id"], github, {"app.py": _good()})

        assert result["status"] == "ready"
        github.create_branch_at.assert_not_called()
        github.update_file.assert_not_called()
        github.create_pull_request.assert_not_called()
        view = autofix.public_view(asyncio.run(autofix.get_run(run["id"], user["id"])))
        assert view["proposals"][0]["file_path"] == "app.py"
        assert "+    return ast.literal_eval(x)" in view["proposals"][0]["diff"]
        assert "content" not in view["proposals"][0]  # diffs only, never whole files

    def test_approval_opens_one_draft_pull_request_from_the_reviewed_commit(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        _run(run["id"], github, {"app.py": _good()})

        result = _approve_and_publish(run["id"], user["id"], github)

        assert result["pull_request"]["number"] == 7
        github.create_branch_at.assert_called_once_with("alice/r", f"repoiq/fix-{run['id'][:8]}", "base-sha")
        assert github.update_file.call_args.args[2] == FIXED
        assert github.create_pull_request.call_args.args[-1] is True  # draft
        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert stored["status"] == "completed"
        assert stored["pr_url"].endswith("/pull/7")
        assert stored["fixed_issue_ids"] == [issues[0]["id"]]

    def test_a_run_is_approved_once(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        _run(run["id"], _github({"app.py": ORIGINAL}), {"app.py": _good()})
        digest = _digest(run["id"], user["id"])
        asyncio.run(autofix.approve_run(run["id"], user["id"], digest))

        with pytest.raises(autofix.AutofixError):
            asyncio.run(autofix.approve_run(run["id"], user["id"], digest))

    def test_approval_must_name_the_reviewed_content(self, db, user, repo, issues):  # noqa: F811
        """An approval for one set of changes cannot publish a different one."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        _run(run["id"], _github({"app.py": ORIGINAL}), {"app.py": _good()})

        with pytest.raises(autofix.AutofixError, match="not the ones you reviewed"):
            asyncio.run(autofix.approve_run(run["id"], user["id"], "0" * 64))
        assert asyncio.run(autofix.get_run(run["id"], user["id"]))["status"] == "ready"

    def test_a_redelivered_task_does_not_regenerate_reviewed_proposals(self, db, user, repo, issues):  # noqa: F811
        """Celery redelivers after a worker dies; proposals someone is reviewing must not change."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        _run(run["id"], github, {"app.py": _good()})
        before = _digest(run["id"], user["id"])

        other = dict(_good(), updated_file=FIXED.replace("literal_eval", "literal_eval  # changed"))
        result, agent = _run(run["id"], github, {"app.py": other})

        agent.propose_fix.assert_not_called()
        assert result["status"] == "ready"
        assert _digest(run["id"], user["id"]) == before

    def test_discard_pushes_nothing(self, db, user, repo, issues):  # noqa: F811
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL})
        _run(run["id"], github, {"app.py": _good()})

        discarded = asyncio.run(autofix.discard_run(run["id"], user["id"]))

        assert discarded["status"] == "discarded"
        with pytest.raises(autofix.AutofixError):
            asyncio.run(autofix.publish_run(run["id"], "token", "0" * 64))
        github.create_branch_at.assert_not_called()

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
        _run(run["id"], github, {"app.py": _good()})
        github.create_branch_at.side_effect = GitHubWriteError("RepoIQ does not have write access", permission=True)

        with pytest.raises(GitHubWriteError):
            _approve_and_publish(run["id"], user["id"], github)

        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert stored["status"] == "failed"
        assert "write access" in stored["error_message"]

    def test_read_only_users_cannot_push(self, db, user, repo, issues):  # noqa: F811
        """An installation token writes with the APP's permissions, not the user's."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        github = _github({"app.py": ORIGINAL}, permission="read")

        with pytest.raises(autofix.AutofixError):
            _, agent = _run(run["id"], github, {"app.py": _good()})

        github.create_branch_at.assert_not_called()
        github.get_user_permission.assert_called_with("alice/r", "alice")
        assert "write access" in asyncio.run(autofix.get_run(run["id"], user["id"]))["error_message"]


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
        # Finding paths come from model output; traversal must not slip past.
        "src/../.github/workflows/ci.yml", "./.github/workflows/ci.yml", "../outside.py",
        "/etc/passwd", "a/./../.github/x.yml", "",
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

    def test_a_change_far_from_the_finding_is_flagged_for_review(self):
        """
        A correct fix can need a change elsewhere (a data-loss fix at line 86
        needed the structure at line 56), so it is not rejected - but the
        reviewer is told exactly which lines lie outside the findings.
        """
        from app.services.autofix import far_from_findings, validate_fix

        original = "\n".join(f"line{n}" for n in range(1, 101)) + "\n"
        lines = original.splitlines()
        lines[4] = "line5 fixed"          # near the finding at line 5
        lines[89] = "exfiltrate(secrets)"  # line 90, far away
        updated = "\n".join(lines) + "\n"
        proposal = {"changed": True, "updated_file": updated, "addressed": [1]}

        assert validate_fix(original, proposal, [5]) is None
        assert far_from_findings(original, updated, [5]) == [90]

    @pytest.mark.parametrize("char", [
        "\u2028", "\u2029", "\x0c", "\x0b", "\x1c", "\x85",       # line-breaking
        "\u202e", "\u2066", "\u200f",                              # bidi controls
        "\u200b", "\u2060", "\ufeff", "\U000e0041",                 # zero-width / BOM / tag
        "\x00", "\x1b", "\ue000",                                   # controls, private use
    ])
    def test_characters_that_hide_code_from_review_are_rejected(self, char):
        """str.splitlines() and browsers disagree on these; bidi controls reorder display."""
        from app.services.autofix import validate_fix

        updated = FIXED.replace("return 1", f"return 1{char}import os; os.system('x')")
        reason = validate_fix(ORIGINAL, {"changed": True, "updated_file": updated, "addressed": [1]})
        assert reason and "invisible" in reason

    def test_characters_already_in_the_file_are_still_rejected(self):
        """A character planted in the repository must not ride through into an unreadable diff."""
        from app.services.autofix import validate_fix

        planted = ORIGINAL.replace("return 1", "return 1\u202e")
        updated = FIXED.replace("return 1", "return 1\u202e")
        reason = validate_fix(planted, {"changed": True, "updated_file": updated, "addressed": [1]})
        assert reason and "invisible" in reason

    def test_summary_cannot_forge_commit_trailers(self):
        from app.services.autofix import clean_summary

        forged = "Fix eval\n\nCo-authored-by: Someone Else <x@example.com>\u202e"
        cleaned = clean_summary(forged)
        assert "\n" not in cleaned and "\u202e" not in cleaned
        assert cleaned.startswith("Fix eval Co-authored-by")  # inert on one line
        assert clean_summary("") == "Fix for the listed findings"
        assert len(clean_summary("x" * 500)) == 200

    def test_ordinary_unicode_is_allowed(self):
        from app.services.autofix import validate_fix

        updated = FIXED.replace("return 1", "return 'café – naïve ✓ 日本'")
        assert validate_fix(ORIGINAL, {"changed": True, "updated_file": updated, "addressed": [1]}) is None

    def test_line_ending_changes_are_rejected(self):
        from app.services.autofix import validate_fix

        reason = validate_fix(ORIGINAL, {"changed": True, "updated_file": FIXED.replace("\n", "\r\n"), "addressed": [1]})
        assert reason and "line endings" in reason

    def test_the_diff_splits_lines_the_way_github_does(self):
        from app.services.autofix import _unified_diff

        diff = _unified_diff("a.py", "x = 1\n", "x = 2\n")
        assert "-x = 1" in diff and "+x = 2" in diff

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


@requires_db
class TestHiddenContext:

    def test_hidden_characters_in_surrounding_code_block_the_proposal(self, db, user, repo, issues):  # noqa: F811
        """Context lines in the diff come from the original file."""
        from app.services import autofix

        run = asyncio.run(autofix.create_run(repo, user["id"], [issues[0]["id"]]))
        planted = ORIGINAL.replace("def g():", "def g():  # \u200b")
        github = _github({"app.py": planted})
        proposal = dict(_good(), updated_file=FIXED.replace("def g():", "def g():  # \u200b"))

        result, _ = _run(run["id"], github, {"app.py": proposal})

        assert result["status"] == "completed"
        stored = asyncio.run(autofix.get_run(run["id"], user["id"]))
        assert "invisible" in stored["skipped"][0]["reason"]
