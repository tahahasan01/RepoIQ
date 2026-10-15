from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictBool, StrictInt, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    github_username: Optional[str] = None
    github_connected: bool = False
    # Whether the account has a password (GitHub sign-in accounts do not), so the
    # client can stop offering a change-password form that cannot succeed.
    # Filled in by the /me endpoints; None means "not determined" elsewhere.
    has_password: Optional[bool] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PublicUser(BaseModel):
    """
    The only shape of a user record that may cross the API boundary.

    SECURITY: responses previously typed `user: dict`, which FastAPI does not
    filter, so the raw `users` row - including the stored `github_access_token` -
    was serialised to the browser and written to localStorage. Every field here is
    listed deliberately; do not add one without asking whether it is safe to hand
    to a client.
    """
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    github_username: Optional[str] = None
    github_connected: bool = False

    @classmethod
    def from_record(cls, record: Optional[Dict[str, Any]]) -> "PublicUser":
        record = record or {}
        return cls(
            id=str(record.get("id", "")),
            email=record.get("email"),
            full_name=record.get("full_name"),
            avatar_url=record.get("avatar_url"),
            bio=record.get("bio"),
            github_username=record.get("github_username"),
            github_connected=bool(record.get("github_connected", False)),
        )


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserSettingsUpdate(BaseModel):
    """
    A partial update to the caller's notification preferences.

    Omit a field to leave it unchanged. Strict types on purpose: lax coercion
    would turn "false" or 0 into a stored preference the user never chose.
    Unknown fields are rejected rather than ignored, so a client sending a
    setting this backend does not implement (e.g. a Slack toggle - there is no
    Slack integration) learns that instead of believing it was saved.
    """
    model_config = ConfigDict(extra="forbid")

    email_notifications: Optional[StrictBool] = None
    security_alerts: Optional[StrictBool] = None
    weekly_digest: Optional[StrictBool] = None
    alert_score_threshold: Optional[StrictInt] = Field(None, ge=0, le=100)
    auto_analyze_new_repos: Optional[StrictBool] = None

    @model_validator(mode="after")
    def _no_explicit_nulls(self) -> "UserSettingsUpdate":
        # Optional only so a field can be omitted. An explicit null would be
        # written to a NOT NULL column; reject it as a validation error instead.
        nulls = sorted(f for f in self.model_fields_set if getattr(self, f) is None)
        if nulls:
            raise ValueError(f"must not be null: {', '.join(nulls)}")
        return self

    def changes(self) -> Dict[str, Any]:
        """Only the fields the client actually sent."""
        return self.model_dump(exclude_unset=True)


class UserSettingsResponse(BaseModel):
    email_notifications: bool
    security_alerts: bool
    weekly_digest: bool
    alert_score_threshold: int
    auto_analyze_new_repos: bool
    # None until the user first saves (every value above is then a default).
    updated_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class GitHubRepo(BaseModel):
    id: int
    name: str
    full_name: str
    private: bool
    description: Optional[str]
    url: str
    language: Optional[str]
    stars: int
    forks: int
    open_issues: int
    default_branch: str
    created_at: datetime
    updated_at: datetime
    size: int


class RepositoryResponse(BaseModel):
    id: str
    user_id: str
    github_repo_id: int
    name: str
    full_name: str
    description: Optional[str]
    language: Optional[str]
    stars: int
    default_branch: str
    last_analyzed: Optional[datetime]
    last_synced: datetime
    created_at: datetime


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentType(str, Enum):
    SECURITY = "security"
    QUALITY = "quality"
    ARCHITECTURE = "architecture"
    DOCUMENTATION = "documentation"
    CONVERSATIONAL = "conversational"


class IssueResponse(BaseModel):
    id: str
    severity: str
    category: str
    file_path: str
    line_number: Optional[int]
    description: str
    suggestion: Optional[str]
    auto_fixable: bool


class AnalysisResultResponse(BaseModel):
    id: str
    repository_id: str
    status: AnalysisStatus
    overall_score: Optional[int]
    security_score: Optional[int]
    quality_score: Optional[int]
    architecture_score: Optional[int]
    issues: List[IssueResponse] = []
    started_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]


class AnalysisHistoryResponse(BaseModel):
    id: str
    overall_score: int
    security_score: int
    quality_score: int
    architecture_score: int
    total_issues: int
    completed_at: datetime


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    # At most three are read; more is a client bug, not a bigger prompt.
    context_files: Optional[List[str]] = Field(None, max_length=3)


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class AutoFixRequest(BaseModel):
    issue_ids: List[str]


class AutoFixResponse(BaseModel):
    fixed_count: int
    failed_count: int
    fixes: List[Dict[str, Any]]


class ImprovementRoadmapResponse(BaseModel):
    priority_order: List[str]
    quick_wins: List[Dict[str, Any]]
    medium_term: List[Dict[str, Any]]
    long_term: List[Dict[str, Any]]
    estimated_impact: Dict[str, int]
