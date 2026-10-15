"""
Repository sync against a real database.

Sync deletes rows for repositories GitHub no longer shows the user, and rows
cascade to analyses, issues and chat. It used to fetch at most 100
repositories, so for any larger account it deleted the rest - and everything
attached to them - on every sync.
"""
from unittest.mock import MagicMock, patch

import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)


def _github_repo(i: int) -> dict:
    return {
        "id": 1000 + i, "name": f"r{i}", "full_name": f"u/r{i}", "private": False,
        "description": None, "url": "", "language": "Python", "stars": 0, "forks": 0,
        "open_issues": 0, "default_branch": "main", "created_at": None,
        "updated_at": None, "size": 1,
    }


def _sync(user_id: str, repos, complete: bool):
    import asyncio
    from app.services.repository_service import RepositoryService

    github = MagicMock()
    github.list_all_repositories.return_value = (repos, complete)
    with patch("app.services.repository_service.create_github_service", return_value=github):
        service = RepositoryService()
        service.redis = MagicMock()
        return asyncio.run(service.sync_repositories(user_id, "token"))


def _repo_ids(db, user_id):  # noqa: F811
    rows = db.table("repositories").select("github_repo_id").eq("user_id", user_id).execute().data
    return sorted(r["github_repo_id"] for r in rows)


@requires_db
class TestSync:

    def test_inserts_then_updates_without_duplicating(self, db, user):  # noqa: F811
        _sync(user["id"], [_github_repo(1), _github_repo(2)], complete=True)
        renamed = dict(_github_repo(1), name="renamed")
        _sync(user["id"], [renamed, _github_repo(2)], complete=True)

        rows = db.table("repositories").select("name, github_repo_id").eq("user_id", user["id"]).execute().data
        assert sorted(r["github_repo_id"] for r in rows) == [1001, 1002]
        assert {r["name"] for r in rows} == {"renamed", "r2"}

    def test_a_complete_listing_prunes_revoked_repositories(self, db, user):  # noqa: F811
        _sync(user["id"], [_github_repo(1), _github_repo(2)], complete=True)
        _sync(user["id"], [_github_repo(1)], complete=True)

        assert _repo_ids(db, user["id"]) == [1001]

    def test_a_partial_listing_never_deletes_anything(self, db, user):  # noqa: F811
        """The data-loss bug: repos past the listing limit, and their analyses, were deleted."""
        _sync(user["id"], [_github_repo(i) for i in range(5)], complete=True)
        beyond_the_limit = db.table("repositories").select("id").eq("user_id", user["id"]) \
            .eq("github_repo_id", 1004).execute().data[0]["id"]
        db.table("analysis_results").insert(
            {"repository_id": beyond_the_limit, "status": "completed"}
        ).execute()

        _sync(user["id"], [_github_repo(i) for i in range(3)], complete=False)

        assert _repo_ids(db, user["id"]) == [1000, 1001, 1002, 1003, 1004]
        assert db.table("analysis_results").select("id") \
            .eq("repository_id", beyond_the_limit).execute().data

    def test_an_empty_listing_deletes_nothing(self, db, user):  # noqa: F811
        """An empty answer is far more likely an API blip than zero repositories."""
        _sync(user["id"], [_github_repo(1)], complete=True)
        _sync(user["id"], [], complete=True)

        assert _repo_ids(db, user["id"]) == [1001]


class TestListingReportsCompleteness:

    def test_installation_listing_compares_against_total_count(self):
        from app.services.github_service import GitHubService

        svc = GitHubService.__new__(GitHubService)
        svc.access_token = "ghs_x"
        page = MagicMock(status_code=200)
        page.json.return_value = {
            "total_count": 250,
            "repositories": [
                {"id": i, "name": "r", "full_name": "o/r", "private": False, "html_url": ""}
                for i in range(100)
            ],
        }
        with patch("app.services.github_service.httpx.get", return_value=page):
            repos, complete = svc._get_installation_repositories(limit=100)

        assert len(repos) == 100
        assert complete is False

    def test_limit_is_configurable(self):
        from app.core.config import get_settings

        assert get_settings().GITHUB_SYNC_MAX_REPOS >= 100
