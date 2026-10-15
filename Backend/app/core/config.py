import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Literal, Optional
from functools import lru_cache
from urllib.parse import urlparse

# HS256 keys shorter than this are brute-forceable offline from a single token.
MIN_SECRET_LENGTH = 32

# Fragments of the placeholder values shipped in .env.example, the docs and the
# test suite. A deploy that copied one of those verbatim has a public secret.
_PLACEHOLDER_MARKERS = (
    "change-this", "change_this", "changeme", "change-me", "change_me",
    "your-", "your_", "placeholder", "example", "test_secret", "dev_secret",
)

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _looks_like_placeholder(value: Optional[str]) -> bool:
    lowered = (value or "").lower()
    return any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


def _real_value(value: Optional[str]) -> bool:
    """Set to something other than whitespace or a copied placeholder."""
    return bool(value and value.strip()) and not _looks_like_placeholder(value)


def _is_public_https(url: Optional[str]) -> bool:
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and bool(host) and host not in _LOCAL_HOSTS


def _origin_problems(allowed_origins: str) -> List[str]:
    origins = [o.strip() for o in (allowed_origins or "").split(",") if o.strip()]
    if not origins:
        return ["ALLOWED_ORIGINS must list the frontend's https:// origin(s)"]
    # Credentialed CORS: an allowed origin can read every authenticated
    # response, so a leftover dev origin is a real exposure, not just noise.
    bad = [o for o in origins if o == "*" or not _is_public_https(o) or _looks_like_placeholder(o)]
    if bad:
        return [
            "ALLOWED_ORIGINS must contain only public https:// origins; "
            f"remove {', '.join(bad)}"
        ]
    return []


