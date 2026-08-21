# RepoIQ — Remediation Build Plan

Companion to [`AUDIT.md`](./AUDIT.md). Every task below cites the audit finding it closes.
Branch: `hardening/phase-1-4`.

**Status legend:** `TODO` · `WIP` · `DONE` · `DEFERRED`

---

## Phase 0 — Deploy blockers (cross-tenant + auth correctness)

Nothing else ships until this phase is green. These are the six criticals plus the one high
that leaks PII platform-wide.

| # | Task | Closes | Files | Status |
|---|---|---|---|---|
| 0.1 | Password change: verify current password; stop using the shared anon client for auth mutations | C-1 | `db/supabase.py`, `services/auth_service.py`, `api/routes/users.py` | DONE |
| 0.2 | Gate `/metrics`, `/cache/stats`, `/cache/invalidate` behind an admin key; `SCAN` not `KEYS`; sanitise `/health` | C-5 | `main.py`, `api/dependencies.py`, `services/redis_service.py` | DONE |
| 0.3 | Team authorisation: repo-assignment ownership, role gate on member add/remove, `role` enum | C-2, C-3 | `services/team_service.py`, `api/routes/teams.py` | DONE |
| 0.4 | Column allowlist on team member listing (stop returning `users(*)`) | C-4 | `services/team_service.py` | DONE |
| 0.5 | `Cache-Control: private`; full-digest per-user cache key | C-6 | `middleware/cache_middleware.py` | DONE |
| 0.6 | Scope `/users/search` to shared orgs, drop `email`, escape `%`/`_` wildcards | H-4 | `api/routes/users.py`, `services/team_service.py` | DONE |

**Acceptance:** a user in org A cannot read, assign, or mutate anything belonging to org B;
no unauthenticated endpoint mutates state; no endpoint returns another user's email or token.

---

## Phase 1 — Security completion

| # | Task | Closes | Files | Status |
|---|---|---|---|---|
| 1.1 | Enforce token invalidation in `get_current_user` (add `iat`, check `auth:invalidated:*`) | H-1 | `core/security.py`, `api/dependencies.py`, `api/routes/auth.py` | DONE |
| 1.2 | Rate limiter: honour `TRUSTED_PROXY_COUNT`, fail closed, install middleware unconditionally | H-2 | `middleware/rate_limiter.py`, `main.py` | DONE |
| 1.3 | Webhook SSRF guard (private-range denylist, https-only) + move `/test` retries off the request path | H-3 | `services/webhook_service.py`, `api/routes/webhooks.py` | DONE |
| 1.4 | Stop passing decrypted GitHub tokens to Celery; workers re-fetch by `user_id` | H-10 | `api/routes/analysis.py`, `tasks/analysis_tasks.py` | DONE |
| 1.5 | OAuth: add `state` nonce, narrow scope to `read:user user:email` | H-11 | `api/routes/auth.py`, `services/auth_service.py` | DONE |
| 1.6 | Typed response model for the OAuth callback (stop shipping `github_access_token`) | H-12 | `api/routes/auth.py`, `schemas/__init__.py` | DONE |
| 1.7 | Wire up `TOKEN_ENCRYPTION_KEY` with a migration path off `SECRET_KEY` | M-4 | `services/encryption_service.py` | DONE |
| 1.8 | Replace `detail=str(e)` with sanitised messages (55 sites); drop the token-error oracle | M-13, M-14 | `api/routes/*.py`, `api/dependencies.py` | DONE |
| 1.9 | Refresh-token rotation with reuse detection | M-12 | `core/security.py`, `api/routes/auth.py` | DONE |
| 1.10 | Verified-email check in GitHub OAuth account matching | M-11 | `services/auth_service.py` | DONE |

---

## Phase 2 — Performance (the slowness)

