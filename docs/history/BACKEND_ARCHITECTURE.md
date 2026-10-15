# System Architecture

## Overview

CodeRabbit AI is a microservices-oriented backend built with FastAPI, designed for scalability, maintainability, and extensibility. The system follows clean architecture principles with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway (FastAPI)                    │
│                     CORS, Auth, Rate Limiting                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
┌───────────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐
│  Auth Routes     │ │  Repo Routes │ │ Analysis Routes │
│  - Signup        │ │  - Sync      │ │  - Analyze      │
│  - Login         │ │  - List      │ │  - Results      │
│  - GitHub OAuth  │ │  - Details   │ │  - Auto-fix     │
└────────┬─────────┘ └──────┬───────┘ └──────┬──────────┘
         │                  │                 │
         └──────────────────┼─────────────────┘
                            │
                ┌───────────▼──────────────┐
                │   Service Layer          │
                │  - GitHub Service        │
                │  - Analysis Service      │
                │  - Agent Orchestrator    │
                └───────────┬──────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
┌───────────▼───┐  ┌───────▼────────┐  ┌──▼──────────┐
│  Multi-Agent  │  │  GitHub API    │  │  Database   │
│  AI System    │  │  Integration   │  │  (Supabase) │
│               │  └────────────────┘  └─────────────┘
│ - Security    │
│ - Quality     │
│ - Architecture│
│ - Docs        │
│ - Chat        │
└───────┬───────┘
        │
┌───────▼───────┐
│  OpenAI API   │
│  (GPT-4)      │
└───────────────┘
```

## Core Components

### 1. API Layer (`app/api/`)

**Responsibilities:**
- Request/response handling
- Input validation
- Authentication/authorization
- Error handling
- Route organization

**Key Files:**
- `routes/auth.py` - Authentication endpoints
- `routes/users.py` - User management
- `routes/repositories.py` - Repository CRUD
- `routes/analysis.py` - Analysis orchestration
- `routes/chat.py` - Conversational AI
- `dependencies.py` - Shared dependencies

**Design Patterns:**
- Dependency injection for database sessions and auth
- Route grouping by domain
- Consistent response schemas

### 2. Service Layer (`app/services/`)

**Responsibilities:**
- Business logic implementation
- External API integration
- Agent orchestration
- Complex workflows

**Components:**

#### GitHub Service (`github/github_service.py`)
- OAuth flow management
- Repository operations
- Content fetching
- PR creation

#### Analysis Service (`analysis/analysis_service.py`)
- Orchestrates multi-agent analysis
- Manages analysis lifecycle
- Aggregates results
- Calculates scores and metrics

#### Agent System (`agents/`)
- **Base Agent** - Abstract base class for all agents
- **Security Agent** - OWASP Top 10, vulnerability detection
- **Code Quality Agent** - Code smells, best practices
- **Architecture Agent** - Structure analysis, patterns
- **Documentation Agent** - Doc generation, coverage
- **Conversational Agent** - Chat, Q&A, code fixes

### 3. Data Layer (`app/db/`, `app/models/`)

**Database Models:**
```
User
├── email, password_hash
├── github_id, github_access_token
└── profile_image_url

Repository
├── github_id, name, full_name
├── language, languages, size
└── is_analyzed, last_analyzed_at

RepositoryAnalysis
├── commit_sha, branch, status
├── scores (overall, security, quality, etc.)
├── issues (security, quality, architecture)
└── recommendations, roadmap

AgentExecution
├── agent_type, agent_name
├── input_data, output_data
└── execution_duration, tokens_used

ChatSession
├── user_id, repository_id
└── title, is_active

ChatMessage
├── session_id, role
├── content, metadata
└── code_changes

