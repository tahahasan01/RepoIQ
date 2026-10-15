"""
Executive Dashboard: organization headcount, and team comparison parameters.

The dashboard reads overview.total_teams and overview.total_members, which the
backend never returned, so both always showed 0. And it requests a comparison
with ?team_ids=a,b while the route only understood repeated parameters, so
"a,b" was one id that matched nothing and the comparison came back empty.
"""
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)

from app.api.routes.executive import MAX_COMPARED_TEAMS, parse_team_ids
from app.core.config import get_settings
from app.services.business_metrics_service import BusinessMetricsService
from app.services.team_comparison_service import TeamComparisonService

API = get_settings().api_prefix

A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"
C = "33333333-3333-3333-3333-333333333333"


def _user(db, name):  # noqa: F811
    return db.table("users").insert({"email": f"{name}@example.com", "full_name": name}).execute().data[0]


def _team(db, org, name, members=()):  # noqa: F811
    team = db.table("teams").insert({"organization_id": org["id"], "name": name}).execute().data[0]
    for member in members:
        db.table("team_members").insert({"team_id": team["id"], "user_id": member["id"]}).execute()
    return team


@requires_db
class TestOverviewHeadcount:

    async def test_counts_teams_and_distinct_people_including_the_owner(self, db, user):  # noqa: F811
        org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
        bob, carol, dave = _user(db, "bob"), _user(db, "carol"), _user(db, "dave")
        core = _team(db, org, "Core", [bob, carol])
        _team(db, org, "Platform", [bob, user])  # bob twice, owner on a team too
        _team(db, org, "Empty")
        # A pending invitation is not membership and must not be counted.
        db.table("team_invitations").insert(
            {"team_id": core["id"], "invited_user_id": dave["id"], "invited_by": user["id"]}
        ).execute()
        # Another organization's people are not this one's.
        other = db.table("organizations").insert({"name": "Other", "owner_id": dave["id"]}).execute().data[0]
        _team(db, other, "Elsewhere", [_user(db, "erin")])

        overview = await BusinessMetricsService().get_organization_overview(org["id"], user["id"])

        assert overview["total_teams"] == 3
        assert overview["total_members"] == 3  # alice (owner), bob, carol

    async def test_an_organization_with_no_teams_has_its_owner(self, db, user):  # noqa: F811
        org = db.table("organizations").insert({"name": "Solo", "owner_id": user["id"]}).execute().data[0]

        overview = await BusinessMetricsService().get_organization_overview(org["id"], user["id"])

        assert overview["total_teams"] == 0
        assert overview["total_members"] == 1

    async def test_counts_are_present_when_repositories_are_assigned(self, db, user):  # noqa: F811
        """The repository path returns a different dict; both must carry them."""
        org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
        team = _team(db, org, "Core", [_user(db, "bob")])
        repo = db.table("repositories").insert({
            "user_id": user["id"], "github_repo_id": 1, "name": "r", "full_name": "alice/r",
        }).execute().data[0]
        db.table("repository_assignments").insert({"repository_id": repo["id"], "team_id": team["id"]}).execute()

        overview = await BusinessMetricsService().get_organization_overview(org["id"], user["id"])

        assert overview["total_repositories"] == 1
        assert (overview["total_teams"], overview["total_members"]) == (1, 2)

    async def test_no_access_still_returns_nothing(self, db, user):  # noqa: F811
        stranger = _user(db, "mallory")
        org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]

        assert await BusinessMetricsService().get_organization_overview(org["id"], stranger["id"]) == {}


@requires_db
class TestCompareStaysInsideTheOrganization:

    async def test_a_team_from_another_organization_is_left_out(self, db, user):  # noqa: F811
        """A caller in two organizations must not see one's team in the other's comparison."""
        mine = db.table("organizations").insert({"name": "Mine", "owner_id": user["id"]}).execute().data[0]
        theirs = db.table("organizations").insert({"name": "Theirs", "owner_id": user["id"]}).execute().data[0]
        here = _team(db, mine, "Here", [_user(db, "bob")])
        there = _team(db, theirs, "There")

        result = await TeamComparisonService().compare_teams(mine["id"], user["id"], [here["id"], there["id"]])

        assert [t["team_id"] for t in result] == [here["id"]]
        # Team size no longer reads 0 just because no repository is assigned.
        assert result[0]["team_size"] == 1


class TestParseTeamIds:

    @pytest.mark.parametrize("raw, expected", [
        (None, None),
        ([], None),
        ([f"{A},{B}"], [A, B]),
        ([A, B], [A, B]),
        ([f"{A},{B}", C], [A, B, C]),
        ([f" {A} , ,{B},"], [A, B]),
        ([f"{A},{A}", A.upper()], [A]),
        ([","], None),
    ])
    def test_accepts_repeated_and_comma_separated(self, raw, expected):
        assert parse_team_ids(raw) == expected

    @pytest.mark.parametrize("raw", [[f"{A},not-a-uuid"], ["1"], ["'; DROP TABLE teams;--"]])
    def test_rejects_anything_that_is_not_a_uuid(self, raw):
        with pytest.raises(HTTPException) as caught:
            parse_team_ids(raw)
        assert caught.value.status_code == 422

    def test_caps_how_many_teams_are_compared(self):
        many = ",".join(f"00000000-0000-0000-0000-{i:012d}" for i in range(MAX_COMPARED_TEAMS + 1))
        with pytest.raises(HTTPException) as caught:
            parse_team_ids([many])
        assert caught.value.status_code == 422


class TestCompareRoute:

    @pytest.fixture
    def compare(self, app, monkeypatch):
        from app.api.dependencies import get_current_user

        spy = AsyncMock(return_value=[])
        monkeypatch.setattr(TeamComparisonService, "compare_teams", spy)
        app.dependency_overrides[get_current_user] = lambda: {"id": "caller"}
        yield spy
        app.dependency_overrides.pop(get_current_user, None)

    @pytest.mark.parametrize("query", [f"team_ids={A},{B}", f"team_ids={A}&team_ids={B}"])
    def test_both_forms_reach_the_service_as_a_list(self, client, compare, query):
        response = client.get(f"{API}/executive/organizations/org-1/teams/compare?{query}")

        assert response.status_code == 200, response.text
        compare.assert_awaited_once()
        assert compare.await_args.args[-1] == [A, B]

    def test_no_ids_means_every_team(self, client, compare):
        assert client.get(f"{API}/executive/organizations/org-1/teams/compare").status_code == 200
        assert compare.await_args.args[-1] is None

    def test_a_bad_id_is_422(self, client, compare):
        response = client.get(f"{API}/executive/organizations/org-1/teams/compare?team_ids={A},nope")

        assert response.status_code == 422
        compare.assert_not_awaited()