class Settings(BaseSettings):
    # App settings
    APP_NAME: str = "RepoIQ"
    APP_ENV: str = "development"
    DEBUG: bool = False  # SECURITY: Default to False for production safety
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    
    # PostgreSQL. Replaces the three SUPABASE_* settings.
    #
    # Supabase was doing three separate jobs: a database, an auth provider and a
    # file store. Those are now Postgres, app/services/local_auth.py and
    # app/services/local_storage.py respectively.
    DATABASE_URL: str = "postgresql://repoiq:repoiq_dev@localhost:5432/repoiq"

    # Pool sizing matters now in a way it did not with PostgREST, where a
    # "connection" was just an HTTP request. Postgres has a hard max_connections
    # (100 by default) shared across every API worker AND every Celery worker,
    # so this is set deliberately: WORKERS x DB_POOL_MAX_SIZE must stay well
    # under it, with headroom for the workers and for psql sessions.
    DB_POOL_MIN_SIZE: int = 2
    DB_POOL_MAX_SIZE: int = 10
    DB_POOL_TIMEOUT: float = 10.0
    
    GITHUB_CLIENT_ID: str
    GITHUB_CLIENT_SECRET: str
    GITHUB_REDIRECT_URI: str

    # OAuth scopes requested at login.
    #
    # `repo` is required and cannot be narrowed further with an OAuth App:
    #   - the product analyses PRIVATE repositories, and an OAuth App has no
    #     read-only private-repo scope. `public_repo` covers public repos only;
    #     `repo` is the minimum that can read a private one.
    #   - auto-fix creates branches, commits files and opens pull requests
    #     (GitHubService.create_branch / update_file / create_pull_request),
    #     which needs write access regardless.
    #
    # This does mean the stored token can write to every repository the user can
    # reach, which is why encryption-at-rest (TOKEN_ENCRYPTION_KEY) and keeping
    # the token out of task queues and API responses matter as much as they do.
    #
    # The real least-privilege fix is migrating to a GitHub App, which supports
    # fine-grained per-repository permissions (Contents: read, Pull requests:
    # write) and short-lived installation tokens. That is an app-registration
    # change, not a config change - tracked as a follow-up in REMEDIATION_PLAN.md.
    #
    # Deployments that only ever analyse public repositories can safely set
    # GITHUB_OAUTH_SCOPES="public_repo read:user user:email".
    GITHUB_OAUTH_SCOPES: str = "repo read:user user:email"

    # --- GitHub App (the least-privilege alternative to the above) -----------
    #
    # "oauth" (default) uses the OAuth App path described above.
    # "app"   uses a GitHub App: per-permission, per-repository grants and
    #         1-hour installation tokens, with nothing long-lived stored at rest.
    #
    # Switching requires registering an app under your GitHub account and
    # setting the three values below. See Backend/GITHUB_APP_MIGRATION.md.
    GITHUB_AUTH_MODE: str = "oauth"
    GITHUB_APP_ID: Optional[str] = None
    GITHUB_APP_SLUG: Optional[str] = None
    # A GitHub App has its OWN client id/secret, distinct from the OAuth App's.
    # They must be separate settings rather than reusing GITHUB_CLIENT_ID/SECRET,
    # because during migration both paths run at once: existing users still
    # authenticate against the OAuth App while new users install the GitHub App.
    # Sharing one pair would break whichever cohort was not currently configured.
    # Falls back to the OAuth values when unset, so a deployment that has fully
    # cut over does not need to set them twice.
    GITHUB_APP_CLIENT_ID: Optional[str] = None
    GITHUB_APP_CLIENT_SECRET: Optional[str] = None
    # PEM private key. Secret stores usually cannot hold real newlines, so an
    # escaped-newline form is accepted and normalised.
    GITHUB_APP_PRIVATE_KEY: Optional[str] = None
    
    # Which client the agents call Claude through.
    #   "anthropic"        - the Anthropic API with ANTHROPIC_API_KEY. The only
    #                        option for a deployed service.
    #   "claude_agent_sdk" - LOCAL DEVELOPMENT ONLY. Runs requests through the
    #                        Claude Code CLI with the developer's own Claude
    #                        login, so analysis can be exercised locally without
    #                        an API key. Refused when APP_ENV=production.
    LLM_PROVIDER: Literal["anthropic", "claude_agent_sdk"] = "anthropic"

    # Claude (Anthropic). Set exactly one credential: ANTHROPIC_API_KEY (a
    # Console key, sk-ant-api...) is the one meant for a deployed service;
    # ANTHROPIC_AUTH_TOKEN takes an OAuth access token instead.
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_AUTH_TOKEN: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-opus-5-5"
    # low | medium | high | xhigh | max. Code review is intelligence-sensitive;
    # the model's own default is medium.
    ANTHROPIC_EFFORT: str = "high"
    # Re-run a declined request on Anthropic's recommended fallback model
    # instead of returning the refusal.
    ANTHROPIC_REFUSAL_FALLBACK: bool = True
    # Max gap between streamed chunks before a call is treated as hung.
    ANTHROPIC_TIMEOUT_SECONDS: float = 300.0
    # Output token ceiling per model call, thinking included. Was hardcoded at
    # 2000, which the analysis prompt routinely exceeded - the model stopped
    # mid-JSON, the parse failed, and the failure was swallowed into an empty
    # issue list with neutral 50 scores. A batch that found real problems
    # reported none.
    LLM_MAX_OUTPUT_TOKENS: int = 32000
    # Rolling daily token allowance per user. 0 disables the cap.
    # Nothing bounded LLM spend before this.
    LLM_DAILY_TOKEN_BUDGET_PER_USER: int = 2_000_000
    
    # Developer insights refreshed after each analysis: how many weeks of
    # contribution history to keep current, and how many files to blame (files
    # with findings first). Each blamed file is one GitHub GraphQL request.
    INSIGHTS_WEEKS: int = 12
    INSIGHTS_MAX_BLAME_FILES: int = 40

    # Most repositories one sync will list.Above this the listing is partial,
    # and sync then skips pruning rows for repositories it did not see.
    GITHUB_SYNC_MAX_REPOS: int = 1000

    # Redis configuration
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 50
    REDIS_SOCKET_TIMEOUT: int = 5
    REDIS_SOCKET_CONNECT_TIMEOUT: int = 2
    CACHE_DEFAULT_TTL: int = 300  # 5 minutes
    
    # Optimized cache TTLs (in seconds)
    CACHE_TTL_USER: int = 3600      # 60 min - user data rarely changes
    CACHE_TTL_REPOS: int = 600      # 10 min - balanced freshness
    CACHE_TTL_FILES: int = 3600     # 60 min - files rarely change
    CACHE_TTL_ANALYSIS: int = 86400 # 24 hours - analysis results are immutable
    CACHE_TTL_ISSUES: int = 3600    # 60 min - issues are immutable
    
    SECRET_KEY: str
    # SECURITY: separate key for token-at-rest encryption so SECRET_KEY (JWT signing)
    # can be rotated without making every stored GitHub token undecryptable.
    TOKEN_ENCRYPTION_KEY: Optional[str] = None
    # SECURITY: admin endpoints are disabled entirely unless this is set.
    ADMIN_API_KEY: Optional[str] = None
    # Number of trusted reverse proxies in front of the app. X-Forwarded-For is
    # only honoured when this is > 0.
    TRUSTED_PROXY_COUNT: int = 0
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # Increased from 30 to reduce refresh frequency
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    # Vite dev server runs on 8080 (see Frontend/vite.config.ts)
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://localhost:8080"
    
    # CORS specific methods (more restrictive than allow all)
    ALLOWED_METHODS: str = "GET,POST,PUT,DELETE,OPTIONS,PATCH"
    ALLOWED_HEADERS: str = "Authorization,Content-Type,X-Requested-With,Accept,Origin"
    
    MAX_UPLOAD_SIZE: int = 5242880
    # Where uploaded avatars go now that Supabase Storage is gone. A local
    # directory is correct for single-node and development; point AVATAR_BASE_URL
    # at a CDN and swap the backend in local_storage.py for object storage when
    # running more than one instance.
    UPLOAD_DIR: str = "uploads"
    AVATAR_BASE_URL: str = "/static/avatars"

    # Analysis sampling.
    # The analysis reads a SAMPLE of a repository, not all of it. Scores and
    # issue counts are computed from at most ANALYSIS_MAX_FILES files, chosen by
    # the priority heuristic in analysis_tasks. Raising this increases coverage,
    # analysis time and LLM spend roughly linearly. The result carries
    # files_analyzed and files_eligible so the UI can disclose the sample size.
    # Where analyses run: "queue" (Celery, correct for production), "inline"
    # (in the API process, for local dev), or "auto" (queue when a worker is
    # listening, otherwise inline).
    ANALYSIS_EXECUTION_MODE: str = "auto"
    # Raised from 15 now that incremental analysis caches per-file findings by
    # git blob SHA: only files whose content actually changed cost anything, so
    # coverage is bounded by what the FIRST run costs, amortised over every run
    # after it - not by what a single run can afford every time.
    ANALYSIS_MAX_FILES: int = 150

    # Files per AI call. Larger batches cost fewer calls but give the model more
    # to hold at once, which costs recall; smaller batches are more accurate and
    # slower. Configurable because the right value moves with the model.
    ANALYSIS_BATCH_SIZE: int = 8
    ANALYSIS_MAX_FILE_BYTES: int = 50 * 1024

    # Alerts. Celery beat runs the organisation alert checks every
    # ALERT_CHECK_INTERVAL_SECONDS; 0 removes the schedule (the manual check
    # endpoint keeps working). Requires a `celery ... beat` process - without
    # one nothing is scheduled at all, which is how alerts went unchecked
    # before the schedule existed.
    ALERT_CHECK_INTERVAL_SECONDS: int = 3600
    # The quality-alert score threshold is per user (user_settings
    # .alert_score_threshold, Settings > Notifications); the deployment-wide
    # ALERT_QUALITY_THRESHOLD it replaced overrode every user's choice.

    RATE_LIMIT_PER_MINUTE: int = 60

    # The interactive API docs publish every route, parameter and schema. Off
    # in production unless deliberately enabled; always on in development.
    ENABLE_API_DOCS: bool = False
    # Email + password accounts. Off: RepoIQ signs in with GitHub only. There is
    # no email delivery, so a password account has no reset or verification -
    # one forgotten password is a permanently locked account. Turning this on
    # also re-enables password login and change for accounts that have one.
    PASSWORD_AUTH_ENABLED: bool = False

    @property
    def allowed_methods_list(self) -> List[str]:
        return [method.strip() for method in self.ALLOWED_METHODS.split(",")]
    
    @property
    def allowed_headers_list(self) -> List[str]:
        return [header.strip() for header in self.ALLOWED_HEADERS.split(",")]
    
    @property
    def allowed_origins_list(self) -> List[str]:
        # Blank entries (a trailing comma) are dropped rather than allowed as "".
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]
    
    @property
    def BACKEND_CORS_ORIGINS(self) -> List[str]:
        """Allowed CORS origins. Configure via ALLOWED_ORIGINS - no implicit additions."""
        return self.allowed_origins_list
    
    @property
    def api_prefix(self) -> str:
        return self.API_V1_PREFIX

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in ("production", "prod")

    @property
    def api_docs_enabled(self) -> bool:
        """/docs, /redoc and /openapi.json: on in development, opt-in in production."""
        return self.ENABLE_API_DOCS or not self.is_production

    @model_validator(mode="after")
    def _reject_dev_only_settings_in_production(self) -> "Settings":
        """
        Refuse to boot a production process that is misconfigured.

        Every one of these used to surface later and worse: a placeholder
        SECRET_KEY lets anyone mint session tokens, a localhost CORS origin
        breaks the real frontend with an opaque browser error, a missing model
        credential fails the first analysis an hour after deploy. All problems
        are reported at once, so a deploy is not fixed one restart at a time.
        """
        if not self.is_production:
            return self

        problems = []

        # The Agent SDK provider runs on one developer's personal Claude login
        # and is not a credential a service may use.
        if self.LLM_PROVIDER == "claude_agent_sdk":
            problems.append(
                "LLM_PROVIDER=claude_agent_sdk is for local development only; "
                "set LLM_PROVIDER=anthropic with ANTHROPIC_API_KEY in production"
            )
        if self.LLM_PROVIDER == "anthropic" and not (
            _real_value(self.ANTHROPIC_API_KEY) or _real_value(self.ANTHROPIC_AUTH_TOKEN)
        ):
            problems.append("LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN)")

        if self.DEBUG:
            # FastAPI debug mode returns tracebacks in 500 responses, and the
            # global handler includes exception text when DEBUG is on.
            problems.append("DEBUG must be false in production")

        # The defaults point at a developer's machine (and carry the dev
        # database password); a deploy that forgot to set them would boot and
        # then fail on its first request instead of here.
        for name in ("DATABASE_URL", "REDIS_URL"):
            host = (urlparse(getattr(self, name) or "").hostname or "").lower()
            if not host or host in _LOCAL_HOSTS:
                problems.append(f"{name} must point at your production server, not localhost")
        if "repoiq_dev" in (self.DATABASE_URL or ""):
            problems.append("DATABASE_URL still uses the development password")

        # SECRET_KEY signs every session token.
        if len(self.SECRET_KEY or "") < MIN_SECRET_LENGTH or _looks_like_placeholder(self.SECRET_KEY):
            problems.append(
                f"SECRET_KEY must be a random value of at least {MIN_SECRET_LENGTH} characters "
                "(python -c \"import secrets; print(secrets.token_urlsafe(48))\")"
            )
        # Without a dedicated key, stored GitHub tokens are encrypted with a key
        # derived from SECRET_KEY, so rotating the signing key after a leak
        # would make every stored token undecryptable - which in practice means
        # the leaked key never gets rotated. Values written under the
        # SECRET_KEY-derived key stay readable after this is set (see
        # encryption_service), so requiring it is safe for an existing deploy.
        if not _real_value(self.TOKEN_ENCRYPTION_KEY):
            problems.append("TOKEN_ENCRYPTION_KEY must be set in production")
        elif len(self.TOKEN_ENCRYPTION_KEY) < MIN_SECRET_LENGTH:
            problems.append(f"TOKEN_ENCRYPTION_KEY must be at least {MIN_SECRET_LENGTH} characters")
        elif self.TOKEN_ENCRYPTION_KEY == self.SECRET_KEY:
            problems.append("TOKEN_ENCRYPTION_KEY must differ from SECRET_KEY")

        problems.extend(_origin_problems(self.ALLOWED_ORIGINS))

        mode = (self.GITHUB_AUTH_MODE or "").lower()
        if mode not in ("oauth", "app"):
            problems.append("GITHUB_AUTH_MODE must be 'oauth' or 'app'")
        elif mode == "app":
            missing = [
                name for name in ("GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY")
                if not _real_value(getattr(self, name))
            ]
            if missing:
                problems.append(f"GITHUB_AUTH_MODE=app needs {', '.join(missing)}")
        if not _is_public_https(self.GITHUB_REDIRECT_URI) or _looks_like_placeholder(self.GITHUB_REDIRECT_URI):
            problems.append("GITHUB_REDIRECT_URI must be a public https:// URL in production")

        if problems:
            raise ValueError(
                "Refusing to start with APP_ENV=production:\n  - " + "\n  - ".join(problems)
            )
        return self
    
    # REPOIQ_ENV_FILE lets a caller point at a different env file, or at none.
    #
    # The test suite sets it to a path that does not exist, so tests read only
    # the variables conftest sets explicitly. Without that, results depend on
    # whatever .env the developer happens to have locally - a suite that passes
    # on a clean checkout and fails once someone configures the app is worse
    # than no suite, because it trains people to ignore failures.
    model_config = SettingsConfigDict(
        env_file=os.getenv("REPOIQ_ENV_FILE", ".env"),
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
