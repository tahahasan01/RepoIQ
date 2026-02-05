-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team members table
CREATE TABLE IF NOT EXISTS public.team_members (
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'lead', 'manager')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- Repository assignments table
CREATE TABLE IF NOT EXISTS public.repository_assignments (
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    PRIMARY KEY (repository_id, team_id)
);

-- Developer contributions table
CREATE TABLE IF NOT EXISTS public.developer_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    commits_count INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    issues_introduced INTEGER DEFAULT 0,
    issues_fixed INTEGER DEFAULT 0,
    files_changed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, repository_id, period_start, period_end)
);

-- Developer metrics table
CREATE TABLE IF NOT EXISTS public.developer_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    metrics_jsonb JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, repository_id, period_start, period_end)
);

-- Code ownership table
CREATE TABLE IF NOT EXISTS public.code_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    ownership_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
    lines_owned INTEGER DEFAULT 0,
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(repository_id, file_path, user_id)
);

-- Issue blame tracking table
CREATE TABLE IF NOT EXISTS public.issue_blame (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    commit_sha TEXT,
    blame_type TEXT NOT NULL CHECK (blame_type IN ('introduced', 'modified', 'last_touched')),
    confidence_score DECIMAL(5,2) DEFAULT 0.00 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    repository_id UUID REFERENCES public.repositories(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details_jsonb JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON public.teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_manager_id ON public.teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_repository_assignments_repository_id ON public.repository_assignments(repository_id);
CREATE INDEX IF NOT EXISTS idx_repository_assignments_team_id ON public.repository_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_developer_contributions_user_id ON public.developer_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_developer_contributions_repository_id ON public.developer_contributions(repository_id);
CREATE INDEX IF NOT EXISTS idx_developer_contributions_period ON public.developer_contributions(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_developer_metrics_user_id ON public.developer_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_developer_metrics_repository_id ON public.developer_metrics(repository_id);
CREATE INDEX IF NOT EXISTS idx_code_ownership_repository_id ON public.code_ownership(repository_id);
CREATE INDEX IF NOT EXISTS idx_code_ownership_file_path ON public.code_ownership(repository_id, file_path);
CREATE INDEX IF NOT EXISTS idx_code_ownership_user_id ON public.code_ownership(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_blame_issue_id ON public.issue_blame(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_blame_user_id ON public.issue_blame(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_repository_id ON public.audit_logs(repository_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Apply updated_at trigger to new tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_developer_contributions_updated_at BEFORE UPDATE ON public.developer_contributions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_developer_metrics_updated_at BEFORE UPDATE ON public.developer_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_ownership_updated_at BEFORE UPDATE ON public.code_ownership
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_blame ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can access organizations they own or are members of
CREATE POLICY organizations_policy ON public.organizations
    FOR ALL
    USING (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.team_members tm
            JOIN public.teams t ON t.id = tm.team_id
            WHERE t.organization_id = organizations.id
            AND tm.user_id = auth.uid()
        )
    );

-- Teams: Users can access teams in organizations they belong to
CREATE POLICY teams_policy ON public.teams
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = teams.organization_id
            AND (o.owner_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM public.team_members tm
                     WHERE tm.team_id = teams.id
                     AND tm.user_id = auth.uid()
                 ))
        )
    );

-- Team members: Users can view team members of teams they belong to
CREATE POLICY team_members_policy ON public.team_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            JOIN public.organizations o ON o.id = t.organization_id
            WHERE t.id = team_members.team_id
            AND (o.owner_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM public.team_members tm
                     WHERE tm.team_id = t.id
                     AND tm.user_id = auth.uid()
                 ))
        )
    );

-- Repository assignments: Users can view assignments for repos they have access to
CREATE POLICY repository_assignments_policy ON public.repository_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.repositories r
            WHERE r.id = repository_assignments.repository_id
            AND (r.user_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM public.team_members tm
                     WHERE tm.team_id = repository_assignments.team_id
                     AND tm.user_id = auth.uid()
                 ))
        )
    );

-- Developer contributions: Users can view their own contributions or contributions in repos they have access to
CREATE POLICY developer_contributions_policy ON public.developer_contributions
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.repositories r
            WHERE r.id = developer_contributions.repository_id
            AND r.user_id = auth.uid()
        )
    );

-- Developer metrics: Same as contributions
CREATE POLICY developer_metrics_policy ON public.developer_metrics
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.repositories r
            WHERE r.id = developer_metrics.repository_id
            AND r.user_id = auth.uid()
        )
    );

-- Code ownership: Users can view ownership for repos they have access to
CREATE POLICY code_ownership_policy ON public.code_ownership
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.repositories r
            WHERE r.id = code_ownership.repository_id
            AND r.user_id = auth.uid()
        )
    );

-- Issue blame: Users can view blame for issues they have access to
CREATE POLICY issue_blame_policy ON public.issue_blame
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.issues i
            JOIN public.analysis_results ar ON ar.id = i.analysis_id
            JOIN public.repositories r ON r.id = ar.repository_id
            WHERE i.id = issue_blame.issue_id
            AND r.user_id = auth.uid()
        )
    );

-- Audit logs: Users can view audit logs for organizations they belong to
CREATE POLICY audit_logs_policy ON public.audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = audit_logs.organization_id
            AND (o.owner_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM public.team_members tm
                     JOIN public.teams t ON t.id = tm.team_id
                     WHERE t.organization_id = o.id
                     AND tm.user_id = auth.uid()
                 ))
        )
    );