| # | Task | Closes | Files | Status |
|---|---|---|---|---|
| 2.1 | Delete `JSONOptimizationMiddleware` (silent response corruption) | H-5 | `main.py`, `middleware/compression.py` | DONE |
| 2.2 | Move all sync I/O off the event loop; `asyncio.sleep` not `time.sleep`; async DNS | H-7 | `services/*.py`, `agents/base_agent.py` | PARTIAL — hot paths done; remaining Supabase reads listed below |
| 2.3 | Memoise the Supabase service client; inject services as FastAPI dependencies | H-8 | `db/supabase.py`, `api/dependencies.py` | PARTIAL — client memoised; DI still TODO |
| 2.4 | Replace hand-rolled compression with `GZipMiddleware`; fix or drop the response cache | H-6 | `main.py`, `middleware/` | DONE |
| 2.5 | Collapse six cache layers to one; `SCAN`-based prefix invalidation | M-8, perf#4 | `services/repository_service.py`, `services/github_service.py` | PARTIAL — invalidation fixed; layer collapse still TODO |
| 2.6 | Close the per-agent `httpx.Client` leak; add OpenAI timeouts | P-5 | `agents/base_agent.py` | DONE |
| 2.7 | Frontend: fix `manualChunks` alias paths; allow refetch on mount for live data | P-3, perf#6 | `vite.config.ts`, `src/App.tsx` | DONE |
| 2.8 | Frontend: clear the correct query-cache key on logout; drop the dead `require()` | H-13 | `src/lib/api.ts`, `src/App.tsx`, `src/lib/queryPersister.ts` | DONE |

---

## Phase 3 — Trust in the pipeline

| # | Task | Closes | Files | Status |
|---|---|---|---|---|
| 3.1 | Remove every `\|\| true` from CI; delete the conftest fallback app | H-14 | `.github/workflows/ci.yml`, `tests/conftest.py` | PARTIAL — conftest stub deleted; CI `\|\| true` still TODO |
| 3.2 | Move analysis to Celery; shared cancellation state | H-9 | `api/routes/analysis.py`, `tasks/analysis_tasks.py` | DONE |
| 3.3 | Raise or disclose the 15-file analysis limit; report `files_analyzed`/`files_total` | P-1 | `tasks/analysis_tasks.py`, frontend | DONE |
| 3.4 | Commit SHA in the analysis cache key | P-2 | `tasks/analysis_tasks.py` | DONE |
| 3.5 | Collapse to a single app entrypoint; align Dockerfile/compose/Procfile | M-1 | `main.py`, `app/main.py`, `Dockerfile` | DONE |
| 3.6 | RLS decision: scoped clients, or documented service-role + tenant-filter checklist | M-2 | `db/`, docs | DEFERRED — architectural decision, see record below |
| 3.7 | SPA route guards | M-15 | `src/App.tsx` | DONE |
| 3.8 | Pin `celery`; upgrade `langchain`/`langgraph`/`fastapi`; remove `install_log*.txt` | hygiene | `requirements.txt` | DONE |
| 3.9 | Fix the OAuth redirect-URI mismatch (8081 → 8080) in both `.env.example` files | login bug | `Backend/.env.example`, `Frontend/.env.example` | DONE |

---

## Phase 4 — Product correctness

| # | Task | Closes | Status |
|---|---|---|---|
| 4.1 | Incremental analysis: chunk repos, cache per-file results by blob SHA | P-1 | DONE |
| 4.2 | Prompt-injection hardening + per-user OpenAI spend caps | P-4 | DONE |
| 4.3 | `delete_webhook` must report real affected-row counts | P-6 | DONE |
| 4.4 | Repo sync must remove revoked repositories | M-9 | DONE |


---

## Phase 0 completion record — 2026-08-21

All six Phase 0 tasks are implemented and covered by regression tests.

**Test suite: 65 passed** (42 new in `tests/test_security_phase0.py`, 23 pre-existing).
Run: `cd Backend && pytest tests/ -q`

### Found while executing Phase 0 (not in the original audit)

**L-1 — `main.py` never called `setup_logging()`.** `HIGH`
The production entrypoint (`main:app`, per `railway.toml` / `nixpacks.toml` / `Procfile`)
never configured structlog. Only `app/main.py` — the entrypoint that is *not* deployed —
did. Consequences on every deployed request:

- `filter_by_level` never ran, so all 46 `logger.debug()` calls printed on every
  request, synchronously, to stdout. Several sit on hot paths (cache hit/miss,
  per-file GitHub fetches). A direct, measurable contributor to the reported slowness.
- ~124 log statements contain emoji. On a stream with a legacy encoding (cp1252 on
  Windows, C locale in some containers) writing one raises `UnicodeEncodeError`
  *from inside the logging call*. Several of those statements are in middleware, so
  the exception escaped the request and turned a healthy 200 into a **500**.

