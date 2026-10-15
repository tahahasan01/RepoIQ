# RepoIQ

**AI code review for GitHub repositories.** RepoIQ reads your code with Claude,
reports security, quality, architecture and documentation findings with real
file and line references, scores the repository from those findings, and can
propose fixes as draft pull requests that you approve first.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Deploying to production](#deploying-to-production)
- [Launch checklist](#launch-checklist)
- [How scoring works](#how-scoring-works)
- [Testing and CI](#testing-and-ci)
- [Project layout](#project-layout)

---

## What it does

![Repository dashboard](pics/repoanalysisDasboard.png)

**Analysis.** Pick a repository and RepoIQ fetches its source from GitHub,
reviews it with Claude, and runs static checks alongside. Every finding has a
severity, a category, the file and the real line number, and a suggested fix.
Progress updates live while it runs. Re-analysing is cheap: findings are cached
per file by Git blob SHA, so unchanged files are not sent to the model again.

**Scores.** Security, quality, architecture and documentation scores, and an
overall score, are computed from the findings alone (see
[How scoring works](#how-scoring-works)). History and a score trend are kept
per repository.

**Issues and files.** Filter and search findings, or browse the file tree with
findings marked against the code.

**Documentation.** A full analysis report and a bug report (both printable),
a prioritised roadmap, and an architecture diagram generated from the file
tree.

**Ask about this repo.** A chat grounded in the latest analysis, with up to
three files attached for questions about specific code.

**Auto-fix.** Select findings and RepoIQ proposes changes. You review the exact
diff; RepoIQ only opens a **draft** pull request on a new `repoiq/fix-…` branch
after you approve that diff, and only if you have write access. It never pushes
to an existing branch. Changes far from the selected findings are flagged, and
diffs containing invisible or direction-changing Unicode are refused.

**Organisations and teams.** Group repositories under organisations and teams,
invite people, compare teams, see an executive dashboard, and get alerts when a
repository's score drops below your threshold or a security problem appears.
Alerts can also be delivered to your own endpoints as signed webhooks.

<details>
<summary>More screenshots</summary>

| | |
|---|---|
| ![Repositories](pics/repos_page.png) | ![Issues](pics/issues%20section.png) |
| ![Files](pics/filesSection.png) | ![Documentation](pics/DocumentationSection.png) |
| ![Organisation](pics/Organization_page.png) | ![Executive dashboard](pics/Executive_Dashboard.png) |
| ![Teams](pics/Teams.png) | ![Team performance](pics/TeamPerformance.png) |

</details>

Sign-in is **GitHub only**. RepoIQ sends no email, so password accounts would
have no reset or verification; they are disabled (`PASSWORD_AUTH_ENABLED`).

---

## How it works

```
 Browser ── React SPA (Vite build, served by Frontend/server.js)
    │
    ▼  HTTPS, JWT
 FastAPI API (Backend/main.py) ──────────── GitHub (GitHub App installation tokens)
    │        │
    │        └── Redis: Celery broker, caches, rate limits, session revocation, locks
    ▼
 PostgreSQL ◄── Celery worker: analyses, auto-fix, webhook delivery, insights
                Celery beat: schedules the alert check (exactly one instance)
                     │
                     ▼
                 Anthropic API (Claude) for review, chat, roadmap, diagrams, fixes
```

- **API**: FastAPI on psycopg 3 with a small query builder (`app/db/`). Every
  tenant-owned table is listed in `app/db/tenancy.py`, and a test fails if a
  query on one is not scoped to its owner.
- **Worker**: analyses run as Celery tasks. Without a worker the API falls back
  to running them in-process (fine locally, not in production).
- **AI**: Claude through the official Anthropic SDK, with structured outputs,
  streaming, a per-user daily token budget and refusal handling
  (`app/agents/`).
- **GitHub**: a GitHub App, installed only on the repositories the user picks,
  with short-lived installation tokens. Tokens that are stored are encrypted at
  rest.

---

## Local development

### Prerequisites

- Node.js 20 or newer, Python 3.11
- Docker (for PostgreSQL and Redis)
- A GitHub account to register a GitHub App
- An Anthropic API key, **or** a Claude Code login for the dev-only provider
  below

### 1. PostgreSQL and Redis

The ports are deliberately non-default so RepoIQ does not share a database or
Redis with another local project (sharing Redis means sharing sessions, rate
limits and Celery queues).

```bash
docker run -d --name repoiq-postgres -p 5433:5432 \
  -e POSTGRES_USER=repoiq -e POSTGRES_PASSWORD=repoiq_dev -e POSTGRES_DB=repoiq \
  --restart unless-stopped postgres:16-alpine

docker run -d --name repoiq-redis -p 6380:6379 --restart unless-stopped redis:7-alpine
```

Prefer one command? `cd Backend && docker compose up --build` runs Postgres,
Redis, the migrations, the API, a worker and beat together.

### 2. Backend

```bash
cd Backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
```

`.env.example` is written for production. For local development change these
in `.env` (the production boot checks then do not apply, and `/docs` is
served):

```env
APP_ENV=development
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:8080
GITHUB_REDIRECT_URI=http://localhost:8080/auth/github/callback
DATABASE_URL=postgresql://repoiq:repoiq_dev@localhost:5433/repoiq
REDIS_URL=redis://localhost:6380/0
SECRET_KEY=          # python -c "import secrets; print(secrets.token_urlsafe(64))"
TOKEN_ENCRYPTION_KEY=   # generate a second, different value the same way
```

Then fill in the GitHub App values (step 4) and an AI credential:

- `ANTHROPIC_API_KEY=sk-ant-api…` with `LLM_PROVIDER=anthropic`, or
- `LLM_PROVIDER=claude_agent_sdk` to run through your own Claude Code login
  (installed by `requirements-dev.txt`; sign in with the `claude` CLI). This is
  for local development only, and the app refuses to start with it when
  `APP_ENV=production`.

Create or upgrade the schema (run after every pull; production runs it on every
deploy):

```bash
python -m app.db.migrate
```

It applies the frozen baseline `database/postgres_schema.sql`, then each pending
file in `database/migrations/`, recording them in `schema_migrations`. To change
the schema add `database/migrations/NNN_name.sql`; never edit the baseline.

Run the three processes:

```bash
uvicorn main:app --reload --port 8000
celery -A app.core.celery_app worker --loglevel=info -Q celery,analysis   # Windows: add --pool=solo
celery -A app.core.celery_app beat --loglevel=info
```

### 3. Frontend

```bash
cd Frontend
npm install
cp .env.example .env    # VITE_API_BASE_URL=http://localhost:8000/api/v1
npm run dev             # http://localhost:8080
```

### 4. GitHub App

RepoIQ uses a GitHub App rather than an OAuth App: an OAuth App can only ask for
`repo`, which is read and write access to every repository the user can reach.

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.
2. Callback URL: `http://localhost:8080/auth/github/callback` (add your
   production URL later). Enable **Request user authorization (OAuth) during
   installation**.
3. Repository permissions: **Contents: Read and write** (needed only for
   auto-fix; `Read-only` disables it), **Metadata: Read-only**, **Pull
   requests: Read and write**. Account permissions: **Email addresses:
   Read-only**.
4. Create it, note the App ID, slug and Client ID, then generate a client
   secret and a private key.
5. Load them into `.env` without pasting a multi-line PEM by hand:

   ```bash
   python scripts/install_github_app_key.py path/to/key.pem
   python scripts/install_github_app_key.py --client-secret
   ```

6. Set `GITHUB_AUTH_MODE=app` and install the app on the repositories
   you want analysed.

`Backend/GITHUB_APP_MIGRATION.md` covers moving an existing OAuth deployment
over.

---

## Configuration

Everything is read from the environment by `Backend/app/core/config.py`;
`Backend/.env.example` lists every setting with a comment. The ones that matter
most:

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` enables the boot checks, HSTS, and hides the API docs |
| `DATABASE_URL`, `REDIS_URL` | | PostgreSQL and Redis |
| `SECRET_KEY` | | JWT signing; at least 32 random characters in production |
| `TOKEN_ENCRYPTION_KEY` | | Encrypts stored GitHub tokens; required in production, must differ from `SECRET_KEY` |
| `ALLOWED_ORIGINS` | | Comma-separated frontend origins; https only in production |
| `GITHUB_AUTH_MODE` | `oauth` | `app` (GitHub App, recommended) or `oauth` |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` | | From the GitHub App |
| `GITHUB_REDIRECT_URI` | | Must match the App's callback URL exactly |
| `LLM_PROVIDER` | `anthropic` | `claude_agent_sdk` is dev-only |
| `ANTHROPIC_API_KEY` | | Claude API key (or `ANTHROPIC_AUTH_TOKEN`; set one, not both) |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Also part of the per-file findings cache key |
| `ANTHROPIC_EFFORT` | `high` | `low` … `max`: review depth against cost |
| `LLM_DAILY_TOKEN_BUDGET_PER_USER` | `2000000` | Hard per-user daily ceiling on model tokens |
| `ANALYSIS_MAX_FILES` | `150` | Most files reviewed per analysis, chosen by importance |
| `ANALYSIS_EXECUTION_MODE` | `auto` | `queue` in production (always use the worker) |
| `ALERT_CHECK_INTERVAL_SECONDS` | `3600` | How often beat runs the alert check; `0` turns it off |
| `TRUSTED_PROXY_COUNT` | `0` | Proxy hops to trust in `X-Forwarded-For` (`1` behind Railway) |
| `ADMIN_API_KEY` | unset | Enables the ops endpoints (`/metrics`, cache admin); unset means 404 |
| `ENABLE_API_DOCS` | `false` | Serve `/docs` and `/openapi.json` in production |
| `PASSWORD_AUTH_ENABLED` | `false` | Email and password accounts (no reset flow exists) |
| `DEBUG` | `false` | Refused in production |

Each user sets their own alert threshold and security-alert preference in
Settings.

Frontend: `VITE_API_BASE_URL` is the only build variable. A production build
without it fails on purpose rather than pointing every visitor at `localhost`.

---

## Deploying to production

The repository is set up for [Railway](https://railway.app) with four services
from this one repo. Set each service's **root directory**:

| Service | Root | Config | Notes |
|---|---|---|---|
| API | `Backend` | `railway.toml` | Runs `python -m app.db.migrate` before each deploy; health check `/health` |
| Worker | `Backend` | `railway.worker.toml` | Analyses, auto-fix, webhooks; scale this for throughput |
| Beat | `Backend` | `railway.beat.toml` | Exactly **one** replica; it schedules the alert check |
| Frontend | `Frontend` | `nixpacks.toml` | `npm run build` then `node server.js` |

Add a PostgreSQL and a Redis service and reference their URLs from the three
backend services. The backend services share the same environment variables.

**Backend environment.** Start from `Backend/.env.example` with `APP_ENV=production`,
`LLM_PROVIDER=anthropic`, `ANALYSIS_EXECUTION_MODE=queue` and
`TRUSTED_PROXY_COUNT=1`. In production the API refuses to start, listing every
problem at once, if:

- `SECRET_KEY` is short or a placeholder, or `TOKEN_ENCRYPTION_KEY` is missing or equal to it
- `ALLOWED_ORIGINS` is empty or contains `*`, localhost, or a plain `http://` origin
- no Anthropic credential is set, `DEBUG` is on, or the dev-only Agent SDK provider is selected
- the GitHub App settings are incomplete or `GITHUB_REDIRECT_URI` is not https
- `DATABASE_URL` or `REDIS_URL` still points at localhost, or the database uses the development password

**Frontend environment.** Set `VITE_API_BASE_URL=https://<api-host>/api/v1` for
both the build and the runtime: `server.js` reads it at runtime to build its
Content Security Policy. The server serves the SPA with an `index.html`
fallback for client routes, long-lived caching for hashed assets, compression
and security headers, and reads `PORT`.

**Other platforms.** `Backend/Dockerfile` (non-root) and `Backend/Procfile`
(`release`, `web`, `worker`, `beat`) work anywhere that runs containers or
Procfiles. Keep one beat process.

**Probes.** `/live` (process up), `/ready` (Redis reachable), `/health`
(database and Redis, with status per dependency).

**Known limits.** Uploaded avatars are stored on the API's local disk, so run a
single API instance or move avatars to object storage before scaling out.

---

## Launch checklist

Things only the owner can do:

- [ ] Register the production GitHub App (or add the production callback URL to
      the existing one), with **Contents: Read and write** if you want auto-fix.
- [ ] Create a production Anthropic API key and set it as `ANTHROPIC_API_KEY`.
- [ ] Revoke any API or OAuth tokens that were ever pasted into chats, issues
      or commits.
- [ ] Generate fresh `SECRET_KEY`, `TOKEN_ENCRYPTION_KEY` and `ADMIN_API_KEY`.
- [ ] Have the Privacy Policy and Terms of Service drafts reviewed, and fill in
      the placeholders in `Frontend/src/content/legal.ts`.
- [ ] Replace `https://repoiq.app` in `Frontend/public/sitemap.xml` with your
      domain and uncomment the `Sitemap:` line in `robots.txt`.
- [ ] Review the marketing pages (landing stats, blog, careers, contact form,
      demo video), which still contain placeholder content.
- [ ] Choose a licence and add a `LICENSE` file.

---

## How scoring works

Scores are computed by one function, `Backend/app/services/scoring.py`, which
every analysis path calls, so a full run and a cache-warm run give the same
number for the same findings. The model's own opinion of the code is not used:
a score can always be explained by the list of findings that produced it.

Each finding's severity carries a penalty:

| Severity | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| Penalty | 15 | 7 | 3 | 1 | 0 |

Penalties add up per dimension and decay exponentially, `score = 100 × e^(−penalty / 60)`,
so more findings always lower the score and it never goes negative
(1 critical → 78, 3 → 47, 6 → 22).

The overall score weights security 35%, quality 30%, architecture 20% and
documentation 15%, **capped at 15 points above the weakest dimension**: a
repository is never much better than its worst area.

Findings come from the AI review and from static checks for well-understood
patterns. If every AI batch fails, the analysis is marked failed rather than
presented as a review. A repository with no source RepoIQ can read fails with
that reason instead of scoring 100.

An analysis reviews up to `ANALYSIS_MAX_FILES` files chosen by importance, and
records how many were eligible and how many were read, so treat the score as a
verdict on what was reviewed.

---

## Testing and CI

```bash
# Backend: needs the Postgres and Redis containers above. Tests use their own
# database (repoiq_test) and Redis db 15, never the app's data.
cd Backend
python -m app.db.migrate                     # against the test DATABASE_URL, see conftest.py
REQUIRE_TEST_DATABASE=1 pytest -q            # fail, rather than skip, when the DB is missing
flake8 app/ main.py --max-line-length=120 --select=E9,F63,F7,F82,F401,F811,F841

# Frontend
cd Frontend
npm run typecheck && npx vitest run && npm run lint && npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of these on every push,
with a PostgreSQL service, plus a security scan. Every job is blocking.

---

## Project layout

```
Backend/
  main.py                 FastAPI app, middleware, health probes
  app/api/routes/         HTTP routes (auth, github, analysis, chat, teams, organizations, alerts, webhooks, …)
  app/agents/             Claude agents and the analysis orchestrator
  app/services/           Business logic (scoring, autofix, GitHub, alerts, insights, …)
  app/tasks/              Celery tasks (analysis, auto-fix, alerts, webhooks)
  app/db/                 Query builder, migration runner, tenancy rules
  database/               Baseline schema and numbered migrations
  tests/                  pytest suite
Frontend/
  src/pages/              Routes
  src/components/         UI (shadcn/ui based)
  src/hooks/, src/stores/ TanStack Query hooks and Zustand stores
  src/lib/api.ts          API client
  server.js               Production static server
```

---

## Author

**Taha Hasan** · [@tahahasan01](https://github.com/tahahasan01)

## Licence

No licence has been chosen yet. Until a `LICENSE` file is added, all rights are
reserved.
