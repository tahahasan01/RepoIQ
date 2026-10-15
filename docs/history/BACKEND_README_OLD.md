# CodeRabbit AI - AI-Powered GitHub Code Review Platform

A production-ready, scalable backend for an AI-powered GitHub code review platform built with FastAPI, Supabase, and OpenAI.

## Features

### 🔐 Authentication & User Management
- GitHub OAuth integration
- Email/password authentication via Supabase
- JWT token-based authentication
- Profile management with image uploads
- Account deletion

### 🔗 GitHub Integration
- Connect GitHub account
- Sync repositories automatically
- Fetch repository metadata and content
- Create pull requests for auto-fixes

### 🤖 Multi-Agent AI System
Powered by OpenAI with LangChain orchestration:

1. **Security Agent** - Detects OWASP Top 10, authentication flaws, hard-coded secrets
2. **Code Quality Agent** - Identifies code smells, anti-patterns, and maintainability issues
3. **Architecture Agent** - Analyzes project structure, design patterns, and scalability
4. **Documentation Agent** - Generates README, API docs, and code comments
5. **Conversational Agent** - Interactive chat about codebase, debugging, and fixes

### 📊 Repository Analysis
- Overall repository scoring (0-100)
- Individual scores for security, quality, architecture, and documentation
- Risk level assessment (critical, high, medium, low)
- Issue detection with severity levels
- Auto-fix suggestions
- Improvement roadmap generation
- Risk heatmaps

### 📈 Advanced Features
- Repository health history tracking
- Analysis comparison over time
- Smart incremental analysis
- Cost-efficient token usage
- Background task processing
- Comprehensive error handling

## Tech Stack

- **Framework**: FastAPI 0.109+
- **Database**: PostgreSQL (via Supabase)
- **ORM**: SQLAlchemy 2.0 (async)
- **Authentication**: Supabase Auth + JWT
- **AI**: OpenAI GPT-4, LangChain
- **GitHub**: PyGithub, OAuth
- **Storage**: Supabase Storage
- **Background Tasks**: Celery + Redis
- **Logging**: Loguru

## Project Structure

```
coderabbit-backend/
├── app/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py           # Authentication endpoints
│   │   │   ├── users.py          # User management
│   │   │   ├── repositories.py   # Repository management
│   │   │   ├── analysis.py       # Analysis endpoints
│   │   │   └── chat.py           # Chat with AI
│   │   └── dependencies.py       # Shared dependencies
│   ├── core/
│   │   ├── config.py             # Application configuration
│   │   └── security.py           # Security utilities
│   ├── db/
│   │   ├── database.py           # Database connection
│   │   └── supabase.py           # Supabase client
│   ├── models/
│   │   └── models.py             # SQLAlchemy models
│   ├── schemas/
│   │   └── schemas.py            # Pydantic schemas
│   ├── services/
│   │   ├── agents/               # AI Agents
│   │   │   ├── base_agent.py    # Base agent class
│   │   │   ├── security_agent.py
│   │   │   ├── code_quality_agent.py
│   │   │   ├── architecture_agent.py
│   │   │   ├── documentation_agent.py
│   │   │   └── conversational_agent.py
│   │   ├── analysis/
│   │   │   └── analysis_service.py  # Analysis orchestration
│   │   └── github/
│   │       └── github_service.py    # GitHub API wrapper
├── tests/                        # Test suite
├── scripts/                      # Utility scripts
├── main.py                       # Application entry point
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment template
└── README.md                     # This file
```

## Installation & Setup

### Prerequisites
- Python 3.11+
- PostgreSQL (via Supabase)
- Redis (for background tasks)
- GitHub OAuth App
- OpenAI API key
- Supabase account

### 1. Clone and Setup

```bash
# Extract the ZIP file
unzip coderabbit-backend.zip
cd coderabbit-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env and fill in your credentials
nano .env
```

Required environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Supabase anon/public key
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `DATABASE_URL` - PostgreSQL connection string
- `GITHUB_CLIENT_ID` - GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth app secret
- `OPENAI_API_KEY` - OpenAI API key
- `SECRET_KEY` - JWT secret (generate with `openssl rand -hex 32`)
- `REDIS_URL` - Redis connection URL

### 3. Database Setup

The application will automatically create tables on first run. Alternatively, you can use Alembic for migrations:

```bash
# Initialize Alembic (if needed)
alembic init alembic

# Create migration
alembic revision --autogenerate -m "Initial migration"

# Run migration
alembic upgrade head
```

### 4. GitHub OAuth Setup

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create new OAuth App
3. Set Authorization callback URL to: `http://localhost:8000/api/v1/auth/github/callback`
4. Copy Client ID and Secret to `.env`

### 5. Supabase Setup

1. Create a new Supabase project
2. Create a storage bucket named `profile-images` (public)
3. Copy the project URL and keys to `.env`
4. The database tables will be created automatically

## Running the Application

### Development Mode

```bash
# Start Redis (if running locally)
redis-server

# Start the application
python main.py

# Or use uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode

```bash
# Using uvicorn with workers
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Or using gunicorn
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### With Docker (Optional)

```bash
# Build image
docker build -t coderabbit-backend .

# Run container
docker run -p 8000:8000 --env-file .env coderabbit-backend
```

## API Documentation

