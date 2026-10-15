-- Team invitations, and persisted per-user notification preferences.
--
-- team_invitations
-- ----------------
-- An organization owner or team manager used to be able to add ANY user,
-- found by email or username, straight into team_members. Membership is what
-- makes two people colleagues (OrganizationService.get_colleague_ids), and
-- colleagues can see each other's developer analytics and find each other in
-- /users/search. So anyone could create an organization, "add" a stranger, and
-- read that stranger's data - with no action from the stranger at all.
--
-- Membership now requires the invited user to accept. An invitation grants
-- nothing on its own: nothing that decides visibility reads this table.
--
-- Rows are kept after a response (accepted / declined / revoked) as a record
-- of who invited whom; only one PENDING invitation may exist per person per
-- team, which the partial unique index enforces even under concurrent invites.

CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Same set as team_members.role: an accepted invitation becomes that row.
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','lead','manager')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','accepted','declined','revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- One pending invitation per (team, person). Also serves a team's
-- pending-invitation listing, which leads with team_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_invitations_one_pending
    ON team_invitations(team_id, invited_user_id)
    WHERE status = 'pending';

-- "My invitations", and the ON DELETE CASCADE when a user is deleted - which
-- must find every row, not only pending ones, so this is not partial.
CREATE INDEX IF NOT EXISTS idx_team_invitations_invited_user
    ON team_invitations(invited_user_id, status);

-- Deleting a team cascades through team_id (the unique index above covers
-- only pending rows), and deleting the inviter sets invited_by NULL; both
-- would otherwise scan the table.
CREATE INDEX IF NOT EXISTS idx_team_invitations_team
    ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_invited_by
    ON team_invitations(invited_by);

-- user_settings
-- -------------
-- The Settings page had notification toggles and an alert threshold held only
-- in browser state, so every choice was lost on reload and nothing on the
-- server could honour it. One row per user, created on first save; a user with
-- no row has the column defaults, which the application mirrors
-- (app/services/user_settings_service.py) so reads never need a write.
--
-- Typed columns rather than a JSONB blob: the alert checks read these, and a
-- CHECK constraint is the only validation that holds for every writer.

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
    alert_score_threshold INTEGER NOT NULL DEFAULT 60
        CHECK (alert_score_threshold BETWEEN 0 AND 100),
    auto_analyze_new_repos BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
