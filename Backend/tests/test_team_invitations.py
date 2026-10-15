"""
Team membership requires the invited person's consent.

Membership is what makes two people colleagues, and colleagues see each other's
developer analytics and appear in each other's user search. Adding a member
used to write team_members directly, so anyone could create an organization,
"add" a stranger and read the stranger's data. These tests pin down that an
invitation grants nothing until the invitee - and only the invitee - accepts.

Against a real database: the guarantees here (one pending invitation per
person, exactly one membership per accept) live in constraints and
conditional UPDATEs, which a mock would only restate.
"""
import pytest

from tests.test_query_builder import db, requires_db, user  # noqa: F401  (fixtures)

from app.core.config import get_settings
from app.services.organization_service import OrganizationService
from app.services.team_service import (
    TEAM_MEMBER_USER_COLUMNS,
    TeamConflictError,
    TeamNotFoundError,
    TeamPermissionError,
    TeamService,
)

API = get_settings().api_prefix


def _user(db, name):  # noqa: F811
    return db.table("users").insert(
        {"email": f"{name}@example.com", "full_name": name.title(), "github_username": name}
    ).execute().data[0]


@pytest.fixture
def world(db, user):  # noqa: F811
    """
    alice (the `user` fixture) owns Acme with team Core. carol is already on
    Core as a plain member; dan manages it. bob and mallory are strangers.
    """
    org = db.table("organizations").insert({"name": "Acme", "owner_id": user["id"]}).execute().data[0]
    dan = _user(db, "dan")
    team = db.table("teams").insert(
        {"organization_id": org["id"], "name": "Core", "manager_id": dan["id"]}
    ).execute().data[0]
    carol = _user(db, "carol")
    db.table("team_members").insert({"team_id": team["id"], "user_id": carol["id"], "role": "member"}).execute()
    return {
        "alice": user, "bob": _user(db, "bob"), "carol": carol, "dan": dan,
        "mallory": _user(db, "mallory"), "org": org, "team": team,
    }


def _members(db, team_id):  # noqa: F811
    return db.table("team_members").select("user_id, role").eq("team_id", team_id).execute().data


def _status(db, invitation_id):  # noqa: F811
    return db.table("team_invitations").select("status").eq("id", invitation_id).single().execute().data["status"]


async def _invite(world, who="bob", by="alice", role="member"):
    return await TeamService().invite_team_member(
        world["team"]["id"], f"{who}@example.com", role=role, invited_by=world[by]["id"]
    )


@requires_db
class TestInvitingDoesNotGrantMembership:

    async def test_adding_a_member_creates_a_pending_invitation_not_a_membership(self, db, world):  # noqa: F811
        invitation = await _invite(world, role="lead")

        assert invitation["status"] == "pending"
        assert invitation["role"] == "lead"
        assert invitation["invited_user_id"] == world["bob"]["id"]
        assert invitation["invited_by"] == world["alice"]["id"]
        assert world["bob"]["id"] not in {m["user_id"] for m in _members(db, world["team"]["id"])}

    async def test_a_pending_invitation_does_not_make_colleagues(self, db, world):  # noqa: F811
        """The attack: invite a stranger, then read their data as a colleague."""
        await _invite(world)
        orgs = OrganizationService()

        assert world["bob"]["id"] not in await orgs.get_colleague_ids(world["alice"]["id"])
        assert world["alice"]["id"] not in await orgs.get_colleague_ids(world["bob"]["id"])
        assert await orgs.get_organization(world["org"]["id"], world["bob"]["id"]) is None

    async def test_the_invitation_is_audited(self, db, world):  # noqa: F811
        invitation = await _invite(world)

        logs = db.table("audit_logs").select("action, user_id, details_jsonb") \
            .eq("organization_id", world["org"]["id"]).eq("action", "team_invitation_created").execute().data
        assert len(logs) == 1
        assert logs[0]["user_id"] == world["alice"]["id"]
        assert logs[0]["details_jsonb"]["invitation_id"] == invitation["id"]


