-- Indexes the PostgreSQL baseline lost when it was written from scratch.
--
-- The Supabase-era migrations (001, 002) created these; postgres_schema.sql
-- did not carry them over. Without them, listing a user's teams or
-- organizations scans the whole table, and every cascading or SET NULL delete
-- (removing a user, a team, an issue) scans each referencing table.
--
-- Left out deliberately: indexes whose columns already lead a UNIQUE
-- constraint (team_members(team_id), repository_assignments(repository_id),
-- code_ownership(repository_id[, file_path]), developer_contributions(user_id),
-- teams(organization_id), audit_logs(organization_id)) - those are covered.

-- Lookups the application runs.
CREATE INDEX IF NOT EXISTS idx_analysis_repo_created
    ON public.analysis_results(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_analysis_file
    ON public.issues(analysis_id, file_path);
CREATE INDEX IF NOT EXISTS idx_roadmaps_repo_created
    ON public.improvement_roadmaps(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizations_owner
    ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user
    ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_repository_assignments_team
    ON public.repository_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_developer_contributions_repo
    ON public.developer_contributions(repository_id);

-- Foreign keys whose referenced row can be deleted.
CREATE INDEX IF NOT EXISTS idx_teams_manager
    ON public.teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_code_ownership_user
    ON public.code_ownership(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_blame_issue
    ON public.issue_blame(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_blame_user
    ON public.issue_blame(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_repository
    ON public.audit_logs(repository_id);
