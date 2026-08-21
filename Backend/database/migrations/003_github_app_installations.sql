-- GitHub App support.
--
-- Under the OAuth App path, repository access comes from users.github_access_token:
-- a long-lived token with `repo` scope (read AND write to every repository the
-- user can reach) stored encrypted at rest.
--
-- Under the GitHub App path, access comes from an installation token minted on
-- demand from the app's private key and valid for one hour. Nothing long-lived
-- is stored - only which installation belongs to which user.
--
-- Safe to run before switching GITHUB_AUTH_MODE to "app": the column is
-- nullable and unused while the OAuth path is active.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS github_installation_id TEXT;

-- Looked up on every token resolution in app mode.
CREATE INDEX IF NOT EXISTS idx_users_github_installation
    ON public.users(github_installation_id)
    WHERE github_installation_id IS NOT NULL;

COMMENT ON COLUMN public.users.github_installation_id IS
    'GitHub App installation id. Access tokens are minted from this on demand '
    'and expire after one hour; unlike github_access_token nothing sensitive is '
    'stored here. Null while GITHUB_AUTH_MODE=oauth.';

-- ---------------------------------------------------------------------------
-- After the migration to GitHub App is complete, the stored long-lived OAuth
-- tokens are the remaining risk and should be destroyed. Run this ONLY once
-- every active user has installed the app - it is not reversible and users
-- without an installation will have to reconnect.
--
--   UPDATE public.users
--      SET github_access_token = NULL
--    WHERE github_installation_id IS NOT NULL;
--
-- Verify none remain:
--
--   SELECT count(*) FROM public.users WHERE github_access_token IS NOT NULL;
-- ---------------------------------------------------------------------------
