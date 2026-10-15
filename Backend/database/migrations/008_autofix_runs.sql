-- One row per auto-fix request: what was asked for, what happened, and the
-- pull request it produced.
--
-- Auto-fix used to be fire-and-forget: the route queued a Celery task and
-- answered "check the repository for a new pull request", with no record of
-- the attempt, no way to tell success from failure, and nothing for the UI to
-- show. Issues are NOT marked fixed here - a pull request is a proposal. They
-- are marked fixed when a later analysis no longer reports them.

CREATE TABLE IF NOT EXISTS public.autofix_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES public.analysis_results(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    issue_ids JSONB NOT NULL DEFAULT '[]',
    -- Issues a committed change claims to address.
    fixed_issue_ids JSONB NOT NULL DEFAULT '[]',
    -- [{"issue_id" | "file_path", "reason"}] for everything not changed.
    skipped JSONB NOT NULL DEFAULT '[]',
    branch TEXT,
    pr_number INTEGER,
    pr_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autofix_runs_repo_created
    ON public.autofix_runs(repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autofix_runs_user
    ON public.autofix_runs(user_id);
