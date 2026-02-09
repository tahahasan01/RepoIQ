# ⚡ RepoIQ

<div align="center">

![RepoIQ Banner](https://img.shields.io/badge/RepoIQ-AI%20Powered%20Code%20Analysis-blue?style=for-the-badge&logo=react)

**AI-Powered Repository Analysis & Code Quality Platform**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)

[Features](#-features) • [Demo & Screenshots](#-demo) • [Tech Stack](#-tech-stack) • [Installation](#-installation) • [Usage](#-usage) • [API](#-api-documentation)

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
| **Supabase** | 2.9.1 | Database | PostgreSQL, Auth, Storage |
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
│ • Supabase   │    │ • Quality    │    │  Redis       │
│ • Cache      │    │ • Architecture│   │              │
│ • Repository │    │ • Documentation│  │ Background   │
│              │    │ • Best Practices│ │ Analysis     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Data Layer (Supabase PostgreSQL)            │
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
2. **Repository Sync**: GitHub API → Supabase → Frontend cache
3. **Analysis Trigger**: User action → Celery task → Background processing
4. **AI Analysis**: Code → OpenAI GPT-4 → Structured results
5. **Results Storage**: Issues → Supabase → Redis cache → Frontend
6. **Report Generation**: Analysis data → PDF rendering → Download

---

## 🚀 Installation

### Prerequisites

- **Node.js** >= 18.0.0
- **Python** >= 3.11
- **Redis** >= 6.0 (for caching)
- **Git**
- **GitHub Account** (for OAuth)
- **OpenAI API Key** (for AI analysis)
- **Supabase Account** (for database)

### 1️⃣ Clone Repository

```bash
git clone https://github.com/tahahasan01/RepoIQ.git
cd RepoIQ
```

### 2️⃣ Backend Setup

```bash
cd Backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

**Edit `Backend/.env`:**

```env
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
DATABASE_URL=your_database_url

# Authentication
JWT_SECRET=your_random_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/v1/auth/github/callback

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Redis
REDIS_URL=redis://localhost:6379/0

# CORS
CORS_ORIGINS=["http://localhost:8081"]

# Server
DEBUG=false
LOG_LEVEL=INFO
```

**Start Redis:**

```bash
# Windows (with Docker)
docker run -d -p 6379:6379 redis:latest

# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

**Run Backend:**

```bash
python main.py
```

Backend will run on `http://localhost:8000`

### 3️⃣ Frontend Setup

```bash
cd ../Frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Edit `Frontend/.env`:**

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_GITHUB_CLIENT_ID=your_github_client_id
VITE_GITHUB_REDIRECT_URI=http://localhost:8081/auth/github/callback
```

**Run Frontend:**

```bash
npm run dev
```

Frontend will run on `http://localhost:8081`

### 4️⃣ GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: RepoIQ
   - **Homepage URL**: `http://localhost:8081`
   - **Authorization callback URL**: `http://localhost:8081/auth/github/callback`
4. Copy **Client ID** and **Client Secret**
5. Add to both Backend and Frontend `.env` files

### 5️⃣ Supabase Setup

1. Create account at [Supabase](https://supabase.com)
2. Create new project
3. Go to **Settings** → **API**
4. Copy **URL** and **anon/public key**
5. Run database migrations (SQL scripts in `Backend/database/`)

---

## ⚙️ Configuration

### Environment Variables

#### Backend Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SUPABASE_URL` | Supabase project URL | ✅ | - |
| `SUPABASE_KEY` | Supabase API key | ✅ | - |
| `JWT_SECRET` | Secret for JWT tokens | ✅ | - |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | ✅ | - |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret | ✅ | - |
| `OPENAI_API_KEY` | OpenAI API key | ✅ | - |
| `REDIS_URL` | Redis connection URL | ✅ | redis://localhost:6379 |
| `DEBUG` | Enable debug mode | ❌ | false |
| `LOG_LEVEL` | Logging level | ❌ | INFO |

#### Frontend Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API URL | ✅ | http://localhost:8000/api/v1 |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth client ID | ✅ | - |

### Advanced Configuration

**Cache Settings** (`Backend/app/core/config.py`):
```python
CACHE_TTL = 3600  # 1 hour
CACHE_ENABLED = True
```

**Analysis Settings** (`Backend/app/tasks/analysis_tasks.py`):
```python
MAX_FILES = 15  # Files per analysis
MAX_TOKENS = 8000  # Per file
TIMEOUT = 90  # Seconds
```

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
# Backend tests
cd Backend
pytest

# Frontend tests
cd Frontend
npm test
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
- **Supabase** - Database and authentication
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