RepositoryHealth
├── timestamp, scores
└── issue counts by severity
```

**Key Features:**
- Async SQLAlchemy for non-blocking DB operations
- Cascade deletes for data integrity
- Indexed foreign keys for performance
- JSON columns for flexible data

### 4. Schema Layer (`app/schemas/`)

**Pydantic Schemas:**
- Request validation
- Response serialization
- Type safety
- Automatic API documentation

**Organization:**
- Input schemas (Create, Update)
- Output schemas (Response models)
- Enums for constants
- Nested schemas for complex objects

## Multi-Agent AI System

### Agent Architecture

```
┌─────────────────────────────────────────┐
│         Agent Orchestrator              │
│  - Registers agents                     │
│  - Manages concurrent execution         │
│  - Aggregates results                   │
└────────────┬────────────────────────────┘
             │
    ┌────────┼────────┐
    │        │        │
┌───▼───┐ ┌──▼──┐ ┌──▼───┐
│Security│ │Quality│ │Arch  │
│ Agent  │ │Agent │ │Agent │
└───┬────┘ └──┬───┘ └──┬───┘
    │         │        │
    └─────────┼────────┘
              │
         ┌────▼─────┐
         │ OpenAI   │
         │   API    │
         └──────────┘
```

### Agent Design

Each agent inherits from `BaseAgent` and implements:

```python
class CustomAgent(BaseAgent):
    async def analyze(self, context: Dict) -> Dict:
        # 1. Prepare analysis context
        # 2. Call LLM with specialized prompt
        # 3. Parse and structure results
        # 4. Return findings
        pass
```

**Benefits:**
- Modular and extensible
- Parallel execution
- Individual error handling
- Token tracking per agent
- Reusable across different contexts

### Agent Orchestration

**Parallel Execution:**
```python
results = await orchestrator.run_all_agents(
    context=analysis_context,
    parallel=True
)
```

**Sequential Execution:**
```python
results = await orchestrator.run_all_agents(
    context=analysis_context,
    parallel=False
)
```

**Selective Execution:**
```python
results = await orchestrator.run_specific_agents(
    agent_types=["security", "quality"],
    context=analysis_context
)
```

## Data Flow

### Repository Analysis Flow

```
1. User requests analysis
   ↓
2. Verify repository access
   ↓
3. Create analysis record (status: processing)
   ↓
4. Fetch repository files from GitHub
   ↓
5. Prepare analysis context
   ↓
6. Run agents in parallel
   │
   ├─→ Security Agent → OpenAI → Security results
   ├─→ Quality Agent → OpenAI → Quality results
   ├─→ Architecture Agent → OpenAI → Architecture results
   └─→ Documentation Agent → OpenAI → Documentation results
   ↓
7. Aggregate results
   ↓
8. Calculate scores and metrics
   ↓
9. Store agent executions
   ↓
10. Update analysis (status: completed)
    ↓
11. Create health snapshot
    ↓
12. Return analysis results
```

### Chat Flow

```
1. User sends message
   ↓
2. Load chat session
   ↓
3. Save user message
   ↓
4. Fetch repository context (if applicable)
   ↓
5. Build conversation history
   ↓
6. Call Conversational Agent
   ↓
7. OpenAI generates response
   ↓
8. Save assistant message
   ↓
9. Return response to user
```

## Scalability Considerations

### Horizontal Scaling

**Stateless Design:**
- No in-memory session storage
- Database-backed sessions
- Token-based authentication
- Can run multiple instances

**Load Balancing:**
```
┌─────────┐
│  Nginx  │
│   LB    │
└────┬────┘
     │
     ├─→ FastAPI Instance 1
     ├─→ FastAPI Instance 2
     ├─→ FastAPI Instance 3
     └─→ FastAPI Instance N
