from pydantic import BaseModel, EmailStr, Field
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
    created_at: datetime
    
    class Config:
        from_attributes = True


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
    message: str
    context_files: Optional[List[str]] = None


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