Once running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - Sign up new user
- `POST /api/v1/auth/login` - Login with credentials
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/github` - Get GitHub OAuth URL
- `GET /api/v1/auth/github/callback` - GitHub OAuth callback

### Users
- `GET /api/v1/users/me` - Get current user profile
- `PUT /api/v1/users/me` - Update profile
- `POST /api/v1/users/me/change-password` - Change password
- `POST /api/v1/users/me/profile-image` - Upload profile image
- `DELETE /api/v1/users/me` - Delete account

### Repositories
- `POST /api/v1/repositories/sync` - Sync GitHub repositories
- `GET /api/v1/repositories` - List repositories (with filters)
- `GET /api/v1/repositories/{id}` - Get repository details
- `DELETE /api/v1/repositories/{id}` - Delete repository

### Analysis
- `POST /api/v1/analysis/analyze` - Start repository analysis
- `GET /api/v1/analysis/repository/{id}` - List repository analyses
- `GET /api/v1/analysis/{id}` - Get analysis results
- `POST /api/v1/analysis/auto-fix` - Apply auto-fixes
- `GET /api/v1/analysis/repository/{id}/comparison` - Compare over time
- `GET /api/v1/analysis/repository/{id}/health` - Get health history

### Chat
- `POST /api/v1/chat/sessions` - Create chat session
- `GET /api/v1/chat/sessions` - List chat sessions
- `GET /api/v1/chat/sessions/{id}` - Get session with messages
- `POST /api/v1/chat/sessions/{id}/messages` - Send message
- `DELETE /api/v1/chat/sessions/{id}` - Delete session

## Usage Examples

### 1. Sign Up and Login

```bash
# Sign up
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "full_name": "John Doe"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

### 2. Connect GitHub

```bash
# Get GitHub OAuth URL
curl http://localhost:8000/api/v1/auth/github

# User visits the URL, authorizes, gets redirected to callback
# Backend exchanges code for token and creates/updates user
```

### 3. Sync Repositories

```bash
curl -X POST http://localhost:8000/api/v1/repositories/sync \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 4. Analyze Repository

```bash
curl -X POST http://localhost:8000/api/v1/analysis/analyze \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repository_id": "REPO_UUID", "force_full": false}'
```

### 5. Chat with AI

```bash
# Create session
curl -X POST http://localhost:8000/api/v1/chat/sessions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repository_id": "REPO_UUID", "title": "Code Review Chat"}'

# Send message
curl -X POST http://localhost:8000/api/v1/chat/sessions/SESSION_UUID/messages \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Explain the authentication flow in this codebase"}'
```

## Configuration

### Agent Configuration

Adjust agent behavior in `.env`:
- `AGENT_TIMEOUT` - Maximum time per agent (seconds)
- `MAX_CONCURRENT_AGENTS` - Number of agents to run in parallel
- `ENABLE_AUTO_FIX` - Enable/disable auto-fix feature
- `MAX_FILES_PER_ANALYSIS` - Limit files analyzed per run

### Cost Optimization

- `ENABLE_COST_OPTIMIZATION` - Enable token usage optimization
- Agents automatically truncate large files
- Smart caching of analysis results
- Incremental analysis for subsequent runs

## Development

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run tests
pytest

# With coverage
pytest --cov=app tests/
```

### Code Quality

```bash
# Format code
black app/

# Lint
pylint app/

# Type checking
mypy app/
```

## Deployment

### Railway / Render / Heroku

1. Add `Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

2. Set environment variables in platform dashboard
3. Deploy from GitHub repository

### AWS / GCP / Azure

1. Use Docker image
2. Deploy to container service (ECS, Cloud Run, Container Apps)
3. Configure environment variables
4. Set up load balancer and auto-scaling

### DigitalOcean App Platform

1. Connect GitHub repository
2. Configure build command: `pip install -r requirements.txt`
3. Configure run command: `uvicorn main:app --host 0.0.0.0 --port 8080`
4. Add environment variables

## Security Considerations

- Never commit `.env` file
- Use strong `SECRET_KEY`
- Enable HTTPS in production
- Rotate GitHub OAuth secrets regularly
- Monitor API usage and costs
- Implement rate limiting
- Use Supabase RLS policies
- Validate all user inputs

## Monitoring & Logging

Logs are output via Loguru. Configure log level in `.env`:

```bash
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

Optional: Integrate Sentry for error tracking:

```bash
SENTRY_DSN=your-sentry-dsn
```

## Contributing

This is a production-ready starter template. To extend:

1. Add new agents in `app/services/agents/`
2. Register agents in `analysis_service.py`
3. Create new routes in `app/api/routes/`
4. Add tests in `tests/`

## License

MIT License - Feel free to use in your projects!

## Support

For issues and questions:
- Check the `/docs` endpoint for API documentation
- Review logs in `logs/` directory
- Enable DEBUG mode for detailed error messages

## Roadmap

Future enhancements:
- [ ] Webhook integration for automatic analysis
- [ ] Multi-repository comparison
- [ ] Team collaboration features
- [ ] Custom agent creation
- [ ] Integration with CI/CD pipelines
- [ ] Advanced metrics dashboard
- [ ] Code pattern detection
- [ ] Technical debt tracking

---

**Built with ❤️ using FastAPI, Supabase, and OpenAI**