@requires_db
class TestWhoMayInvite:

    async def test_a_plain_member_cannot_invite(self, db, world):  # noqa: F811
        with pytest.raises(TeamPermissionError):
            await _invite(world, by="carol")
        assert db.table("team_invitations").select("id").eq("team_id", world["team"]["id"]).execute().data == []

    async def test_a_stranger_cannot_invite(self, world):
        with pytest.raises(TeamPermissionError):
            await _invite(world, by="mallory")

    async def test_the_team_manager_can_invite(self, world):
        assert (await _invite(world, by="dan"))["status"] == "pending"

    async def test_inviting_yourself_is_rejected(self, world):
        with pytest.raises(ValueError, match="yourself"):
            await _invite(world, who="dan", by="dan")

    async def test_inviting_an_existing_member_is_a_conflict(self, world):
        with pytest.raises(TeamConflictError, match="already a member"):
            await _invite(world, who="carol")

    async def test_a_second_pending_invitation_is_a_conflict(self, db, world):  # noqa: F811
        await _invite(world)
        with pytest.raises(TeamConflictError, match="pending invitation"):
            await _invite(world, by="dan")

        rows = db.table("team_invitations").select("id").eq("team_id", world["team"]["id"]).execute().data
        assert len(rows) == 1

    async def test_an_invalid_role_is_rejected(self, world):
        with pytest.raises(ValueError, match="Invalid role"):
            await _invite(world, role="owner")

    async def test_an_unknown_team_is_not_found(self, world):
        with pytest.raises(TeamNotFoundError):
            await TeamService().invite_team_member(
                "00000000-0000-0000-0000-000000000000", "bob@example.com", invited_by=world["alice"]["id"]
            )


@requires_db
class TestOnlyTheInviteeMayAnswer:

    async def test_the_invitee_sees_who_is_inviting_them_to_what(self, world):
        invitation = await _invite(world)

        mine = await TeamService().list_user_invitations(world["bob"]["id"])

        assert [i["id"] for i in mine] == [invitation["id"]]
        assert mine[0]["team"]["name"] == "Core"
        assert mine[0]["organization"] == {"id": world["org"]["id"], "name": "Acme"}
        assert mine[0]["inviter"]["full_name"] == "Alice"
        # Public profile columns only - never the inviter's email or tokens.
        allowed = {c.strip() for c in TEAM_MEMBER_USER_COLUMNS.split(",")}
        assert set(mine[0]["inviter"]) == allowed
        assert set(mine[0]["invitee"]) == allowed

    async def test_nobody_else_sees_the_invitation(self, world):
        await _invite(world)
        service = TeamService()

        assert await service.list_user_invitations(world["mallory"]["id"]) == []
        assert await service.list_user_invitations(world["alice"]["id"]) == []

    @pytest.mark.parametrize("actor", ["mallory", "alice", "carol"])
    async def test_nobody_but_the_invitee_can_accept(self, db, world, actor):  # noqa: F811
        invitation = await _invite(world)

        with pytest.raises(TeamNotFoundError):
            await TeamService().accept_invitation(invitation["id"], world[actor]["id"])

        assert _status(db, invitation["id"]) == "pending"
        assert world["bob"]["id"] not in {m["user_id"] for m in _members(db, world["team"]["id"])}

    async def test_nobody_but_the_invitee_can_decline(self, db, world):  # noqa: F811
        invitation = await _invite(world)

        with pytest.raises(TeamNotFoundError):
            await TeamService().decline_invitation(invitation["id"], world["mallory"]["id"])
        assert _status(db, invitation["id"]) == "pending"