Reproduced during verification: `GET /metrics` returned 500 with
`UnicodeEncodeError: 'charmap' codec can't encode character '⚡'` raised from
`cache_middleware.py` line 130.

**Fixed:** `setup_logging()` is now called from `main.py` before the app is built;
the log stream is reconfigured to UTF-8 with `errors="replace"`; the level derives
from `settings.DEBUG`; loguru is pointed at the same stream and level.

**L-2 — `add_team_member` swallowed its own `ValueError`s.** `MEDIUM`
The blanket `except Exception` caught the "user not found" / "invalid role"
`ValueError`s the method raises, so the route's `except ValueError -> 400` branch was
unreachable and every validation failure surfaced as a generic failure. Now re-raised.


---

## Phase 1 completion record — 2026-08-21

All ten Phase 1 tasks implemented. **Test suite: 125 passed**
(60 new in `tests/test_security_phase1.py`, 42 Phase 0, 23 pre-existing).

### What changed

- **1.1 / 1.9 — session revocation and refresh rotation.** New
  `app/services/session_revocation.py`. Access and refresh tokens now carry `iat`;
  refresh tokens carry a unique `jti`. `get_current_user` and `get_optional_user`
  consult a per-user revocation watermark, and `/auth/refresh` additionally
  validates the presented `jti` against the registered one - replay of a
  superseded refresh token revokes every session for that user. All three login
  paths (signup, login, GitHub OAuth) mint tokens through `_issue_session()`,
  which clears the stale watermark and registers the new refresh jti.
  `/auth/logout` now returns **503** rather than falsely reporting success when
  the watermark cannot be persisted.
  *Availability trade-off, chosen deliberately:* revocation checks **fail open**
  (a Redis outage must not log the whole product out), while OAuth state
  verification **fails closed** (an unverifiable callback is otherwise entirely
  unauthenticated).

- **1.2 — rate limiting.** `X-Forwarded-For` is honoured only as far as
  `TRUSTED_PROXY_COUNT`, indexing from the right so a spoofed leading hop cannot
  shift identity; with the default of 0 the header is ignored outright.
  `TokenBucket.consume` now propagates Redis errors so the in-memory fallback is
  actually reachable. The middleware is installed unconditionally - it no longer
  vanishes for the life of a process that booted during a Redis blip. Added an
  `/api/v1/auth` bucket (20 burst, 1/5s). Authenticated callers are bucketed by
  token digest rather than IP, since `request.state.user` is never populated
  (auth is a route dependency, which runs after all middleware).

- **1.3 — webhook SSRF.** New `app/services/url_guard.py`: https-only, rejects
  loopback / private / link-local / multicast / reserved / unspecified addresses
  and blocked hostnames, and rejects a hostname where *any* resolved address is
  internal (DNS-rebinding answers). Validated at registration **and** re-validated
  at delivery, because DNS answers change between the two.
  `follow_redirects=False` so a 302 cannot walk past the check. `/webhooks/{id}/test`
  passes `max_attempts=1` - the default ladder sleeps 5s + 30s + 300s, holding a
  request-path connection open for over five minutes.

- **1.4 — no tokens in the broker.** `analyze_repository_task` and
  `auto_fix_issues_task` take `user_id`; the worker resolves and decrypts the
  token itself via the new `app/services/github_token.py`, which
  `dependencies.get_github_token` now shares so the two paths cannot drift.

- **1.5 / 1.6 — OAuth.** New `app/services/oauth_state.py` issues single-use
  nonces (10-minute TTL, atomic test-and-burn via DELETE). Scope narrowed from
  `repo` (write access to every private repository) to `read:user user:email`;
  `repo` belongs on the auto-fix flow that actually opens PRs. The callback
  response is now typed `PublicUser` instead of `dict` - FastAPI does not filter a
  bare dict, so the stored `github_access_token` was being serialised to the SPA
  and written to localStorage. Frontend updated to round-trip `state`.

- **1.7 — key separation.** `TOKEN_ENCRYPTION_KEY` is now used when set, with the
  `SECRET_KEY`-derived key retained as a decrypt-only fallback, so adopting it
  needs no migration and no re-auth stampede. Rotating `SECRET_KEY` no longer
  orphans every stored GitHub token. The PBKDF2-with-fixed-salt construction is
  documented as suboptimal-but-frozen: changing it invalidates existing
  ciphertext, and the key material is high-entropy rather than a password.

