# Migrating from an OAuth App to a GitHub App

**Status:** not done. This requires registering an application under your GitHub
account, which cannot be done from the codebase. Everything below is the plan and
the code-level impact.

## Why this is the outstanding security item

RepoIQ currently authenticates with a **GitHub OAuth App** and requests the `repo`
scope. That scope is not a choice — it is forced:

| Need | Minimum OAuth App scope |
|---|---|
| Read a **private** repository | `repo` — there is no read-only private scope |
| Open an auto-fix pull request | `repo` |

So every user's stored token can **read and write every repository they can
reach**, including ones RepoIQ has never been asked to look at. An earlier pass in
this remediation tried to narrow the scope to `read:user user:email` and that was
wrong — it would have broken private-repo analysis and auto-fix entirely (see the
Phase 4 record in `REMEDIATION_PLAN.md`).

What has already been done to contain that blast radius:

- tokens encrypted at rest under a key separate from `SECRET_KEY` (M-4)
- tokens never serialised into the Celery broker (H-10)
- tokens never returned in an API response (H-12)
- tokens never written to logs (`redact_sensitive`)

Those are mitigations. **A GitHub App is the actual fix**, because it changes what
the credential can do rather than how carefully it is handled.

## What a GitHub App gives you

| | OAuth App (today) | GitHub App |
|---|---|---|
| Scope granularity | All-or-nothing `repo` | Per-permission: `Contents: read`, `Pull requests: write` |
| Repository granularity | Every repo the user can reach | Only repos the user selects at install time |
| Credential lifetime | Long-lived user token | Installation token, expires in 1 hour |
| Revocation | User must revoke the whole app | Per-repository, from the GitHub UI |
| Rate limit | Shared 5,000/hr per user | 5,000/hr **per installation** — scales with customers |
| Attribution | Actions appear as the user | Actions appear as the app |

The rate-limit row matters at the scale you are planning for. Under an OAuth App,
every user shares their own 5,000/hr budget with every other tool they have
authorised. Under a GitHub App each installation gets its own budget, so
throughput scales with the number of customers instead of competing with them.

## Registration (you must do this)

1. **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Permissions — request only these:
   - Repository → **Contents: Read-only** (reading files to analyse)
   - Repository → **Metadata: Read-only** (mandatory)
   - Repository → **Pull requests: Read and write** (auto-fix only)
   - Account → **Email addresses: Read-only** (sign-in)
3. **Where can this app be installed:** Any account
4. **Callback URL:** same value as `GITHUB_REDIRECT_URI`
5. Enable **Request user authorization (OAuth) during installation** so install
   and sign-in are one flow.
6. Generate a **private key** (.pem) and note the **App ID**.

## Code impact

The token-resolution boundary was deliberately isolated during this remediation,
so the change is contained:

- `app/services/github_token.py` — `resolve_github_token_for_user()` is the single
  place that produces a token. A GitHub App version mints a short-lived
  installation token here instead of decrypting a stored one, and caches it for
  slightly under its one-hour lifetime.
- `app/services/github_service.py` — `GitHubService(access_token)` already takes a
  token as a constructor argument. Unchanged.
- `app/api/routes/auth.py` — the authorize URL becomes the app's install URL. The
  `state` nonce flow (`app/services/oauth_state.py`) carries over unchanged.
- New: a table mapping `user_id`/`org` to `installation_id`.
- New: `installation_repositories` handling, so the app knows which repositories
  it was actually granted.

Config already anticipates this: `GITHUB_OAUTH_SCOPES` exists precisely so the
OAuth path can be retired without touching call sites.

## Suggested sequencing

1. Register the app, add `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` settings.
2. Implement installation-token minting behind a feature flag, defaulting off.
3. Support both paths at once: existing users keep their OAuth token, new users
   install the app.
4. Prompt existing users to migrate.
5. Remove the OAuth path and delete every stored `github_access_token`.

Step 5 is the one that actually retires the risk — until stored long-lived tokens
are deleted, they remain a target regardless of what new users get.
