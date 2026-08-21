import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # App settings
    APP_NAME: str = "RepoIQ"
    APP_ENV: str = "development"
    DEBUG: bool = False  # SECURITY: Default to False for production safety
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str
    
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
    
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    # Output token ceiling per model call. Was hardcoded at 2000, which the
    # analysis prompt routinely exceeded - the model stopped mid-JSON, the parse
    # failed, and the failure was swallowed into an empty issue list with neutral
    # 50 scores. A batch that found real problems reported none.
    OPENAI_MAX_OUTPUT_TOKENS: int = 8000
    # Rolling daily token allowance per user. 0 disables the cap.
    # Nothing bounded LLM spend before this.
    OPENAI_DAILY_TOKEN_BUDGET_PER_USER: int = 2_000_000
    
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
    UPLOAD_DIR: str = "uploads"

    # Analysis sampling.
    # The analysis reads a SAMPLE of a repository, not all of it. Scores and
    # issue counts are computed from at most ANALYSIS_MAX_FILES files, chosen by
    # the priority heuristic in analysis_tasks. Raising this increases coverage,
    # analysis time and OpenAI spend roughly linearly. The result carries
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
    ANALYSIS_MAX_FILE_BYTES: int = 50 * 1024
    
    RATE_LIMIT_PER_MINUTE: int = 60
    
    @property
    def allowed_methods_list(self) -> List[str]:
        return [method.strip() for method in self.ALLOWED_METHODS.split(",")]
    
    @property
    def allowed_headers_list(self) -> List[str]:
        return [header.strip() for header in self.ALLOWED_HEADERS.split(",")]
    
    @property
    def allowed_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    @property
    def BACKEND_CORS_ORIGINS(self) -> List[str]:
        """Allowed CORS origins. Configure via ALLOWED_ORIGINS - no implicit additions."""
        return self.allowed_origins_list
    
    @property
    def api_prefix(self) -> str:
        return self.API_V1_PREFIX
    
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
