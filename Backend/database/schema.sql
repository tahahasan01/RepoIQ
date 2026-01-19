-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    github_username TEXT,
    github_access_token TEXT,
    github_connected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Repositories table
CREATE TABLE IF NOT EXISTS public.repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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
    last_analyzed TIMESTAMP WITH TIME ZONE,
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, github_repo_id)
);

-- Analysis results table
CREATE TABLE IF NOT EXISTS public.analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    overall_score INTEGER,
    security_score INTEGER,
    quality_score INTEGER,
    architecture_score INTEGER,
    documentation_score INTEGER,
    files_analyzed INTEGER DEFAULT 0,
    total_issues INTEGER DEFAULT 0,
    critical_issues INTEGER DEFAULT 0,
    high_issues INTEGER DEFAULT 0,
    medium_issues INTEGER DEFAULT 0,
    low_issues INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Issues table
CREATE TABLE IF NOT EXISTS public.issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.analysis_results(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('security', 'quality', 'architecture', 'documentation')),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    category TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    line_end INTEGER,
    code_snippet TEXT,
    description TEXT NOT NULL,
    suggestion TEXT,
    auto_fixable BOOLEAN DEFAULT FALSE,
    fixed BOOLEAN DEFAULT FALSE,
    fix_applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    context_files TEXT[],
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent execution logs
CREATE TABLE IF NOT EXISTS public.agent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES public.analysis_results(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    input_data JSONB,
    output_data JSONB,
    tokens_used INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Improvement roadmaps
CREATE TABLE IF NOT EXISTS public.improvement_roadmaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    priority_order TEXT[],
    quick_wins JSONB,
    medium_term JSONB,
    long_term JSONB,
    estimated_impact JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auto-fix history
CREATE TABLE IF NOT EXISTS public.auto_fix_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    original_code TEXT,
    fixed_code TEXT,
    commit_sha TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON public.repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_repositories_github_repo_id ON public.repositories(github_repo_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_repository_id ON public.analysis_results(repository_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_status ON public.analysis_results(status);
CREATE INDEX IF NOT EXISTS idx_issues_analysis_id ON public.issues(analysis_id);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON public.issues(severity);
CREATE INDEX IF NOT EXISTS idx_chat_messages_repository_id ON public.chat_messages(repository_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_analysis_id ON public.agent_logs(analysis_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON public.repositories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own data
CREATE POLICY users_policy ON public.users
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Users can only access their own repositories
CREATE POLICY repositories_policy ON public.repositories
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can only access analysis results for their repositories
CREATE POLICY analysis_results_policy ON public.analysis_results
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.repositories
            WHERE repositories.id = analysis_results.repository_id
            AND repositories.user_id = auth.uid()
        )
    );

-- Users can only access issues for their analyses
CREATE POLICY issues_policy ON public.issues
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.analysis_results
            JOIN public.repositories ON repositories.id = analysis_results.repository_id
            WHERE analysis_results.id = issues.analysis_id
            AND repositories.user_id = auth.uid()
        )
    );

-- Users can only access their own chat messages
CREATE POLICY chat_messages_policy ON public.chat_messages
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
