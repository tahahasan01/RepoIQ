-- When GitHub last saw activity on a repository.
--
-- The repository list is ordered most-recent-first. It ordered by updated_at,
-- which records when RepoIQ last wrote the row - and a sync rewrites every row
-- at once, so after a sync the order was effectively arbitrary. GitHub's own
-- timestamp is the one the user means.

ALTER TABLE public.repositories
    ADD COLUMN IF NOT EXISTS github_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_repos_user_github_updated
    ON public.repositories(user_id, github_updated_at DESC);