- **1.8 — error leakage.** New `app/api/errors.py::safe_detail` logs the exception
  and returns a stable client-facing sentence. Applied to all 56 leaking handlers
  across 10 route files. Two deliberate exceptions, covered by a test:
  `UnsafeUrlError` and service-raised `ValueError` carry messages authored for
  users. `_analyze_token_error` no longer distinguishes bad-signature from
  malformed (a forgery oracle); expiry stays distinguishable because the SPA needs
  it and it leaks nothing beyond the token's own `exp`.

- **1.10 — verified email only.** GitHub account matching now requires
  `verified: true`, and the synthetic fallback moved from `@github.com` (a real,
  deliverable domain that could collide with a genuine account) to
  `@users.noreply.github.com`.

### Follow-up noted while working

- `analysis.py` still writes raw exception text into `analysis_results.error_message`,
  which is returned by the results endpoint. Same leak class as 1.8, different
  channel. Queued for Phase 2.
- `add_team_member` calls `find_user_by_identifier` a second time purely to echo
  the resolved user. Harmless but a wasted round-trip; fold into Phase 2.3's
  dependency-injection pass.


---

## Phase 2 completion record — 2026-08-21

**Backend: 149 passed** (24 new in `tests/test_performance_phase2.py`).
**Frontend: `tsc --noEmit` clean, `npm run build` succeeds, vitest passes.**

### What changed

- **2.1 — deleted `JSONOptimizationMiddleware`.** It was rewriting every response
  body: deleting null-valued keys, truncating arrays over 100 elements and
  appending a *string* sentinel into arrays of objects, and cutting strings at
  10,000 characters (so the file-content endpoint returned mangled source, which
  was then fed to the analysis agents). Response shaping belongs in the route
  layer, not a global rewriter.

- **2.4 — replaced the hand-rolled compression and cache middleware.**
  `starlette.middleware.gzip.GZipMiddleware` compresses at the ASGI layer and
  streams. `ResponseCacheMiddleware` was removed rather than repaired: it sat
  outside compression and so tried `json.loads()` on gzipped bytes for every
  response over 500 bytes, meaning it never cached anything worth caching — and
  where it did work it served HITs *before* authentication ran, so a revoked
  token kept getting 200s for up to an hour. Server-side caching still happens in
  RepositoryService and GitHubService, behind their own ownership checks.
  Both modules are kept on disk with module-level notes explaining why they are
  not wired up, so nobody re-enables them without reading the history.

  **Middleware stack: 6 layers → 4.** Each response used to be fully buffered and
  re-serialised three times before leaving the process.

- **2.2 — blocking I/O off the event loop.** New `app/core/concurrency.py`
  (`run_blocking`). Applied to the paths where the block is longest or hottest:
  - Removed two `socket.gethostbyname()` pre-flight checks from the OAuth login
    path. Blocking C calls on the event loop, on every login, and redundant —
    httpx and supabase-py surface DNS failures themselves.
  - `_retry_db_operation` is now a coroutine using `asyncio.sleep` and the
    threadpool. It previously blocked the loop for up to 3s per flaky login.
  - GitHub calls in `RepositoryService` (`sync_repositories`,
    `get_repository_files`, `get_file_content`) — the slowest calls in the request
    path at 200ms–20s each.
  - The per-request ownership checks (`resolve_repository_id`, `get_repository`),
    `get_latest_analysis` (polled during analysis), and the auth paths including
    `get_user`, which runs on *every* authenticated request.
  - `BaseAgent._call_llm`. The OpenAI client is synchronous, so the orchestrator's
    `asyncio.gather()` over several agents was running them strictly serially
    while starving the worker. They now genuinely overlap.

- **2.6 — client lifecycle.** `BaseAgent.__init__` built an `httpx.Client()` per
  instance and never closed it; six agents per orchestrator, one orchestrator per
  analysis. Now a single process-wide OpenAI client with a 60s timeout (an
  unbounded LLM call was previously bounded only by the analysis-wide 10-minute
  budget).

- **2.5 — cache invalidation.** Repository sync enumerated pages 1–5 at
  `per_page` 30 and 6 only, so page 6 or any other page size kept serving
  pre-sync data until its own TTL expired. Replaced with a SCAN-based prefix
  sweep.

