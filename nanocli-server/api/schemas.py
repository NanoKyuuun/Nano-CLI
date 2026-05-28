from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class MemoryEntryType(str, Enum):
    bug        = "bug"
    decision   = "decision"
    solution   = "solution"
    todo       = "todo"
    style      = "style"
    dependency = "dependency"
    preference = "preference"
    web        = "web"


# ─── Ingest Schemas ─────────────────────────────────────────────────────────

class IngestMemoryEntryRequest(BaseModel):
    type: MemoryEntryType
    content: str = Field(..., min_length=1, max_length=10_000)
    source_file: Optional[str] = None
    project_name: Optional[str] = None
    metadata: Optional[dict] = None


class IngestConversationTurnRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    project_name: Optional[str] = None
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=50_000)
    metadata: Optional[dict] = None


class IngestFeedbackRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    response_preview: str = Field(..., min_length=1, max_length=200)
    rating: int = Field(..., ge=-1, le=1)
    prompt_preview: Optional[str] = Field(default=None, max_length=100)
    model_id: Optional[str] = Field(default=None, max_length=200)
    project_name: Optional[str] = None


class TelemetryEventRequest(BaseModel):
    """Anonymous usage event dari Share mode. Tidak mengandung konten apapun."""
    event: str = Field(..., pattern="^(chat_response|feedback|command|error|session_start|session_end)$")
    model_id: Optional[str] = Field(default=None, max_length=200)
    nano_mode: Optional[str] = Field(default=None, max_length=50)
    token_range: Optional[str] = Field(default=None, pattern="^(0-4k|4k-8k|8k-32k|32k\\+)$")
    response_time_ms: Optional[int] = Field(default=None, ge=0, le=600_000)
    rating: Optional[int] = Field(default=None, ge=-1, le=1)
    command: Optional[str] = Field(default=None, max_length=50)
    error_type: Optional[str] = Field(default=None, max_length=100)
    cli_version: Optional[str] = Field(default=None, max_length=20)


# ─── Search Schemas ──────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2_000)
    project_name: Optional[str] = None          # None = search semua project
    limit: int = Field(default=10, ge=1, le=50)
    include_conversations: bool = True           # sertakan conversation_turns dalam hasil
    include_memory: bool = True                  # sertakan memory_entries dalam hasil
    min_similarity: float = Field(default=0.3, ge=0.0, le=1.0)  # threshold cosine similarity


class SearchResultItem(BaseModel):
    id: int
    source: str         # "memory" | "conversation"
    type: Optional[str] = None
    content: str
    source_file: Optional[str] = None
    project_name: Optional[str] = None
    similarity: float
    created_at: str


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultItem]
    total: int
    used_embedding: bool        # True = semantic search berhasil; False = fallback FTS


# ─── Response Schemas ────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    id: int
    embedded: bool      # True = embedding berhasil di-generate; False = disimpan tanpa embedding


class HealthResponse(BaseModel):
    status: str         # "ok" | "degraded"
    database: bool
    ollama: bool
    embed_model: str


# ─── Stats Schemas ───────────────────────────────────────────────────────────

class FeedbackModelStats(BaseModel):
    model_id: str
    total: int
    good: int
    bad: int
    neutral: int
    good_pct: float


class CommandUsageStats(BaseModel):
    command: str
    total: int
    pct: float


class StatsResponse(BaseModel):
    """Response untuk GET /stats — ringkasan analytics untuk CLI development."""
    # Telemetry
    total_events: int
    total_feedback: int
    feedback_good: int
    feedback_bad: int
    feedback_neutral: int
    avg_response_ms: Optional[float]
    # Memory & Conversations (self-host only)
    total_memory_entries: int
    total_conversation_turns: int
    total_sessions: int
    # Breakdown
    feedback_by_model: List[FeedbackModelStats]
    top_commands: List[CommandUsageStats]
    data_since: Optional[str]
