# RepoIQ — Production Readiness Audit

**Date:** 2026-08-21
**Branch audited:** `hardening/phase-1-4` (working tree, incl. uncommitted `config.py` changes)
**Scope:** Full stack — `Backend/` (FastAPI + Supabase + Redis + Celery + OpenAI agents), `Frontend/` (Vite + React + TS), CI, deployment config, DB migrations.
**Method:** Manual code review of every backend route, service, middleware, agent and task; frontend auth/data layer; CI and deploy manifests.

> **No prior audit document existed.** `FINAL_FIX_SUMMARY.md` is a changelog of past fixes, not an audit. This file is the first one.

---

## Verdict

**Not production-ready as it stands.** The codebase is feature-rich and the intent behind most of it is sound, but there are **6 critical** and **14 high** severity defects, several of which allow one tenant to read or modify another tenant's data, and one of which can change the wrong user's password. Separately, the response-middleware stack silently corrupts API payloads and the "caching" layer it advertises is largely inert — which is the most likely root cause of the slowness and the stale/odd UI behaviour you're seeing.

| Severity | Count | Theme |
|---|---|---|
| **Critical** | 6 | Cross-tenant data access, wrong-user password change, unauthenticated admin endpoints |
| **High** | 14 | Broken auth invalidation, rate-limit bypass, SSRF, response corruption, event-loop blocking |
| **Medium** | 17 | Token handling, cache correctness, error leakage, stale data, missing guards |
| **Low / Hygiene** | 12 | Dead code, duplicate entrypoints, fake-green CI, docs drift |

---

# CRITICAL

### C-1. `PUT /users/me/password` can change a *different* user's password
`Backend/app/services/auth_service.py:408`, `Backend/app/db/supabase.py:12-20`, `Backend/app/api/routes/users.py:74`

Two defects compound:

1. `current_password` is accepted and then **never verified**. The parameter is unused.
2. The call is `self.db.auth.update_user({"password": new_password})`, where `self.db` is `Database.get_client()` — a **process-wide singleton** anon client. Supabase's client carries the session of whoever last called `sign_in_with_password()` on that same object.

So on a worker that has served any `/auth/login`, a password change request from user B mutates the credentials of whichever user most recently logged in on that process. It also means the change silently no-ops (or errors into `False`) when no session is attached, which is why this has probably not been noticed.

**Fix:** Verify the current password explicitly, and perform the update with the service-role client scoped to `user_id` (`service_db.auth.admin.update_user_by_id(...)`). Never mutate auth state through a shared anon client.

---

### C-2. Any team member can read any repository in the database
`Backend/app/services/team_service.py:301-350` (`assign_repository_to_team`), `:352-370` (`get_team_repositories`)

The "access check" on assignment is:

```python
repo = self.db.table("repositories").select("*").eq("id", repository_id).single().execute().data
if repo["user_id"] != assigned_by:
    member_check = ... team_members where team_id=team_id and user_id=assigned_by
    if not member_check.data: return False
```

The fallback branch checks membership **of the team the caller chose**, not any relationship to the repository. Any authenticated user who belongs to a team can `POST /teams/{their_team}/repositories/{any_repo_uuid}` and then `GET /teams/{their_team}/repositories`, which returns `repositories.*` — including private repo names, full names, descriptions and languages belonging to unrelated tenants.

**Fix:** the only acceptable check is `repo["user_id"] == assigned_by` (or the repo already belongs to the org). Delete the membership fallback.

---

### C-3. Any team member can escalate roles and remove anyone
`Backend/app/services/team_service.py:207-262` (`add_team_member`), `:263-283` (`remove_team_member`)

Both authorise with `get_team(team_id, actor)`, and `get_team` → `OrganizationService.get_organization` returns the org for **the owner or any member of any team in that org** (`organization_service.py:34-56`). There is no role check anywhere. Therefore any member of any team can:

- add arbitrary platform users to any team in the org,
- set their `role` to anything (`"admin"`, `"manager"` — the value is unvalidated free text from the request body),
- remove any member, including the org owner's team memberships.

**Fix:** introduce an explicit role gate (org owner or team manager) before mutation, and constrain `role` to an enum.