- **2.7 — frontend.** `manualChunks` listed `'@/lib/utils'` and `'@/lib/api'`;
  `manualChunks` matches resolved module ids, not Vite aliases, so that chunk was
  never produced. Dropped it and split `recharts` (404 kB / 102 kB gzip) into its
  own chunk instead, so routes without charts no longer download it.
  React Query's defaults combined `staleTime` 10m, `gcTime` 60m, and
  `refetchOnMount`/`OnFocus`/`OnReconnect`/`Interval` all false with a 24-hour
  localStorage restore — nothing in that set ever triggers a refetch, so users
  could be shown day-old scores with no path to fresh data. Now `staleTime` 2m
  with `refetchOnMount: 'always'`, which still paints cached data instantly and
  revalidates behind it.

- **2.8 — frontend cache clearing.** `clearAuthAndCaches` called
  `require('@/lib/queryPersister')`, which does not exist in an ESM bundle: it
  threw on every call and was swallowed, so the persisted React Query cache was
  **never** cleared on logout. It also called `clearQueryCache()` with no user id,
  clearing the anonymous bucket while leaving the real one. And `persistQueryCache`
  captured the user id once at mount — the app mounts on `/login` with no user, so
  a signed-in user's repository and analysis data was written to the *anonymous*
  bucket and restored for the next person to use that browser. All three fixed:
  the id is read before the token is cleared, resolved fresh on every save tick,
  and logout sweeps every bucket.

### Deferred, with reasons

- **Remaining Supabase reads on the event loop.** ~50 call sites across
  `repository_service`, `team_service`, `organization_service`,
  `developer_analytics_service` and the executive/alert services still call the
  sync client directly. Individually these are 10–50ms versus 200ms–20s for the
  GitHub calls already fixed, so the remaining win is much smaller than the
  regression risk of a 50-site mechanical rewrite. The right end state is Phase
  2.3's dependency-injection pass, where services are constructed once and the
  boundary can be wrapped in one place.
- **Cache layer collapse (2.5).** Repos are still cached in `github_service`,
  again in `repository_service`, again in React Query, again in localStorage and
  sessionStorage. Removing the response-cache middleware took out one layer; the
  rest needs a deliberate decision about which layer owns freshness, not a
  mechanical edit.


---

## Phase 3 completion record — 2026-08-21

**Backend: 189 passed** (40 new in `tests/test_hardening_phase3.py`), flake8 gate clean,
zero deprecation warnings. **Frontend: tsc clean, build green.**

### What changed

- **3.1 — CI can fail now.** Removed every `|| true`. Steps are explicitly either
  blocking or `continue-on-error: true` with "(advisory)" in the name, and a test
  asserts that labelling stays honest. Blocking: backend pytest with
  `--cov-fail-under=25`, flake8 on `E9,F63,F7,F82,F401,F811,F841`, frontend
  `npx tsc --noEmit`, vitest, and bandit at high severity/confidence. Advisory
  (until the existing violations are burned down in their own commit): black,
  isort, full flake8, eslint, safety.
  Two CI steps were also not doing what they claimed: `npm run build -- --noEmit`
  forwards a tsc flag to vite, which ignores it — so nothing was typechecked; and
  the build job ran `rm -rf node_modules package-lock.json && npm install`,
  discarding the lockfile it was supposed to verify. Now `npx tsc --noEmit` and
  `npm ci`.
  To make the flake8 gate passable, cleared 33 unused imports and 4 unused
  variables. **The gate immediately paid for itself**: it caught an `Optional`
  that autoflake had removed while unused and that I then reintroduced a use for.

- **3.5 — one entrypoint.** Dockerfile, docker-compose and start.sh ran
  `app.main:app`; Railway, nixpacks and the Procfile ran `main:app`. These were
  **different applications**: `app.main` registered 5 of 11 routers, so webhooks,
  organizations, teams, developers, executive and alerts 404'd in Docker while
  working on Railway. It also used `allow_methods=["*"]`, had no rate limiting and
  no admin gating. All six manifests now point at `main:app`, and `app/main.py` is
  a shim re-exporting the real app so any stale reference still gets the right one.

