# ⚡ RepoIQ

<div align="center">

![RepoIQ Banner](https://img.shields.io/badge/RepoIQ-AI%20Powered%20Code%20Analysis-blue?style=for-the-badge&logo=react)

**AI-Powered Repository Analysis & Code Quality Platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

[Features](#-features) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [Scoring](#-how-scoring-works) • [Usage](#-usage) • [API](#-api-documentation)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Demo & Screenshots](#-demo)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [How Scoring Works](#-how-scoring-works)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**RepoIQ** is an advanced AI-powered platform that analyzes your GitHub repositories to identify security vulnerabilities, code quality issues, architectural problems, and best practice violations. Built for **product owners** and **development teams**, RepoIQ provides comprehensive reports and actionable insights to maintain code excellence.

### Why RepoIQ?

- 🤖 **AI-Powered Analysis**: Uses OpenAI GPT-4 to understand code context and detect complex issues
- 🔒 **Security First**: Detects SQL injection, XSS, authentication flaws, and 20+ vulnerability types
- 📊 **Comprehensive Reports**: Generate professional PDF reports for stakeholders
- ⚡ **Real-Time Analysis**: Live progress tracking with instant results
- 🎯 **Smart Caching**: Redis-powered caching for blazing-fast performance
- 🌓 **Beautiful UI**: Modern, responsive interface with dark mode support

---

## ✨ Features

### 🔍 **Multi-Agent Code Analysis**

- **Security Agent**: Detects vulnerabilities (SQL injection, XSS, CSRF, insecure dependencies)
- **Quality Agent**: Identifies code smells, complexity issues, and maintainability problems
- **Architecture Agent**: Analyzes design patterns, coupling, and structural issues
- **Documentation Agent**: Checks for missing docs, comments, and API documentation
- **Best Practices Agent**: Validates rate limiting, caching, debouncing, and error handling

### 📈 **Advanced Analytics Dashboard**

- Real-time analysis progress tracking
- Interactive score visualizations
- Severity-based issue categorization
- Historical analysis comparison
- Trend analysis over time

### 📄 **Professional Report Generation**

- **Full Analysis Report**: Comprehensive PDF with all findings
- **Bug Report**: Focused report for development teams
- **Architecture Diagram**: Auto-generated from file structure
- **Exportable Formats**: PDF, JSON, DOC

### 🔐 **GitHub Integration**

- OAuth authentication
- Repository synchronization
- File content analysis
- Branch tracking
- Automatic updates

### ⚡ **Performance Optimizations**

- Redis caching for API responses
- Request deduplication
- Background task processing with Celery
- Smart token optimization for large codebases
- Progressive data loading

---

## 🎬 Demo & Screenshots

> **Visual Tour of RepoIQ** - Explore all the key features and sections of the platform through these screenshots.

### 🔐 Login & Authentication

![Login Page](pics/Loginpage.png)

**GitHub OAuth Integration** - Secure login with your GitHub account. No passwords needed! Simply authorize RepoIQ to access your repositories and start analyzing.

---

### 🏠 Homepage & Dashboard

![Homepage](pics/Homepage.png)

**Welcome Dashboard** - Clean, modern interface showing your repositories and quick access to key features.

---

### 📚 Repositories Page

![Repositories](pics/repos_page.png)

**Repository Management** - View all your GitHub repositories, sync status, and initiate analyses with a single click.

---

### 📊 Repository Analysis Dashboard

![Analysis Dashboard 1](pics/repoanalysisDasboard.png)

![Analysis Dashboard 2](pics/repoanalysisDashboard2.png)

**Comprehensive Analysis Overview** - Real-time analysis progress, security scores, quality metrics, and detailed insights. Track your repository health at a glance with interactive charts and visualizations.

---

### 🐛 Issues Section

![Issues Section](pics/issues%20section.png)

**Detailed Issue Tracking** - Browse all detected issues with severity filters, file navigation, and actionable recommendations. Each issue includes:
- **Severity Level** (Critical, High, Medium, Low)
- **File Location** with line numbers
- **Issue Description** and impact
- **AI-Generated Fix Suggestions**

---

### 📁 Files Section

![Files Section](pics/filesSection.png)

**File Browser with Issue Mapping** - Navigate your codebase structure with visual indicators showing which files have issues. Features include:
- **Tree View** of repository structure
- **File Content Viewer** with syntax highlighting
- **Issue Badges** on files with problems
- **Inline Issue Display** while browsing code

---

### 📄 Documentation & Reports

![Documentation Section](pics/DocumentationSection.png)

**Comprehensive Documentation** - Access detailed analysis reports, architecture diagrams, and documentation insights.

![Bug Report](pics/BugsReport.png)

**Professional Bug Reports** - Generate and download PDF reports for stakeholders, including:
- Executive summary
- Detailed issue breakdown
- Code snippets and fixes
- Risk assessment
- Recommendations

---

### 🏢 Organizations & Teams

![Organizations Page](pics/Organization_page.png)

**Organization Management** - Create and manage organizations to group repositories and teams together. Monitor overall health across multiple teams.

![Teams Page](pics/Teams.png)

**Team Management** - Organize your development teams, assign repositories, and track team performance.

![Team Performance](pics/TeamPerformance.png)

**Team Analytics** - View team performance metrics, contribution statistics, and health scores.

![View Details](pics/view_details.png)

**Detailed Team View** - See team members, assigned repositories, and performance breakdowns.

---

### 📈 Executive Dashboard

![Executive Dashboard](pics/Executive_Dashboard.png)

**High-Level Business Metrics** - Executive view with:
- Overall organization health score
- Business risk assessment
- Compliance status
- Team leaderboards
- Top risk areas
- Trend analysis

---

## 🛠 Tech Stack

### **Frontend**

| Technology | Version | Purpose | Features Used |
|-----------|---------|---------|---------------|
| **React** | 18.3.1 | UI Framework | Hooks, Context, Suspense |
| **TypeScript** | 5.6.2 | Type Safety | Strict mode, Interfaces |
| **Vite** | 5.4.2 | Build Tool | HMR, Code splitting |
| **Zustand** | 5.0.2 | State Management | Stores, Persistence |
| **TanStack Query** | 5.59.16 | Data Fetching | Caching, Invalidation |
| **Framer Motion** | 11.11.17 | Animations | Page transitions, Gestures |
| **Tailwind CSS** | 3.4.1 | Styling | JIT, Dark mode, Custom theme |
| **Shadcn/ui** | Latest | Component Library | Radix UI primitives |
| **React Router** | 6.28.0 | Routing | Lazy loading, Protected routes |
| **Lucide React** | 0.454.0 | Icons | 1000+ icons |
| **React Markdown** | 9.0.1 | Markdown Rendering | GitHub-flavored markdown |

### **Backend**

| Technology | Version | Purpose | Features Used |
|-----------|---------|---------|---------------|
| **FastAPI** | 0.115.5 | Web Framework | Async, Auto docs, Pydantic |
| **Python** | 3.11+ | Language | Type hints, Async/await |
| **Celery** | 5.4.0 | Task Queue | Background jobs, Scheduling |
| **Redis** | 5.2.0 | Caching & Queue | Cache, Pub/Sub, Queue |
| **PostgreSQL** | 16 | Database | Accessed directly via psycopg 3 with a connection pool |
| **OpenAI** | 1.54.4 | AI Analysis | GPT-4, Embeddings |
| **GitHub API** | - | Integration | OAuth, Repos, Files |
| **Pydantic** | 2.10.3 | Validation | Data models, Settings |
| **Uvicorn** | 0.32.1 | ASGI Server | Hot reload, Workers |

### **DevOps & Tools**

- **Docker** - Containerization
- **Redis** - In-memory caching
- **Git** - Version control
- **GitHub Actions** - CI/CD (ready)
- **ESLint** - Code linting
- **Prettier** - Code formatting

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TypeScript)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Pages     │  │ Components  │  │   Stores    │          │
│  │ (Dashboard, │  │ (UI, Layout)│  │  (Zustand)  │          │
│  │  Issues)    │  └─────────────┘  └─────────────┘          │
│  └─────────────┘         │                 │                 │
│         │                └─────────────────┘                 │
│         └─────────────────┬─────────────────┘                │
│                           │                                  │
│                    ┌──────▼──────┐                           │
│                    │   API Client │                          │
│                    │  (Axios/Fetch)│                         │
│                    └──────┬──────┘                           │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTPS/REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              API Gateway (FastAPI + Middleware)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    CORS      │  │    Cache     │  │     Auth     │       │
│  │  Middleware  │  │  Middleware  │  │  (JWT/OAuth) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                           │                                  │
│  ┌────────────────────────┼────────────────────────┐         │
│  │                Routes & Controllers             │         │
│  │  /auth  /github  /analysis  /repositories       │         │
│  └────────────────────────┬────────────────────────┘         │
└───────────────────────────┼──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Services   │    │  AI Agents   │    │ Task Queue   │
│              │    │              │    │              │
│ • GitHub API │    │ • Security   │    │  Celery +    │
│ • Postgres   │    │ • Quality    │    │  Redis       │
│ • Cache      │    │ • Architecture│   │              │
│ • Repository │    │ • Documentation│  │ Background   │
│              │    │ • Best Practices│ │ Analysis     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer (PostgreSQL 16)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Users & Auth │  │ Repositories │  │  Analysis    │       │
│  └──────────────┘  └──────────────┘  │   Results    │       │
│  ┌──────────────┐  ┌──────────────┐  └──────────────┘       │
│  │    Issues    │  │   Sessions   │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               External Services & Cache                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  OpenAI API  │  │  GitHub API  │  │    Redis     │       │
│  │   (GPT-4)    │  │   (OAuth)    │  │   (Cache)    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Login**: GitHub OAuth → JWT token → Session storage
2. **Repository Sync**: GitHub API → PostgreSQL → Frontend cache
3. **Analysis Trigger**: User action → Celery task → Background processing
4. **AI Analysis**: Code → OpenAI GPT-4 → Structured results
5. **Results Storage**: Issues → PostgreSQL → Redis cache → Frontend
6. **Report Generation**: Analysis data → PDF rendering → Download

---

## 🚀 Installation

### Prerequisites

- **Node.js** >= 18
- **Python** >= 3.11
- **Docker** (easiest way to get PostgreSQL and Redis)
- **GitHub account** — to register the GitHub App
- **OpenAI API key** — the AI review does not run without it

### 1️⃣ Clone

```bash
git clone https://github.com/tahahasan01/RepoIQ.git
cd RepoIQ
```

### 2️⃣ PostgreSQL and Redis

The ports below are deliberately non-default so RepoIQ does not collide with
another project already using 5432/6379. If two projects share a Redis, they
share session tokens, rate-limit counters and Celery queues — stopping one
breaks the other.

```bash
docker run -d --name repoiq-postgres -p 5433:5432 \
  -e POSTGRES_USER=repoiq -e POSTGRES_PASSWORD=repoiq_dev -e POSTGRES_DB=repoiq \
  --restart unless-stopped postgres:16-alpine

docker run -d --name repoiq-redis -p 6380:6379 \
  --restart unless-stopped redis:7-alpine
```

Load the schema:

```bash
docker exec -i repoiq-postgres psql -U repoiq -d repoiq < Backend/database/postgres_schema.sql
```

If you are upgrading an existing database rather than creating a fresh one,
apply the migrations in `Backend/database/migrations/` in numeric order.

### 3️⃣ Backend

```bash
cd Backend

python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

**Edit `Backend/.env`** — the variable names below are the real ones read by
`app/core/config.py`:

```env
# Database
DATABASE_URL=postgresql://repoiq:repoiq_dev@localhost:5433/repoiq

# Redis (broker, cache, rate limits, session revocation)
REDIS_URL=redis://localhost:6380/0

# Auth — generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
SECRET_KEY=
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# GitHub App (see step 5)
GITHUB_AUTH_MODE=github_app
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_REDIRECT_URI=http://localhost:8080/auth/github/callback

# AI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# CORS
ALLOWED_ORIGINS=http://localhost:8080
```

**Run the API:**

```bash
python main.py
# or: uvicorn app.main:app --reload --port 8000
```

**Run the Celery worker — this is not optional:**

```bash
celery -A app.core.celery_app worker --loglevel=info -Q celery,analysis
# Windows also needs: --pool=solo
```

> Without a worker the API falls back to running analyses **in-process**. It
> logs a warning and still works, but each analysis occupies an API worker for
> its full duration and is lost on restart. Fine for a quick local look; not
> how you should run it.

Backend runs on `http://localhost:8000` — interactive docs at `/docs`.

### 4️⃣ Frontend

```bash
cd ../Frontend
npm install
cp .env.example .env
```

**Edit `Frontend/.env`:**

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

```bash
npm run dev
```

Frontend runs on `http://localhost:8080`.

> A **production** build with `VITE_API_BASE_URL` unset fails the build on
> purpose. It used to fall back to `localhost`, which meant the deployed site
> loaded and then every request quietly failed against the visitor's own
> machine.

### 5️⃣ GitHub App

RepoIQ uses a **GitHub App**, not an OAuth App. An OAuth App can only ask for
`repo` — full read *and write* access to every repository you can reach. A
GitHub App is installed per-repository with read-only contents, so RepoIQ can
never push, and it gets 5,000 requests/hour per installation instead of sharing
your personal rate limit.

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
2. **Callback URL**: `http://localhost:8080/auth/github/callback`
3. Enable **Request user authorization (OAuth) during installation**
4. **Repository permissions**: Contents `Read-only`, Metadata `Read-only`,
   Pull requests `Read-only`
5. **Account permissions**: Email addresses `Read-only`
6. Create the app, then note the **App ID**, **slug**, and **Client ID**
7. **Generate a client secret** and a **private key** (`.pem`) — GitHub shows
   each exactly once
8. Install the app on the repositories you want analysed

Load the private key into `.env` without pasting a multi-line PEM by hand:

```bash
python scripts/install_github_app_key.py path/to/key.pem
python scripts/install_github_app_key.py --client-secret
```

It validates the key, writes it in escaped form, and shreds the source file.

See `Backend/GITHUB_APP_MIGRATION.md` for the full rollout, including how to
add a production callback URL and retire any stored OAuth tokens.

---

## ⚙️ Configuration

Every setting below is read from the environment by `Backend/app/core/config.py`.
Nothing needs editing in code.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key — must be random and secret |
| `OPENAI_API_KEY` | Model provider key; the AI review fails loudly without it |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` | From the GitHub App |
| `GITHUB_APP_CLIENT_ID` / `GITHUB_APP_CLIENT_SECRET` | From the GitHub App |
| `GITHUB_APP_PRIVATE_KEY` | The `.pem`, escaped — use the installer script |
| `GITHUB_REDIRECT_URI` | Must match the App's callback URL exactly |

### Analysis

| Variable | Default | Description |
|----------|---------|-------------|
| `ANALYSIS_MAX_FILES` | `150` | Upper bound on files reviewed per run |
| `ANALYSIS_BATCH_SIZE` | `8` | Files per AI call — fewer is more accurate, slower |
| `ANALYSIS_MAX_FILE_BYTES` | `51200` | Files above this are skipped |
| `ANALYSIS_EXECUTION_MODE` | `auto` | `auto` \| `celery` \| `inline` |
| `OPENAI_MODEL` | `gpt-4o-mini` | Tokenizer follows this automatically |
| `OPENAI_DAILY_TOKEN_BUDGET_PER_USER` | `2000000` | Hard per-user daily ceiling |

### Security and limits

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-IP request ceiling |
| `ALLOWED_ORIGINS` | localhost set | Comma-separated CORS origins |
| `ADMIN_API_KEY` | unset | Gates ops endpoints; **unset disables them (404)** |
| `TOKEN_ENCRYPTION_KEY` | unset | Encrypts stored GitHub tokens at rest |
| `TRUSTED_PROXY_COUNT` | `0` | Hops to trust in `X-Forwarded-For` |
| `DEBUG` | `false` | Never enable in production |

### Cache TTLs

`CACHE_TTL_USER` (3600), `CACHE_TTL_REPOS` (600), `CACHE_TTL_FILES` (3600),
`CACHE_TTL_ANALYSIS` (86400), `CACHE_TTL_ISSUES` (3600) — seconds. Analyses and
issues are immutable once written, so they are cached for a day.

---

## 📊 How Scoring Works

The score is the product's headline number, so it is computed by one function —
`Backend/app/services/scoring.py` — that every analysis path calls. Full runs and
cache-warm incremental runs produce the same number for the same findings.

### From findings to a score

Each finding carries a severity, and severity carries a penalty:

| Severity | Penalty |
|----------|---------|
| Critical | 15 |
| High | 7 |
| Medium | 3 |
| Low | 1 |
| Info | 0 |

Penalties accumulate per dimension, then decay exponentially:

```
score = 100 × e^(−penalty / 60)
```

Exponential decay rather than `100 − penalty` because linear penalties saturate:
once you hit the floor, additional findings stop changing anything — precisely
the range where the difference matters most. Decay stays strictly monotonic
across the whole range and can never go negative.

```
1 critical  → 78      6 critical  → 22
3 critical  → 47     60 critical  →  0
```

### Combining dimensions

| Dimension | Weight |
|-----------|--------|
| Security | 35% |
| Quality | 30% |
| Architecture | 20% |
| Documentation | 15% |

The overall score is the weighted average **capped at 15 points above the
weakest dimension**. A weighted average alone let sixty critical vulnerabilities
sit behind three healthy dimensions and average out to 65 — a headline number
that actively reassures you about a repository that should alarm you. Stated
plainly: *a repository is never much better than its worst dimension.*

### What the score is computed from

Findings come from two sources:

- **The AI review** — batched model passes over the source. If every batch
  fails, the analysis is recorded as **failed**, not completed. A static-only
  pass is never presented as a finished review.
- **A static scanner** — regex rules for well-understood patterns
  (`shell=True`, f-string SQL, hardcoded secrets). Rules are gated by language,
  so Python rules do not fire on SQL or JavaScript, and each rule reports at
  most once per line.

The model's own self-assessment is deliberately discarded. Scores are derived
only from findings, so the same finding is never penalised twice and any number
can be explained by the list that produced it.

### A caveat worth knowing

An analysis reviews a **sample** — up to `ANALYSIS_MAX_FILES` (default 150),
chosen by importance. The result carries `files_analyzed` and
`ai_batches_succeeded` / `ai_batches_total` so partial coverage can be
disclosed. The score is absolute, not normalised by repository size: treat it
as a verdict on what was reviewed, not proof about every file in the repo.

---

## 📖 Usage

### Quick Start Guide

#### 1. **Login with GitHub**

![Login Page](pics/Loginpage.png)

1. Navigate to `http://localhost:8081`
2. Click **"Sign in with GitHub"**
3. Authorize RepoIQ to access your repositories
4. You'll be redirected to the homepage

#### 2. **Browse Your Repositories**

![Repositories Page](pics/repos_page.png)

1. Go to **Repositories** page from the navigation
2. View all your GitHub repositories
3. See sync status and last analysis date
4. Click on any repository to view details

#### 3. **Analyze Repository**

![Analysis Dashboard](pics/repoanalysisDasboard.png)

1. Select a repository from the list
2. Click **"Analyze Now"** button
3. Watch real-time progress in the dashboard
4. View live updates as analysis progresses
5. Results appear automatically when complete

#### 4. **Explore Analysis Results**

**📊 Dashboard Tab** - Overview with scores and metrics
- Overall health score
- Security, Quality, and Architecture scores
- Issue breakdown by severity
- Recent activity timeline

![Analysis Dashboard 2](pics/repoanalysisDashboard2.png)

**🐛 Issues Tab** - Detailed issue list with filters
- Filter by severity (Critical, High, Medium, Low)
- Filter by type (Security, Quality, Architecture)
- Search issues by description
- View code snippets and fix suggestions

![Issues Section](pics/issues%20section.png)

**📁 Files Tab** - File browser with issue counts
- Navigate repository structure
- See issue counts per file
- View file content with syntax highlighting
- Click files to see associated issues

![Files Section](pics/filesSection.png)

**📄 Documentation Tab** - Reports and architecture
- Full analysis report
- Bug report
- Architecture diagrams
- Downloadable PDFs

![Documentation Section](pics/DocumentationSection.png)

#### 5. **Generate & Download Reports**

![Bug Report](pics/BugsReport.png)

1. Navigate to **Documentation** tab
2. Click **"Download PDF Report"** for comprehensive analysis
3. Or click **"Download Bug Report PDF"** for focused bug report
4. Share reports with stakeholders or development teams

#### 6. **Manage Organizations & Teams**

![Organizations Page](pics/Organization_page.png)

**Organizations:**
- Create organizations to group repositories
- Monitor overall health across teams
- Compare team performance

![Teams Page](pics/Teams.png)

**Teams:**
- Create teams within organizations
- Add team members by name, username, or email
- Assign repositories to teams
- Track team performance metrics

![Team Performance](pics/TeamPerformance.png)

#### 7. **Executive Dashboard**

![Executive Dashboard](pics/Executive_Dashboard.png)

For organization owners and managers:
- Business risk score
- Compliance status
- Team leaderboards
- Top risk areas identification
- Trend analysis over time

---

## 🎨 UI/UX Features

### Animations & Graphics

**Framer Motion Animations:**
- ✨ Page transitions (fade, slide)
- 🎭 Component entry animations
- 🔄 Loading spinners
- 📊 Chart animations
- 🎯 Hover effects
- 💫 Gesture-based interactions

**Visual Design:**
- 🌓 Dark/Light mode toggle
- 🎨 Glass-morphism effects
- 🌈 Gradient backgrounds
- 📐 Responsive grid layouts
- 🖼️ Card-based design
- 🔔 Toast notifications

**Interactive Elements:**
- 🖱️ Smooth scrolling
- 📱 Touch gestures (mobile)
- ⌨️ Keyboard shortcuts
- 🔍 Live search
- 📊 Interactive charts
- 🎛️ Collapsible panels

---

## 📚 API Documentation

### REST API Endpoints

#### Authentication

```http
POST /api/v1/auth/github
Content-Type: application/json

{
  "code": "github_oauth_code"
}

Response: {
  "access_token": "jwt_token",
  "user": { ... }
}
```

#### Repositories

```http
GET /api/v1/github/repositories
Authorization: Bearer <token>

Response: [
  {
    "id": "repo_id",
    "name": "repo_name",
    "full_name": "user/repo",
    "language": "TypeScript",
    "last_analyzed": "2024-01-23T10:00:00Z"
  }
]
```

#### Analysis

```http
POST /api/v1/analysis/repositories/{repo_id}/analyze
Authorization: Bearer <token>

Response: {
  "analysis_id": "uuid",
  "status": "in_progress"
}
```

```http
GET /api/v1/analysis/repositories/{repo_id}/results
Authorization: Bearer <token>

Response: {
  "id": "analysis_id",
  "overall_score": 75,
  "security_score": 68,
  "quality_score": 80,
  "issues": [...],
  "total_issues": 24
}
```

#### Reports

```http
GET /api/v1/analysis/repositories/{repo_id}/architecture
Authorization: Bearer <token>

Response: {
  "repository_name": "MyRepo",
  "diagram": "ASCII diagram...",
  "file_count": 127
}
```

**Full API Documentation:** `http://localhost:8000/docs` (Swagger UI)

---

## 📁 Project Structure

```
RepoIQ/
├── Backend/
│   ├── app/
│   │   ├── agents/                  # AI Analysis Agents
│   │   │   ├── base_agent.py
│   │   │   ├── security_agent.py
│   │   │   ├── quality_agent.py
│   │   │   ├── architecture_agent.py
│   │   │   ├── documentation_agent.py
│   │   │   └── best_practices_agent.py
│   │   ├── api/
│   │   │   ├── routes/             # API Endpoints
│   │   │   │   ├── auth.py
│   │   │   │   ├── github.py
│   │   │   │   ├── analysis.py
│   │   │   │   └── chat.py
│   │   │   └── dependencies.py
│   │   ├── core/
│   │   │   ├── config.py           # Configuration
│   │   │   ├── logging.py          # Logging setup
│   │   │   └── security.py         # JWT handling
│   │   ├── middleware/
│   │   │   └── cache_middleware.py # Response caching
│   │   ├── services/
│   │   │   ├── github_service.py   # GitHub API
│   │   │   ├── repository_service.py
│   │   │   ├── cache_service.py
│   │   │   ├── redis_service.py
│   │   │   └── token_optimizer.py
│   │   ├── tasks/
│   │   │   ├── analysis_tasks.py   # Celery tasks
│   │   │   └── cache_warming.py
│   │   └── schemas/                # Pydantic models
│   ├── database/
│   │   └── schema.sql              # Database schema
│   ├── main.py                     # FastAPI app
│   └── requirements.txt
│
├── Frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/             # Layout components
│   │   │   │   ├── DashboardLayout.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   └── AccountDropdown.tsx
│   │   │   ├── ui/                 # Shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   └── ...
│   │   │   └── AnalysisHistoryModal.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Issues.tsx
│   │   │   ├── Files.tsx
│   │   │   ├── Documentation.tsx
│   │   │   └── Repositories.tsx
│   │   ├── stores/                 # Zustand stores
│   │   │   ├── analysisStore.ts
│   │   │   ├── repositoryStore.ts
│   │   │   └── uiStore.ts
│   │   ├── services/
│   │   │   ├── scanService.ts
│   │   │   ├── reportService.ts    # PDF generation
│   │   │   └── exportService.ts
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx
│   │   │   └── useDebouncedSearch.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # API client
│   │   │   └── utils.ts
│   │   ├── utils/
│   │   │   └── throttle.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
├── README.md
└── LICENSE
```

---

## 🎯 Key Features Deep Dive

### 1. **AI Analysis Engine**

RepoIQ uses a multi-agent system where each agent specializes in a specific aspect:

```python
# Security Agent detects:
- SQL Injection (concat, format, f-string)
- XSS vulnerabilities
- CSRF issues
- Insecure dependencies
- Weak cryptography
- Authentication flaws

# Quality Agent detects:
- Code complexity (cyclomatic)
- Long functions/classes
- Dead code
- Code duplication
- Naming violations
- Missing error handling

# Architecture Agent detects:
- High coupling
- Low cohesion
- Missing design patterns
- Circular dependencies
- Monolithic structure

# Best Practices Agent detects:
- Missing rate limiting
- No caching implementation
- Missing debouncing
- No pagination
- Missing logging
- Hardcoded credentials
```

### 2. **Smart Token Optimization**

For large repositories, RepoIQ uses TOON (Token Optimization) to compress code:

```python
# Before (2000 tokens)
def calculate_total_price(items: List[Item]) -> float:
    """
    Calculate the total price of all items.
    
    Args:
        items: List of Item objects
        
    Returns:
        Total price as float
    """
    total = 0.0
    for item in items:
        total += item.price
    return total

# After TOON (300 tokens)
def calc_total(items):total=0;[total:=total+i.price for i in items];return total
```

### 3. **Real-Time Progress**

Uses Server-Sent Events (SSE) for live updates:

```typescript
// Frontend receives real-time updates
EventSource → Backend analysis progress
└─> 10% Files fetched
└─> 30% Security analysis
└─> 60% Quality analysis
└─> 90% Generating report
└─> 100% Complete!
```

### 4. **Intelligent Caching**

Three-layer caching strategy:

```
Layer 1: Browser SessionStorage (instant)
Layer 2: Redis Cache (< 100ms)
Layer 3: Database (< 500ms)
```

---

## 🔧 Development

### Running Tests

```bash
cd Backend
pytest                                   # 386 tests
pytest tests/test_scoring.py -v          # scoring properties
pytest tests/test_analysis_integrity.py  # scanner precision, failure honesty
```

Tests are hermetic: `conftest.py` points `REPOIQ_ENV_FILE` at a path that does
not exist, so a stray `.env` cannot change a result. Fixtures that truncate
tables assert they are pointed at a disposable database first — an earlier
version wiped the development database.

If you want the database-backed tests, create the test database once:

```bash
docker exec repoiq-postgres psql -U repoiq -d postgres -c "CREATE DATABASE repoiq_test;"
docker exec -i repoiq-postgres psql -U repoiq -d repoiq_test < Backend/database/postgres_schema.sql
```

```bash
cd Frontend
npx tsc --noEmit    # typecheck
npm run build       # production build
```

### Code Quality

```bash
# Backend linting
flake8 app/
black app/

# Frontend linting
npm run lint
npm run format
```

### Building for Production

```bash
# Frontend build
cd Frontend
npm run build

# Backend (uses Uvicorn)
cd Backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Code Standards

- Follow TypeScript/Python best practices
- Write meaningful commit messages
- Add tests for new features
- Update documentation
- Follow existing code style

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Taha Hasan**

- GitHub: [@tahahasan01](https://github.com/tahahasan01)
- Email: tahahasan279@gmail.com

---

## 🙏 Acknowledgments

- **OpenAI** - GPT-4 API for intelligent code analysis
- **GitHub** - OAuth and API for repository access
- **PostgreSQL** - Database
- **Vercel** - Inspiration for UI/UX design
- **Shadcn/ui** - Beautiful component library

---

## 📊 Project Stats

![GitHub repo size](https://img.shields.io/github/repo-size/tahahasan01/RepoIQ)
![GitHub last commit](https://img.shields.io/github/last-commit/tahahasan01/RepoIQ)
![GitHub issues](https://img.shields.io/github/issues/tahahasan01/RepoIQ)
![GitHub stars](https://img.shields.io/github/stars/tahahasan01/RepoIQ?style=social)

---

## 🚀 Roadmap

- [ ] Multi-language support (Python, Java, Go, Rust)
- [ ] VS Code extension
- [ ] GitHub App integration
- [ ] Team collaboration features
- [ ] Custom rule engine
- [ ] CI/CD integration
- [ ] Slack/Discord notifications
- [ ] Performance benchmarking
- [ ] Code fix suggestions (auto-PR)
- [ ] Security score trending

---

<div align="center">

**Made with ❤️ using React, FastAPI, and AI**

[⬆ Back to Top](#-repoiq)

</div>