```

### Vertical Scaling

**Resource Optimization:**
- Async I/O throughout
- Connection pooling
- Query optimization
- Caching with Redis

### Background Processing

**Celery Integration (Optional):**
```python
# Long-running analyses
background_tasks.add_task(
    analysis_service.analyze_repository,
    db, user_id, repo_id, token
)
```

**Benefits:**
- Non-blocking API responses
- Queue management
- Retry mechanisms
- Scheduled tasks

## Security Architecture

### Authentication Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 1. POST /auth/login
     ↓
┌────▼─────┐
│   API    │
└────┬─────┘
     │ 2. Verify credentials
     ↓
┌────▼─────┐
│ Database │
└────┬─────┘
     │ 3. User found
     ↓
┌────▼─────┐
│   API    │ 4. Generate JWT
└────┬─────┘
     │ 5. Return tokens
     ↓
┌────▼─────┐
│  Client  │ 6. Store tokens
└──────────┘
```

### Authorization

**Dependency Chain:**
```python
@router.get("/protected")
async def protected_route(
    user: User = Depends(get_current_user)
):
    # user is automatically verified
    pass
```

**Token Validation:**
1. Extract token from Authorization header
2. Decode and verify signature
3. Check expiration
4. Load user from database
5. Verify user is active

### Data Protection

- Passwords hashed with bcrypt
- JWT tokens for stateless auth
- HTTPS required in production
- CORS configured
- SQL injection prevention via ORM
- Input validation with Pydantic

## Performance Optimization

### Database Queries

**Async Queries:**
```python
async with db.begin():
    result = await db.execute(
        select(Repository)
        .where(Repository.user_id == user_id)
        .options(selectinload(Repository.analyses))
    )
```

**Indexes:**
- Foreign keys indexed
- Email indexed for user lookup
- Composite indexes for common queries

### Caching Strategy

**Redis Caching (Planned):**
- Repository metadata
- Analysis results
- GitHub API responses
- Rate limit tracking

### Token Usage Optimization

**Smart Context Management:**
- Truncate large files (> 2000 chars)
- Limit files per analysis
- Incremental analysis support
- Context windowing

## Error Handling

### Layered Approach

1. **Route Level** - HTTP exceptions
2. **Service Level** - Business logic errors
3. **Agent Level** - AI/API failures
4. **Global Handler** - Catch-all

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "details": {
    "field": "Additional context"
  }
}
```

## Monitoring & Observability

### Logging

**Loguru Integration:**
- Structured logging
- Log levels (DEBUG, INFO, WARNING, ERROR)
- Request/response logging
- Error tracebacks

### Metrics (Planned)

- Request count by endpoint
- Response times
- Error rates
- Agent execution times
- Token usage
- Cost tracking

### Health Checks

- `/health` - Application health
- Database connectivity
- Redis connectivity
- External API availability

## Deployment Architecture

### Production Setup

```
┌──────────────┐
│ Load Balancer│
│   (Nginx)    │
└──────┬───────┘
       │
   ┌───┴────┐
   │        │
┌──▼──┐  ┌─▼───┐
│ API │  │ API │  (Multiple instances)
└──┬──┘  └─┬───┘
   │       │
   └───┬───┘
       │
   ┌───▼──────┐
   │ Database │
   │(Supabase)│
   └──────────┘
```

### Environment Separation

- **Development** - Local with Docker
- **Staging** - Pre-production testing
- **Production** - Scalable cloud deployment

## Future Enhancements

1. **WebSocket Support** - Real-time analysis updates
2. **GraphQL API** - Flexible querying
3. **Webhook System** - Event-driven analysis
4. **Multi-tenancy** - Team organizations
5. **Advanced Caching** - Redis integration
6. **Message Queue** - RabbitMQ/Kafka for events
7. **Metrics Dashboard** - Prometheus + Grafana
8. **CI/CD Pipeline** - Automated testing and deployment

## Best Practices Implemented

- ✅ Clean architecture with layer separation
- ✅ Dependency injection
- ✅ Async/await throughout
- ✅ Type hints everywhere
- ✅ Comprehensive error handling
- ✅ Input validation with Pydantic
- ✅ Database migrations ready
- ✅ Docker support
- ✅ Environment-based configuration
- ✅ Logging and monitoring hooks
- ✅ RESTful API design
- ✅ OpenAPI documentation
- ✅ Security best practices