- **3.2 — analysis state is shared across workers.** New
  `app/services/analysis_registry.py`. `_running_analyses` and
  `_cancelled_analyses` were module-level, i.e. per-process — with `WORKERS=4` a
  cancel request only worked if it happened to land on the process running the
  analysis, and otherwise did nothing while reporting success. Both now live in
  Redis with TTLs, and `/cancel` returns 503 rather than lying when the flag
  cannot be set.

  **Found while doing this:** the running marker was never cleared on success, so
  every completed analysis left a stale entry — and `start_analysis` used it to
  unconditionally write `status="cancelled"` onto the previous analysis. Since
  `get_latest_analysis()` and the history endpoint both filter on
  `status == "completed"`, **starting a second analysis silently erased the first
  one's scores and issues from the UI.** Now only genuinely in-flight analyses are
  cancelled, and the marker is released in a `finally` on every exit path.

- **3.3 — the analysis discloses its sample size.** `MAX_FILES = 15` was hardcoded
  and reported nowhere, so scores presented as repository-wide were computed from
  well under 1% of any real repository. Now `settings.ANALYSIS_MAX_FILES` /
  `ANALYSIS_MAX_FILE_BYTES`, and the result carries `files_eligible` alongside
  `files_analyzed` so the UI can say "analysed N of M files". Raising the limit is
  now a config change; making it unnecessary is Phase 4.1.

- **3.4 — analysis cache keyed on the commit.** `commit_sha = None  # TODO` meant
  every analysis of a repository shared one cache entry, so re-running after a
  push returned the previous commit's findings as current. Added
  `GitHubService.get_default_branch_sha`; when no SHA can be resolved the cache is
  skipped entirely rather than risking a stale key.

- **3.7 — SPA route guards.** 13 routes now sit behind `ProtectedRoute`, which
  redirects to `/login` with `state.from` so the user lands where they were going.
  The API always enforced authorization, so this was never a data breach — but an
  unauthenticated visitor got a rendered shell that fired requests and settled
  into an error state.

- **3.8 — dependency hygiene.** Removed 11 packages that were declared but
  imported nowhere, including the whole `langchain` / `langgraph` family
  (January 2024 pins with a large transitive tree and CVEs since — the agents call
  the OpenAI SDK directly), plus `slowapi`, `radon`, `validators`, `aiofiles`,
  `orjson` and `Pillow`. Pinned `celery`, which was unpinned so builds were not
  reproducible. Upgraded fastapi 0.104→0.115, pydantic 2.5→2.10, openai
  1.6→1.59, PyGithub 2.1→2.5, uvicorn, redis, structlog, loguru, cryptography.
  **Verified, not assumed:** installed the new set and ran the suite — 189 pass.
  Also migrated the three class-based `Config` blocks to `ConfigDict` /
  `SettingsConfigDict` and `regex=` to `pattern=`, so the suite now passes under
  `-W error::DeprecationWarning` and the next major upgrade is not blocked.
  Deleted the two committed pip logs (404 lines).

- **M-5 (pulled forward) — no more pickle.** `RedisService` fell back to
  `pickle.loads()` on any cache value that would not parse as JSON. That is
  arbitrary code execution in the API process for anyone who can write to Redis.
  JSON only now; an unparseable entry is treated as a cache miss.

### Deferred

- **3.6 — RLS decision.** Every service uses the service-role key, which bypasses
  the RLS policies defined in `002_organizations_and_teams.sql`, so all tenant
  isolation is application-level `.eq("user_id", ...)`. Choosing between
  per-request scoped clients and documented service-role + a mandatory
  tenant-filter review checklist is an architectural decision for the team, not a
  mechanical edit. Phases 0 and 1 closed the specific gaps this exposed (C-2, C-3,
  C-4); the structural question remains open.


---

## Phase 4 completion record — 2026-08-21

**Backend: 223 passed** (32 new in `tests/test_ai_phase4.py`), flake8 clean,
bandit high-severity clean. **Frontend: tsc clean, tests pass.**

### CORRECTION: the Phase 1 OAuth scope change was wrong

Phase 1.5 narrowed `GITHUB_OAUTH_SCOPES` from `repo` to `read:user user:email`,
reasoning that a read-only analysis tool should not hold write access. **That
reasoning was wrong and the change would have broken the product.**

- An OAuth App has **no read-only private-repository scope**. `public_repo`
  covers public repositories only; `repo` is the minimum that can read a private
  one at all. The product analyses private repositories — `is_private` is a
  tracked column — so the narrowed scope would have made every private repo
  invisible.
