# Migrating from an OAuth App to a GitHub App

**Status: the app is registered and the code is built and tested.** What remains
is generating the two secrets (private key, client secret) and flipping the flag —
see "What you still need to do" below.

Everything is behind `GITHUB_AUTH_MODE`, which defaults to `oauth`. Nothing changes
until you flip it, and flipping it back is a one-line revert.

Already implemented:

| Piece | Where |
|---|---|
| App JWT signing (RS256), installation-token minting and caching | `app/services/github_app.py` |
| Token resolution routed through the app when enabled | `app/services/github_token.py` |
| Install URL served from the login endpoint | `app/api/routes/auth.py` |
| `users.github_installation_id` column | `database/migrations/003_github_app_installations.sql` |
| Config | `GITHUB_AUTH_MODE`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` |
| Tests | `tests/test_github_app.py` — 26 tests |

The PEM is accepted either as a literal key or with escaped newlines, because
Railway, Vercel and Docker env vars cannot hold real newlines — a pasted PEM
arrives as one line and would otherwise fail at first login with an unhelpful
parse error.

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

## The app is registered

Created 2026-08-21 under the personal account **@tahahasan01**.

| | |
|---|---|
| Name | RepoIQ Code Intelligence |
| Slug | `repoiq-code-intelligence` |
| App ID | `4673401` |
| Client ID | `Iv23liI2R5feYNQ42ohU` |
| Install page | https://github.com/apps/repoiq-code-intelligence |
| Settings | https://github.com/settings/apps/repoiq-code-intelligence |

None of the above is secret — App ID and Client ID appear in URLs and JWT claims.
The two secrets, **the private key and the client secret, have not been generated
yet**; see "What you still need to do".

Permissions granted (nothing else):

| Permission | Level | Why |
|---|---|---|
| Repository → Contents | Read-only | Reading files to analyse |
| Repository → Metadata | Read-only | Mandatory, granted automatically |
| Repository → Pull requests | Read and write | Auto-fix opens PRs |
| Account → Email addresses | Read-only | Sign-in identity |

Other settings:

- **Any account** — installable by your users, not just you.
- **Request user authorization (OAuth) during installation** — enabled, so
  install and sign-in are one flow. The code depends on this.
- **Expire user authorization tokens** — enabled. User tokens are short-lived.
- **Webhook** — disabled. RepoIQ does not consume GitHub webhooks; its own
  webhook feature is outbound to user-supplied endpoints, which is unrelated.
- **Callback URL** — `http://localhost:8080/auth/github/callback`. Add the
  production URL under "Identifying and authorizing users" before deploying.

## What you still need to do

1. **Generate the private key.**
   https://github.com/settings/apps/repoiq-code-intelligence#private-key →
   *Generate a private key*. GitHub downloads a `.pem` **once**. Put it straight
   into your secret store as `GITHUB_APP_PRIVATE_KEY` and delete the downloaded
   file. Escaped newlines are supported, so pasting it as a single line is fine.

2. **Generate a client secret.** Same settings page → *Generate a new client
   secret* → `GITHUB_APP_CLIENT_SECRET`. This is what exchanges the
   user-authorization code at sign-in.

3. **Run the migration**:
   `database/migrations/003_github_app_installations.sql`.

4. **Set the env vars** (staging first):

   ```
   GITHUB_AUTH_MODE=app
   GITHUB_APP_ID=4673401
   GITHUB_APP_SLUG=repoiq-code-intelligence
   GITHUB_APP_CLIENT_ID=Iv23liI2R5feYNQ42ohU
   GITHUB_APP_CLIENT_SECRET=<from step 2>
   GITHUB_APP_PRIVATE_KEY=<from step 1>
   ```

5. **Install it on your own account** from the install page and verify a login
   end to end before exposing it to users.

## Original registration steps (for reference)

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

## Rollout

Step 2 is done. The rest:

1. **Register the app** (above) and note the App ID, slug and private key.
2. ~~Implement installation-token minting behind a feature flag~~ — **done**,
   `GITHUB_AUTH_MODE` defaults to `oauth`.
3. **Run the migration**: `database/migrations/003_github_app_installations.sql`
   (adds a nullable column; safe to run while still on the OAuth path).
4. **Set the secrets** and flip `GITHUB_AUTH_MODE=app` in a staging environment
   first:

   ```
   GITHUB_AUTH_MODE=app
   GITHUB_APP_ID=123456
   GITHUB_APP_SLUG=your-app-slug
   GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----
   ```

   The `\n` sequences are intentional and supported — most secret stores cannot
   hold real newlines in a value.

5. **Run both paths together.** Existing users keep working on their stored OAuth
   token; new users install the app. `resolve_github_token_for_user()` already
   handles a user with an installation and a user without.
6. **Prompt existing users to migrate.** A user with no
   `github_installation_id` gets an actionable error telling them to install,
   rather than an opaque failure.
7. **Destroy the stored tokens.** The commented-out UPDATE at the bottom of the
   migration file.

**Step 7 is the one that actually retires the risk.** Until the stored long-lived
`repo`-scoped tokens are deleted, they remain a target regardless of what new
users get. Do not skip it because the new path already works.

## Rolling back

Set `GITHUB_AUTH_MODE=oauth`. Nothing else needs reverting — as long as step 7
has not run.