---

### C-4. `GET /teams/{id}/members` returns every member's full user row
`Backend/app/services/team_service.py:295`

```python
self.db.table("team_members").select("*, users(*)")
```

`users(*)` returns **all** columns of the joined user, which per `database/schema.sql` includes `github_access_token` (the encrypted GitHub OAuth token), `email`, and `bio`. Any team member receives this for every other member. Combined with C-3 (anyone can join themselves to a team), this is a broad credential-material and PII disclosure.

**Fix:** enumerate columns explicitly — `users(id, full_name, avatar_url, github_username)`.

---

### C-5. Unauthenticated admin endpoints: cache flush, metrics, Redis DoS
`Backend/main.py:222` (`GET /metrics`), `:242` (`GET /api/v1/cache/stats`), `:279` (`DELETE /api/v1/cache/invalidate/{pattern}`)

None of the three has an authentication dependency. The invalidate endpoint passes the caller's pattern straight to `RedisService.invalidate()` (`redis_service.py:190`), which does `client.keys(pattern)`:

- `DELETE /api/v1/cache/invalidate/*` — wipes the entire Redis cache for every tenant, unauthenticated.
- `KEYS *` is O(N) and **blocks the Redis event loop**; repeated calls are a trivial denial-of-service against every cache-dependent path.
- `/metrics` leaks OpenAI token spend and cache internals; `/health` (`main.py:145`) returns raw exception strings from Redis and Supabase, which typically embed hostnames.

The `RateLimitMiddleware` explicitly *skips* `/metrics` (`rate_limiter.py:296`), so it isn't even rate-limited.

`ADMIN_API_KEY` was added to `config.py:44` on this branch **but is not referenced anywhere** — the intended guard was never wired up.

**Fix:** require an admin dependency on all three; replace `KEYS` with `SCAN`; reject `*` as a pattern; drop raw error strings from `/health`.

---

### C-6. `Cache-Control: public` on authenticated, per-user API responses
`Backend/app/middleware/cache_middleware.py:141`

```python
"Cache-Control": f"public, max-age={ttl}"
```

Applied to every cacheable GET, including `/api/v1/analysis/repositories/{id}/results` with `max-age=3600`. `public` explicitly authorises **shared** caches — Railway's edge, any CDN or corporate proxy in front of the app — to store one user's private analysis output and serve it to the next requester of the same URL.

Compounding it, the per-user component of the cache key is `hashlib.md5(auth_header)[:8]` (`cache_middleware.py:55`) — **32 bits**. At a few tens of thousands of active tokens, birthday collisions become probable, and a collision serves one user's cached response to another.

**Fix:** `Cache-Control: private, no-store` for authenticated responses; use the full digest (or the `sub` claim) in the key.

---

# HIGH

### H-1. Logout does nothing — token blacklisting is broken twice over
`Backend/app/api/routes/auth.py:196`

```python
redis_service.redis_client.setex(...)
```

