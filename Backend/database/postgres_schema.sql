-- RepoIQ schema for plain PostgreSQL.
--
-- Replaces database/schema.sql, which targeted Supabase and therefore:
--   - made users.id a FK to auth.users(id), a table only Supabase provides
--   - relied on Supabase Auth to hold credentials
--   - enabled RLS policies that referenced auth.uid()
--
-- On plain Postgres the application owns identity, so users.id is a plain UUID
-- and password_hash lives here. RLS is not enabled: the app connects as a single
-- role and enforces tenancy in the query layer, which is checked statically by
-- tests/test_tenant_isolation.py.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email

-- ---------------------------------------------------------------- users ----
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    -- bcrypt hash. NULL for accounts that only ever sign in with GitHub, which
    -- is why this is nullable rather than NOT NULL.
    password_hash TEXT,
    full_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    github_username TEXT UNIQUE,
    -- Encrypted at rest by the application (AES-256-GCM). Only used by the
    -- OAuth App path; NULL once migrated to the GitHub App.
    github_access_token TEXT,
    -- GitHub App path: access is a 1-hour token minted from this on demand,
    -- so nothing long-lived is stored.
    github_installation_id TEXT,
    github_connected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_github_username ON users(github_username)
    WHERE github_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_installation ON users(github_installation_id)
    WHERE github_installation_id IS NOT NULL;

-- --------------------------------------------------------- repositories ----
CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    github_repo_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    open_issues INTEGER DEFAULT 0,
    default_branch TEXT DEFAULT 'main',
    is_private BOOLEAN DEFAULT FALSE,
    size INTEGER DEFAULT 0,
    last_analyzed TIMESTAMPTZ,
    last_synced TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, github_repo_id)
);

-- The composite index the ownership check hits on nearly every request.
CREATE INDEX IF NOT EXISTS idx_repos_user_github ON repositories(user_id, github_repo_id);
CREATE INDEX IF NOT EXISTS idx_repos_user_updated ON repositories(user_id, updated_at DESC);

-- ------------------------------------------------------ analysis_results ----
CREATE TABLE IF NOT EXISTS analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    overall_score INTEGER,
    security_score INTEGER,
    quality_score INTEGER,
    architecture_score INTEGER,
    documentation_score INTEGER,
    total_issues INTEGER DEFAULT 0,
    critical_issues INTEGER DEFAULT 0,
    high_issues INTEGER DEFAULT 0,
    medium_issues INTEGER DEFAULT 0,
    low_issues INTEGER DEFAULT 0,
    -- Sample-size disclosure: the analysis reads at most ANALYSIS_MAX_FILES.
    files_analyzed INTEGER DEFAULT 0,
    files_eligible INTEGER DEFAULT 0,
    files_reused INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_repo_status_completed
    ON analysis_results(repository_id, status, completed_at DESC);

-- ---------------------------------------------------------------- issues ----
CREATE TABLE IF NOT EXISTS issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL
        CHECK (agent_type IN ('security','quality','architecture','documentation')),
    severity TEXT NOT NULL DEFAULT 'low',
    category TEXT,
    file_path TEXT,
    line_number INTEGER DEFAULT 1,
    description TEXT,
    suggestion TEXT,
    auto_fixable BOOLEAN DEFAULT FALSE,
    fixed BOOLEAN DEFAULT FALSE,
    fix_applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_analysis ON issues(analysis_id);
CREATE INDEX IF NOT EXISTS idx_issues_analysis_severity ON issues(analysis_id, severity);

-- --------------------------------------------------------- chat_messages ----
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_repo ON chat_messages(repository_id, created_at DESC);

-- --------------------------------------------- improvement_roadmaps -------
CREATE TABLE IF NOT EXISTS improvement_roadmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    priority_order JSONB DEFAULT '[]',
    quick_wins JSONB DEFAULT '[]',
    medium_term JSONB DEFAULT '[]',
    long_term JSONB DEFAULT '[]',
    estimated_impact JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------- webhooks ----
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events JSONB DEFAULT '["*"]',
    secret TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id) WHERE active;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    response_code INTEGER,
    delivered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------- organizations / teams ----
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free','pro','enterprise')),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','lead','manager')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS repository_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (repository_id, team_id)
);

-- ----------------------------------------------------- developer metrics ----
CREATE TABLE IF NOT EXISTS developer_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    commits_count INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    issues_introduced INTEGER DEFAULT 0,
    issues_fixed INTEGER DEFAULT 0,
    UNIQUE (user_id, repository_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS developer_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    metric_value NUMERIC,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS code_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ownership_percentage NUMERIC DEFAULT 0,
    lines_owned INTEGER DEFAULT 0,
    last_modified TIMESTAMPTZ,
    UNIQUE (repository_id, file_path, user_id)
);

CREATE TABLE IF NOT EXISTS issue_blame (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blame_type TEXT DEFAULT 'introduced',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details_jsonb JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    message TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
