-- Auto-fix waits for a person before anything reaches GitHub.
--
-- A proposal is model output built from the repository's own content, which
-- anyone with write access could have planted instructions in. Pushing a
-- branch runs CI with the repository's secrets, and no list of "files CI
-- executes" is complete - any source file a test imports runs in CI. So a
-- run now stops at 'ready' with its proposals and their diffs, and pushes
-- only when the user approves what they have seen ('publishing').
--
-- base_sha: the commit the proposals were built from. Publishing branches
-- from it, never from a newer head, so a proposal cannot overwrite changes it
-- never saw.

ALTER TABLE public.autofix_runs
    ADD COLUMN IF NOT EXISTS proposals JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.autofix_runs
    ADD COLUMN IF NOT EXISTS base_sha TEXT;

ALTER TABLE public.autofix_runs DROP CONSTRAINT IF EXISTS autofix_runs_status_check;
ALTER TABLE public.autofix_runs ADD CONSTRAINT autofix_runs_status_check CHECK (
    status IN ('pending', 'running', 'ready', 'publishing', 'completed', 'failed', 'discarded')
);