`RedisService` has no `redis_client` attribute (it's `.client`, `redis_service.py:28`). This raises `AttributeError`, which the surrounding `except` swallows with a warning. Even if the attribute name were fixed, **nothing ever reads `auth:invalidated:{user_id}`** — `get_current_user` (`dependencies.py:66`) only validates the JWT signature. Access tokens remain valid for a full hour after logout, refresh tokens for 7 days, with no revocation path at all.

**Fix:** check the invalidation timestamp against the token `iat` inside `get_current_user`, and add `iat` to issued tokens.

---

### H-2. Rate limiting is bypassable with one header, and fails open
`Backend/app/middleware/rate_limiter.py:282`, `:175`, `Backend/main.py:63-82`

Three independent defects:

1. **`X-Forwarded-For` is trusted unconditionally.** Any client can send a fresh `X-Forwarded-For: <random ip>` per request and get a brand-new bucket every time — the limiter is entirely defeated. `TRUSTED_PROXY_COUNT` was added to `config.py:47` on this branch but is **never used**.
2. **`TokenBucket.consume` fails open.** Its `except` returns `(True, ...)` (`rate_limiter.py:175-178`). Because it never raises, the middleware's carefully written in-memory fallback (`:314-318`) is unreachable. A Redis outage means *no* rate limiting, contradicting the module docstring.
3. **The middleware isn't installed at all if Redis is down at boot.** `main.py:63` only calls `add_middleware` inside a `try` that pings Redis first. Boot during a Redis blip → the process runs its whole life with zero rate limiting.

Also: `request.state.user` (`:277`) is never set by anything, so the per-user tier is dead code — every limit is IP-based.

---

### H-3. SSRF via user-registered webhooks, triggerable on demand
`Backend/app/api/routes/webhooks.py:23,70,148`, `Backend/app/services/webhook_service.py:105`

`WebhookCreateRequest.url` is a bare `HttpUrl` with no host validation. A user can register `http://169.254.169.254/latest/meta-data/iam/security-credentials/`, `http://localhost:8000/api/v1/cache/invalidate/*`, or any RFC1918 address, then call `POST /webhooks/{id}/test` to make the server issue that request. `http://` is permitted alongside `https`.

Secondary: `send_webhook` retries with `await asyncio.sleep(delay)` over `[5, 30, 300]` (`webhook_service.py:31`) **inside the request handler** for `/test` — a single call can hold a connection for ~5½ minutes. That is a cheap connection-exhaustion vector.

**Fix:** resolve the hostname and reject loopback/link-local/private/multicast/reserved ranges (re-check post-DNS to avoid rebinding), require `https`, and move `/test` delivery off the request path with no retry.

---

### H-4. `GET /users/search` exposes every user's email address
`Backend/app/api/routes/users.py:112`

Authenticated, but unrestricted: `ilike("email", f"%{query}%")` across the whole `users` table, and the response explicitly includes `email`. `?query=@` returns other tenants' email addresses, 10 at a time, with no relationship requirement. `%` and `_` in `query` are not escaped, so they act as wildcards.

The same wildcard-injection and cross-tenant lookup exists in `team_service.find_user_by_identifier` (`:140-205`), which additionally **logs a sample of five real users' emails and names at INFO level** whenever a lookup misses (`:197`).

**Fix:** scope search to users sharing an org; drop `email` from the payload; escape `%`/`_`; delete the debug log.

---

### H-5. `JSONOptimizationMiddleware` silently corrupts every response
`Backend/main.py:85-90`, `Backend/app/middleware/compression.py:118-210`

Installed globally with `remove_nulls=True, max_array_length=100, max_string_length=10000`:

- **Null keys are deleted from every response.** `overall_score: null`, `completed_at: null`, `error_message: null`, `lastScan: null`, `score: null` don't arrive as `null` — the keys are *absent*. Any frontend code doing `data.overall_score ?? 0`, `'error_message' in data`, or destructuring with defaults changes behaviour silently.
- **Arrays over 100 items are truncated and a string is appended** (`compression.py:170`): `[...100 objects, "... and 4213 more items"]`. `/github/repositories/{id}/files` and issue lists become both incomplete *and* type-heterogeneous — a string where the client expects an object.
- **Strings over 10 000 chars are truncated with `"..."`** — the file-content endpoint returns silently mangled source code, which is then fed to the analysis agents.

This is almost certainly behind a family of "weird UI bugs" that look unrelated.

**Fix:** remove this middleware. Pagination and field selection belong in the route layer, not a blanket response rewriter.

---

### H-6. The response cache never actually caches (and the whole stack triple-parses every response)
`Backend/main.py:85-108`

Starlette applies middleware in reverse registration order, so the real chain is:

```
ResponseCache → Compression → JSONOptimization → RateLimit → app
```

`ResponseCacheMiddleware` therefore reads an **already gzipped** body, `json.loads` fails with `UnicodeDecodeError`, and it falls into the "skipped caching non-JSON response" branch (`cache_middleware.py:145`). The advertised response cache is inert for every response large enough to be compressed — i.e. all the ones worth caching.

Meanwhile every single response is: fully buffered → JSON-parsed → re-serialised → buffered again → gzipped → buffered again → re-wrapped. Three `BaseHTTPMiddleware` layers each consume `body_iterator`, which also **breaks streaming responses entirely**.

**This is a primary cause of the app feeling slow.** See the Performance section.

---

### H-7. Async endpoints block the event loop on every DB and GitHub call
Throughout `Backend/app/services/`

Every service method is `async def` but performs **synchronous** I/O: `supabase-py` is a sync client, `PyGithub` is sync, `httpx.get()` is called synchronously (`github_service.py:249`), `openai` is used via the sync client (`base_agent.py:35`). None of it is wrapped in `run_in_executor`/`to_thread` outside a couple of spots in `analysis_tasks.py`.

Worse, several paths `time.sleep()` on the event loop:
- `auth_service._retry_db_operation` (`:38`) — up to 3 s per retry, inside the OAuth handler.
- `github_service.retry_with_backoff` (`:31`) — up to 7 s.
- `auth_service.github_oauth` calls `socket.gethostbyname()` twice (`:137`, `:148`) — blocking DNS on the event loop.

With `WORKERS: int = 4` and a single event loop per worker, one slow GitHub call stalls **every** concurrent request on that worker. This is the second primary cause of the slowness.

---

### H-8. Every service constructs a brand-new Supabase client per request
`Backend/app/db/supabase.py:22-24`

```python
@classmethod
def get_service_client(cls) -> Client:
    return create_client(...)   # no caching, unlike get_client
```

`get_service_db()` is called from 15 call sites, and `RepositoryService()`, `AuthService()`, `TeamService()`, `OrganizationService()` etc. are instantiated **per request** inside route handlers. Each instantiation builds a fresh client with its own httpx connection pool and TLS setup, none of which is ever closed. This is both a latency tax on every request and a steady file-descriptor leak.

**Fix:** cache the service client the same way `get_client` does, and inject services as FastAPI dependencies.

---

### H-9. Long-running analysis rides on `BackgroundTasks`, with per-process in-memory state
`Backend/app/api/routes/analysis.py:11,74`, `Backend/app/tasks/analysis_tasks.py:19`

Celery exists and is configured (`core/celery_app.py`), and `auto_fix_issues_task.delay()` uses it — but the main analysis path uses `BackgroundTasks`, running a ≤10-minute job **in the API process**. Consequences:

- Any deploy, restart or crash silently orphans in-flight analyses in `in_progress` forever.
- It competes with request serving on the same event loop (see H-7).
- `_running_analyses` (`analysis.py:11`) and `_cancelled_analyses` (`analysis_tasks.py:19`) are module-level, so with `WORKERS=4` or more than one instance, **cancellation only works if the cancel request lands on the same process**. `_running_analyses` is also never cleaned on completion — an unbounded dict.

---

### H-10. GitHub tokens are handed to Celery and stored in the Redis broker in plaintext
`Backend/app/api/routes/analysis.py:390`, `Backend/app/tasks/analysis_tasks.py:113`

`auto_fix_issues_task.delay(..., github_token=github_token)` serialises the **decrypted** OAuth token as a JSON task argument. Celery's broker is Redis (`celery_app.py:8`), so every queued task persists a live GitHub token with `repo` scope in Redis, in plaintext, visible in Flower (`docker-compose.yml:33`, exposed on 5555 with no auth) and in any broker inspection.

**Fix:** pass `user_id` only; have the worker re-fetch and decrypt the token itself.

---

### H-11. OAuth requests full read/write access to all private repos, with no CSRF `state`
`Backend/app/api/routes/auth.py:130-138`

```python
f"&scope=repo user:email"
```

`repo` grants **write** access to every private repository the user can reach — a read-only analysis product needs nothing of the sort. If the stored token is ever exposed (see C-4, H-10), the blast radius is "attacker can push to all your private repos."

The authorize URL also omits the `state` parameter, and `POST /auth/github/callback` (`:106`) accepts any `code` with no state validation — a classic OAuth login-CSRF / account-linking attack.

**Fix:** narrow to `read:user user:email` plus `repo` only where a fix-PR is actually requested; generate, store and verify a `state` nonce.

---

### H-12. The OAuth callback returns the stored GitHub token to the browser
`Backend/app/api/routes/auth.py:100,118`

`TokenWithUserResponse.user` is typed `dict`, so FastAPI performs **no field filtering**. `auth_service.github_oauth` returns either the freshly built user dict (containing `github_access_token: encrypted_token`, `auth_service.py:325`) or the raw DB row from `select("*")` (`:266`) — both include the stored token. It is shipped to the SPA and written to `localStorage` under `"user"` (`Frontend/src/hooks/useAuth.tsx:43`).

**Fix:** return a typed response model with an explicit allowlist of user fields.

---

### H-13. Tokens in `localStorage`, and cached tenant data survives logout
`Frontend/src/hooks/useAuth.tsx:44-45`, `Frontend/src/lib/api.ts:227-244`, `Frontend/src/lib/queryPersister.ts`

Access **and** refresh tokens live in `localStorage`, so any XSS is a full 7-day account takeover. On top of that:

- `clearAuthAndCaches` calls `require('@/lib/queryPersister')` (`api.ts:241`) — `require` does not exist in a Vite ESM bundle, so it throws and is swallowed. **The React Query cache is never cleared on auth failure.**
- `clearQueryCache()` is called with no `userId` in both `api.ts:242` and `App.tsx:87`, so it clears `repoiq_cache_anonymous` while the user's real key `repoiq_cache_<sub>` is left behind.
- `persistQueryCache` captures `userId` once at mount (`App.tsx:158`); the `storage` listener only fires for *other* tabs. In the tab where a user logs in, their repository and analysis data is persisted under the **anonymous** key — and restored for the next person to use that browser (24-hour window, `queryPersister.ts:22`).

**Fix:** refresh token in an `HttpOnly` cookie; clear the correct cache key on logout; re-key persistence on login within the same tab.

---

### H-14. Every CI quality gate is neutralised with `|| true`, and the test suite is fake-green
`.github/workflows/ci.yml:96,100,104,131,135,159,182,186`, `Backend/tests/conftest.py:53-78`

Black, isort, flake8, frontend typecheck, frontend tests, ESLint, Bandit and Safety all end in `|| true` — none can fail the build. The only real gate is backend pytest, and:

```python
try:
    from main import app as _app
except Exception:
    minimal_app = FastAPI()   # hardcodes the exact responses the tests assert
```

If the real app fails to import for any reason, the fixture substitutes a stub whose `/`, `/health`, `/api/v1/auth/signup` and `/api/v1/users/me` handlers return precisely what the four tests check. **CI can be fully green with a completely broken application.**

`--cov` thresholds are absent, so coverage is reported but never enforced.

---

# MEDIUM

| # | Finding | Location |
|---|---|---|
| M-1 | **Two divergent app entrypoints.** `main.py` (344 lines, all production middleware) vs `app/main.py` (84 lines, slowapi, `allow_methods=["*"]`). Railway/nixpacks/Procfile run `main:app`; **Dockerfile, docker-compose and `start.sh` run `app.main:app`** — containers get a different app with no rate limiting, no caching and permissive CORS. | `main.py`, `app/main.py`, `Dockerfile:19`, `docker-compose.yml:12`, `start.sh:16` |
| M-2 | **RLS policies exist but are never engaged.** `002_organizations_and_teams.sql:146-270` enables RLS and defines policies, yet every service uses the **service-role key** (`get_service_db()`, 15 call sites) which bypasses RLS by design. All isolation is application-level `.eq("user_id", ...)`; a single omission (see C-2) is a breach. | `app/db/supabase.py:22` |
| M-3 | **Two competing migration systems.** One Alembic revision (`20260123_0001_initial_schema.py`) plus hand-run SQL in `database/migrations/` documented in `DATABASE_MIGRATION_INSTRUCTIONS.md`. No single source of truth for schema state. | `alembic/`, `database/` |
| M-4 | **`TOKEN_ENCRYPTION_KEY` declared but unused.** Encryption still derives from `SECRET_KEY` (`encryption_service.py:37`), so rotating the JWT signing key makes every stored GitHub token permanently undecryptable — the exact problem the new setting was added to prevent. | `config.py:42`, `encryption_service.py:33-40` |
| M-5 | **Pickle deserialisation of cache data.** `RedisService._deserialize` falls back to `pickle.loads` on any non-JSON payload (`:62-67`). Anyone who can write to Redis — including via C-5 — gets code execution in the API process. | `redis_service.py:53-67` |
| M-6 | **Redis is never reconnected.** A failure in `RedisService.__init__` sets `available = False` permanently; a transient blip at boot disables caching for the process lifetime with no retry. | `redis_service.py:46-48` |
| M-7 | **Stale cache served to expired sessions.** The response cache returns a HIT before any auth check, so a revoked/expired token keeps receiving 200s with real data for up to 60 minutes. HIT responses also discard the original status code and all headers. | `cache_middleware.py:99-113` |
| M-8 | **GitHub content cache is not scoped to the requesting identity.** Keys are `github:content:{full_name}:{branch}:{path}` and `github:files:{full_name}:{branch}` — private-repo content is shared across all users behind an application-level ownership check on a row that may be stale (see M-9). | `github_service.py:230,157` |
| M-9 | **Repo sync never removes revoked access.** `sync_repositories` inserts and updates but never deletes rows for repos the user can no longer see, so ownership checks keep passing after access is revoked upstream. | `repository_service.py:55-127` |
| M-10 | **Unvalidated path segment interpolated into a URL.** `file_path` from the client is placed directly into `raw.githubusercontent.com/{full_name}/{branch}/{file_path}` with `follow_redirects=True`; `../` segments are normalised by httpx and can reach other public repos. Limited impact (public content only), but it is unvalidated input in a URL. | `github_service.py:246-250` |
| M-11 | **Primary email is used without checking `verified`.** `next((e for e in emails if e.get("primary")))` — no `e.get("verified")` filter, and the fallback synthesises `{username}@github.com`, which then participates in account matching. | `auth_service.py:257-260` |
| M-12 | **Refresh tokens are stateless and unrevocable** for 7 days, with rotation but no reuse detection. Combined with H-1 and H-13, a stolen refresh token is a week of access. | `core/security.py:31-37`, `routes/auth.py:142` |
| M-13 | **55 occurrences of `detail=str(e)`** in route handlers leak internal exception text (Supabase errors typically embed table names and hostnames) — directly contradicting the sanitisation effort in `auth.py:12-41`. | `app/api/routes/*.py` |
| M-14 | **Token-error messages distinguish expired / bad-signature / malformed**, giving an attacker a signing-key oracle. | `dependencies.py:16-58` |
| M-15 | **No route guards in the SPA.** `/dashboard/*`, `/settings`, `/organizations/*`, `/teams/*`, `/executive/*` are all reachable unauthenticated; protection relies entirely on API 401s, producing error-state pages instead of a redirect. | `Frontend/src/App.tsx:105-140` |
| M-16 | **PBKDF2 with a fixed salt and 10 000 iterations**, deliberately reduced for speed. Acceptable only because `SECRET_KEY` is high-entropy — but the comment ("NIST recommends minimum 10,000") is out of date; current guidance is ≥600 000 for password-derived keys. Since the input is a random key, HKDF is the correct primitive here, not PBKDF2. | `encryption_service.py:29-40` |
| M-17 | **Webhook secrets stored in plaintext** in the `webhooks` table while GitHub tokens in the same DB are encrypted — inconsistent handling of comparable material. | `webhook_service.py:63` |

---

# Product correctness

### P-1. Analysis reads at most **15 files** but reports repo-wide scores
`Backend/app/tasks/analysis_tasks.py:274`

```python
MAX_FILES = 15
MAX_FILE_SIZE = 50 * 1024
```

Files are priority-sorted then hard-truncated to 15. Files over 50 KB are dropped entirely. The resulting `overall_score`, `security_score` and issue counts are presented in the UI as an assessment of the repository. For a code-intelligence product this is the single most consequential correctness gap: on any real repo, the score is computed from well under 1 % of the code, and nothing in the API response or UI discloses the sample size.

**Fix (minimum):** return `files_analyzed` / `files_total` and surface "analysed N of M files" in the UI. **Fix (proper):** move to Celery, chunk the repo, and cache per-file results keyed by blob SHA so re-analysis is incremental.

### P-2. Analysis cache key ignores the commit
`Backend/app/tasks/analysis_tasks.py:157`

```python
commit_sha = None  # TODO: Get actual commit SHA from GitHub API
cached_result = cache_service.get_cached_analysis(repo_id, commit_sha)
```

Every analysis of a repo hits the same cache entry regardless of what changed, so re-running after a push can return the previous commit's findings.

### P-3. The SPA is configured never to refetch
`Frontend/src/App.tsx:59-76` — `staleTime: 10m`, `gcTime: 60m`, `refetchOnMount: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchInterval: false`, plus a 24-hour `localStorage` restore. Combined with the backend's 60-minute cache TTL on analysis results, a user can be shown **day-old data with no mechanism that would ever refresh it** short of a hard reload.

### P-4. Prompt injection into the analysis agents is unmitigated
Repository file content is interpolated straight into LLM prompts (`orchestrator.py`, `agents/*.py`) and the model's JSON output is parsed and persisted as findings. A crafted source file can suppress real findings or inject fabricated ones. There is also no per-user cap on OpenAI spend, and `BaseAgent` sets no request timeout.

### P-5. `BaseAgent` leaks an httpx client per instantiation
`Backend/app/agents/base_agent.py:14-19` — a fresh `httpx.Client()` per agent, six agents per `AgentOrchestrator()`, one orchestrator per analysis, never closed.

### P-6. `delete_webhook` reports success for webhooks that don't exist
`Backend/app/services/webhook_service.py:88-98` — returns `True` unconditionally without checking affected rows, so `DELETE /webhooks/{someone-elses-id}` answers "deleted successfully".

---

# Performance — why the app feels slow

Ranked by expected impact. The first three are almost certainly the whole story.

**1. Event-loop blocking (H-7).** Every DB query, GitHub call and OpenAI call is synchronous inside an `async` handler. One user's repository sync serialises every other request on that worker. Add the `time.sleep()` retry loops (up to 7 s) and blocking `socket.gethostbyname()` in the OAuth path, and p99 latency is unbounded under any concurrency.
→ *Fix:* wrap all sync I/O in `anyio.to_thread.run_sync`, or make the handlers `def` (FastAPI then runs them in the threadpool automatically). Replace `time.sleep` with `asyncio.sleep`. This is the highest-leverage change available.

**2. The middleware stack (H-5, H-6).** Every response is buffered and re-serialised three times, gzipped, and then fails to cache — the caching layer that is supposed to make this worthwhile is inert because of middleware ordering. Streaming is impossible.
→ *Fix:* delete `JSONOptimizationMiddleware`, replace `CompressionMiddleware` with Starlette's built-in `GZipMiddleware` (ASGI-level, no buffering), and either fix the cache ordering or drop it in favour of the service-layer Redis caching that already exists and works.

**3. A new Supabase client per request (H-8).** New TLS handshake and connection pool on every `RepositoryService()` / `AuthService()` construction, with the old ones never closed.
→ *Fix:* memoise `get_service_client()`.

**4. Redundant cache layers fighting each other.** Repo lists are cached in `github_service` (Redis), again in `repository_service` (Redis, hardcoded invalidation for pages 1–5 at `per_page` 30 and 6 only — `repository_service.py:120-124`), again by the response-cache middleware, again by React Query, again in `localStorage`, again in `sessionStorage`. Invalidation is best-effort at every layer, so stale reads are the norm and a "refresh" often can't reach the database.
→ *Fix:* collapse to one server-side cache keyed consistently, with `SCAN`-based prefix invalidation.

**5. `KEYS`-based invalidation** (`redis_service.py:190`) blocks Redis proportionally to keyspace size, on a path any user can reach (C-5).

**6. Frontend bundle.** `manualChunks` references `'@/lib/utils'` and `'@/lib/api'` (`vite.config.ts:40`) — alias paths in `manualChunks` do not resolve the way file paths do and will not chunk as intended. `sourcemap: mode !== 'production'` is correct, but `framer-motion` + `recharts` + the full Radix set are eagerly bundled in the vendor chunks.

---

# Login: "Continue with GitHub"

The button **already exists** — on both `/login` (`Frontend/src/pages/Login.tsx:126-145`, where it is the *only* method) and `/signup` (`SignUp.tsx:88-99`). If it isn't working for you, the cause is almost certainly a redirect-URI mismatch rather than a missing UI element:

| Source | Value |
|---|---|
| `Backend/.env.example:36` | `GITHUB_REDIRECT_URI=http://localhost:8081/auth/github/callback` |
| `Frontend/.env.example:20` | `VITE_GITHUB_REDIRECT_URI=http://localhost:8081/auth/github/callback` |
| `Frontend/vite.config.ts:9` | dev server listens on **8080** |
| `config.py:59` (this branch) | `ALLOWED_ORIGINS` — **8081 was just removed** |

GitHub redirects to `:8081`, where nothing is listening. The uncommitted `config.py` change also dropped `localhost:8081` from CORS while the documented redirect URI still points there, so the two halves of the flow now disagree.

**Fix:** set `GITHUB_REDIRECT_URI=http://localhost:8080/auth/github/callback` in both `.env.example` files and in the GitHub OAuth app's callback URL, and confirm it matches `ALLOWED_ORIGINS`. Separately, add the `state` parameter (H-11) while you're in this code.

---

# Hygiene / low

- `Backend/install_log.txt`, `install_log_2.txt` (404 lines of pip output) committed to the repo.
- `app/main.py` uses `allow_methods=["*"], allow_headers=["*"]` — the exact pattern `main.py` documents as a security fix.
- `lifespan` logs "Shutting down application..." twice (`main.py:31-32`); the startup hook does nothing (no connection pool warm-up, no Redis pre-check).
- `Frontend/package.json:2` — `"name": "vite_react_shadcn_ts"`, `"version": "0.0.0"`.
- Branding is inconsistent: `app/main.py:21` and `celery_app.py:6` say "CodeRabbit AI"; everything else says RepoIQ.
- `pytest.ini` sets `--cov-report=html` in `addopts`, generating an `htmlcov/` directory on every CI run.
- `docker-compose.yml:29-38` exposes Flower on 5555 with no authentication — with H-10, that is a GitHub-token viewer.
- `requirements.txt` pins `langchain==0.1.0` / `langgraph==0.0.20` (Jan 2024, many CVEs since) and `fastapi==0.104.1`; `celery` is entirely unpinned, so builds are not reproducible.
- `README.md` (33 KB) and `FINAL_FIX_SUMMARY.md` (20 KB) both describe the system as production-hardened; several claims in them (working token blacklist, working rate limiting, working response cache) are contradicted by the code above.

---

# Recommended order of work

**Before any further deployment**
1. C-1 password change (auth correctness)
2. C-5 admin endpoints — add auth, replace `KEYS` with `SCAN`
3. C-2 / C-3 / C-4 team authorisation and column allowlist
4. C-6 `Cache-Control: private` + full-digest cache key
5. H-4 `/users/search` scoping and email removal

**Week 1 — security completion**
6. H-1 token invalidation actually enforced in `get_current_user`
7. H-2 trusted-proxy handling (wire up `TRUSTED_PROXY_COUNT`), fail-closed limiter, install middleware unconditionally
8. H-3 webhook SSRF allowlist + async delivery
9. H-10 / H-11 / H-12 stop passing tokens to Celery, narrow OAuth scope, add `state`, filter the callback response
10. M-4 wire up `TOKEN_ENCRYPTION_KEY` before it becomes a migration problem

**Week 2 — the slowness**
11. H-5 delete `JSONOptimizationMiddleware`
12. H-7 move all sync I/O off the event loop
13. H-8 memoise the service client
14. H-6 replace the compression/cache middleware pair
15. Collapse the six-layer cache to one

**Week 3 — trust in the pipeline**
16. H-14 remove every `|| true`; delete the conftest fallback app so an import failure fails the build
17. H-9 move analysis to Celery; make cancellation state shared
18. P-1 raise or disclose the 15-file limit
19. M-1 collapse to a single entrypoint
20. M-2 decide: RLS with scoped clients, or documented service-role + a mandatory tenant-filter review checklist

---

*Every finding above was read directly from the source at the cited location. Nothing here is inferred from documentation.*