@requires_db
class TestAccepting:

    async def test_accepting_creates_the_membership_exactly_once(self, db, world):  # noqa: F811
        invitation = await _invite(world, role="lead")
        service = TeamService()

        accepted = await service.accept_invitation(invitation["id"], world["bob"]["id"])
        with pytest.raises(TeamConflictError, match="already been accepted"):
            await service.accept_invitation(invitation["id"], world["bob"]["id"])

        assert accepted["status"] == "accepted"
        assert accepted["responded_at"]
        bob_rows = [m for m in _members(db, world["team"]["id"]) if m["user_id"] == world["bob"]["id"]]
        assert bob_rows == [{"user_id": world["bob"]["id"], "role": "lead"}]

    async def test_after_accepting_they_are_colleagues(self, world):
        invitation = await _invite(world)
        await TeamService().accept_invitation(invitation["id"], world["bob"]["id"])

        assert world["bob"]["id"] in await OrganizationService().get_colleague_ids(world["alice"]["id"])

    async def test_accepting_is_audited(self, db, world):  # noqa: F811
        invitation = await _invite(world)
        await TeamService().accept_invitation(invitation["id"], world["bob"]["id"])

        logs = db.table("audit_logs").select("user_id").eq("organization_id", world["org"]["id"]) \
            .eq("action", "team_invitation_accepted").execute().data
        assert [log["user_id"] for log in logs] == [world["bob"]["id"]]

    async def test_a_failed_membership_insert_leaves_the_invitation_pending(self, db, world):  # noqa: F811
        """No "accepted" invitation without a membership behind it."""
        invitation = await _invite(world)
        service = TeamService()

        def broken(*_):
            raise RuntimeError("database went away")

        service._insert_team_member = broken
        with pytest.raises(RuntimeError):
            await service.accept_invitation(invitation["id"], world["bob"]["id"])

        assert _status(db, invitation["id"]) == "pending"
        # ...so a retry works.
        await TeamService().accept_invitation(invitation["id"], world["bob"]["id"])
        assert world["bob"]["id"] in {m["user_id"] for m in _members(db, world["team"]["id"])}

    async def test_accepting_when_already_a_member_still_answers_the_invitation(self, db, world):  # noqa: F811
        invitation = await _invite(world)
        db.table("team_members").insert(
            {"team_id": world["team"]["id"], "user_id": world["bob"]["id"], "role": "member"}
        ).execute()

        accepted = await TeamService().accept_invitation(invitation["id"], world["bob"]["id"])

        assert accepted["status"] == "accepted"
        assert len([m for m in _members(db, world["team"]["id"]) if m["user_id"] == world["bob"]["id"]]) == 1


@requires_db
class TestDeclining:

    async def test_declining_creates_no_membership(self, db, world):  # noqa: F811
        invitation = await _invite(world)
        service = TeamService()

        declined = await service.decline_invitation(invitation["id"], world["bob"]["id"])

        assert declined["status"] == "declined"
        assert world["bob"]["id"] not in {m["user_id"] for m in _members(db, world["team"]["id"])}
        with pytest.raises(TeamConflictError):
            await service.accept_invitation(invitation["id"], world["bob"]["id"])
        assert await service.list_user_invitations(world["bob"]["id"]) == []

    async def test_a_declined_invitation_does_not_block_a_new_one(self, world):
        invitation = await _invite(world)
        await TeamService().decline_invitation(invitation["id"], world["bob"]["id"])

        assert (await _invite(world))["id"] != invitation["id"]


@requires_db
class TestRevoking:

    async def test_a_manager_can_revoke_and_the_invitee_can_no_longer_accept(self, db, world):  # noqa: F811
        invitation = await _invite(world)
        service = TeamService()

        revoked = await service.revoke_invitation(world["team"]["id"], invitation["id"], world["dan"]["id"])

        assert revoked["status"] == "revoked"
        with pytest.raises(TeamConflictError, match="revoked"):
            await service.accept_invitation(invitation["id"], world["bob"]["id"])
        assert world["bob"]["id"] not in {m["user_id"] for m in _members(db, world["team"]["id"])}

        logs = db.table("audit_logs").select("user_id").eq("organization_id", world["org"]["id"]) \
            .eq("action", "team_invitation_revoked").execute().data
        assert [log["user_id"] for log in logs] == [world["dan"]["id"]]

    @pytest.mark.parametrize("actor", ["carol", "mallory", "bob"])
    async def test_only_managers_can_revoke(self, db, world, actor):  # noqa: F811
        invitation = await _invite(world)

        with pytest.raises(TeamPermissionError):
            await TeamService().revoke_invitation(world["team"]["id"], invitation["id"], world[actor]["id"])
        assert _status(db, invitation["id"]) == "pending"

    async def test_revoking_through_another_team_is_not_found(self, db, world):  # noqa: F811
        """A manager of team B cannot revoke team A's invitation by naming B."""
        invitation = await _invite(world)
        other = db.table("teams").insert(
            {"organization_id": world["org"]["id"], "name": "Other", "manager_id": world["mallory"]["id"]}
        ).execute().data[0]

        with pytest.raises(TeamNotFoundError):
            await TeamService().revoke_invitation(other["id"], invitation["id"], world["mallory"]["id"])
        assert _status(db, invitation["id"]) == "pending"

    async def test_an_answered_invitation_cannot_be_revoked(self, world):
        invitation = await _invite(world)
        service = TeamService()
        await service.accept_invitation(invitation["id"], world["bob"]["id"])

        with pytest.raises(TeamConflictError):
            await service.revoke_invitation(world["team"]["id"], invitation["id"], world["alice"]["id"])

    async def test_managers_list_pending_invitations_and_members_cannot(self, world):
        invitation = await _invite(world)
        service = TeamService()

        listed = await service.list_team_invitations(world["team"]["id"], world["alice"]["id"])
        assert [i["id"] for i in listed] == [invitation["id"]]
        assert listed[0]["invitee"]["full_name"] == "Bob"

        with pytest.raises(TeamPermissionError):
            await service.list_team_invitations(world["team"]["id"], world["carol"]["id"])