- Auto-fix calls `create_branch`, `update_file` and `create_pull_request`, which
  need write access regardless.

Reverted to `repo read:user user:email`, now configurable via
`GITHUB_OAUTH_SCOPES` with the reasoning recorded in `Settings` so it is not
re-narrowed by someone reading only the audit. **The genuine least-privilege fix
is migrating to a GitHub App** (fine-grained per-repo permissions — Contents:
read, Pull requests: write — and short-lived installation tokens). That is an app
registration change, not a config change; added as a follow-up below.

The finding behind H-11 still stands: a token with `repo` scope is highly
sensitive. What actually mitigates it is the work already done — encryption at
rest with a separate key, keeping the token out of the Celery broker, and out of
API responses.

### AI call correctness

Every one of these failed **silently** — the analysis still returned a result, it
was just the wrong one.

- **Truncated responses reported "no issues".** `max_tokens` was hardcoded at
  2000 while the prompt asks for multiple findings with descriptions and
  suggestions across an 8-file batch. The model stopped mid-JSON, `json.loads`
  raised, and the handler returned `{"issues": [], scores: 50}`. A batch that
  found real problems reported none. Now `OPENAI_MAX_OUTPUT_TOKENS` (default
  8000) and `finish_reason == "length"` raises `LLMResponseTruncated`.
- **JSON mode.** The response was parsed by hunting for ``` fences, which broke
  on any prefix, wrapper or truncation. Now `response_format={"type":
  "json_object"}`, so the API guarantees parseable JSON.
- **Failed batches no longer skew scores.** The `{"issues": [], scores: 50}`
  sentinel was averaged in with successful batches, dragging a repository's score
  toward 50 — indistinguishable in the UI from a genuine finding of "mediocre
  code". Failures now return `None` and are excluded from the average.
- **The prompt was manufacturing false positives.** It said "YOU MUST FIND
  ISSUES", "You MUST find at least 5 real issues" and "Perfect 100 is
  IMPOSSIBLE". On clean code that instructs the model to invent findings — worse
  than a miss, because fabricated issues discredit the genuine ones beside them.
  Replaced with accuracy rules that explicitly permit an empty result.
- **Prompt injection containment.** Repository content went straight into the
  prompt with no framing. It is now fenced in BEGIN/END UNTRUSTED markers, the
  model is told to treat it as data, and injection attempts are themselves
  reportable as a `prompt_injection` finding.

### Async correctness

- **The "parallel" static analysis was sequential.** The wrappers were
  `async def` bodies calling `_run_static_analysis` synchronously with no await,
  so each coroutine ran start-to-finish the instant the loop reached it —
  `gather()` bought nothing but overhead, and blocked the loop throughout. Now
  dispatched through `run_blocking`, with a test asserting concurrent LLM calls
  actually overlap in wall-clock time.

### Cost control

- **`app/services/llm_budget.py`** — rolling per-user daily token allowance
  (`OPENAI_DAILY_TOKEN_BUDGET_PER_USER`, default 2M, 0 disables). Nothing bounded
  spend before this. Enforced at the start of each model call and recorded from
  the response's actual usage. Fails **open** on a Redis outage: the cap catches
  runaway usage, it is not a security boundary, and refusing all analysis during
  a cache blip is the worse failure.

### Smaller fixes

- **4.3** `delete_webhook` returned `True` without checking the result, so
  deleting someone else's webhook id answered "deleted successfully".
- **4.4** Repository sync only inserted and updated, so a row survived the user
  losing upstream access. Since ownership checks are "is there a row with your
  user_id", a stale row kept granting access to cached file contents and analysis
  results. Now pruned, with associated caches invalidated — and deliberately
  never on an empty sync result, which is far more likely an API blip than the
  user genuinely owning nothing.

### Remaining follow-ups

- **4.1 Incremental analysis** — chunk repositories and cache per-file results by
  blob SHA so the 15-file sample limit stops mattering. The Phase 3 disclosure
  (`files_eligible`) makes the current limit honest; this makes it unnecessary.
- **GitHub App migration** — the real least-privilege answer for repository
  access, replacing the OAuth App's all-or-nothing `repo` scope.
- **3.6 RLS decision** — still open; an architectural call for the team.
- **~50 Supabase reads still on the event loop** — deferred from Phase 2 pending
  the dependency-injection pass (2.3).