@pytest.fixture
def as_user(app):
    """Authenticate requests as a given user record, for the HTTP tests."""
    from app.api.dependencies import get_current_user

    def _as(record):
        app.dependency_overrides[get_current_user] = lambda: record

    yield _as
    app.dependency_overrides.pop(get_current_user, None)


@requires_db
class TestHttp:
    """Status codes and shapes the frontend is built against."""

    def test_invite_accept_flow(self, client, as_user, db, world):  # noqa: F811
        team_id = world["team"]["id"]

        as_user(world["alice"])
        created = client.post(f"{API}/teams/{team_id}/members", json={"user_id": "bob@example.com"})
        assert created.status_code == 201, created.text
        body = created.json()
        assert body["status"] == "pending"
        assert body["invitation"]["invitee"]["id"] == world["bob"]["id"]
        invitation_id = body["invitation"]["id"]

        assert client.post(f"{API}/teams/{team_id}/members", json={"user_id": "bob@example.com"}).status_code == 409
        assert client.post(f"{API}/teams/{team_id}/members", json={"user_id": "carol@example.com"}).status_code == 409
        assert client.post(f"{API}/teams/{team_id}/members", json={"user_id": "alice@example.com"}).status_code == 400
        assert [i["id"] for i in client.get(f"{API}/teams/{team_id}/invitations").json()] == [invitation_id]

        # "/teams/invitations" must not be swallowed by "/teams/{team_id}".
        as_user(world["bob"])
        mine = client.get(f"{API}/teams/invitations")
        assert mine.status_code == 200, mine.text
        assert [i["id"] for i in mine.json()] == [invitation_id]

        as_user(world["mallory"])
        assert client.post(f"{API}/teams/invitations/{invitation_id}/accept").status_code == 404
        assert client.post(f"{API}/teams/invitations/{invitation_id}/decline").status_code == 404
        assert client.delete(f"{API}/teams/{team_id}/invitations/{invitation_id}").status_code == 403
        assert client.post(f"{API}/teams/{team_id}/members", json={"user_id": "bob@example.com"}).status_code == 403

        as_user(world["bob"])
        accepted = client.post(f"{API}/teams/invitations/{invitation_id}/accept")
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["invitation"]["status"] == "accepted"
        assert accepted.json()["membership"] == {"team_id": team_id, "user_id": world["bob"]["id"], "role": "member"}
        assert client.post(f"{API}/teams/invitations/{invitation_id}/accept").status_code == 409

    def test_decline_and_revoke(self, client, as_user, world):
        team_id = world["team"]["id"]

        as_user(world["alice"])
        first = client.post(f"{API}/teams/{team_id}/members", json={"user_id": "bob"}).json()["invitation"]["id"]
        as_user(world["bob"])
        declined = client.post(f"{API}/teams/invitations/{first}/decline")
        assert declined.status_code == 200 and declined.json()["invitation"]["status"] == "declined"

        as_user(world["dan"])
        second = client.post(f"{API}/teams/{team_id}/members", json={"user_id": "bob"}).json()["invitation"]["id"]
        revoked = client.delete(f"{API}/teams/{team_id}/invitations/{second}")
        assert revoked.status_code == 200 and revoked.json()["invitation"]["status"] == "revoked"
        assert client.delete(f"{API}/teams/{team_id}/invitations/{second}").status_code == 409

    def test_malformed_ids_are_422_not_500(self, client, as_user, world):
        as_user(world["bob"])
        assert client.post(f"{API}/teams/invitations/not-a-uuid/accept").status_code == 422
        assert client.get(f"{API}/teams/not-a-uuid/invitations").status_code == 422
