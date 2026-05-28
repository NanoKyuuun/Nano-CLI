"""
main.py — NanoCLI API Server (FastAPI)

Endpoints selalu tersedia (tanpa auth):
  GET  /health              — status server, database, dan Ollama

Endpoints ENABLE_RAG=true (default, butuh autentikasi):
  POST /ingest/memory-entry      — simpan memory entry
  POST /ingest/conversation-turn — simpan turn percakapan
  POST /ingest/feedback          — simpan feedback rating
  POST /search                   — semantic search

Endpoints telemetry (tanpa auth, anonymous, Share mode):
  POST /telemetry/event     — kirim anonymous usage stats

Set ENABLE_RAG=false untuk deployment ringan (hanya telemetry).
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security import APIKeyHeader

# Feature flag: ENABLE_RAG=false → hanya /telemetry/* dan /health aktif
# Cocok untuk server owner yang hanya terima telemetry dari Share mode users
ENABLE_RAG = os.environ.get("ENABLE_RAG", "true").lower() == "true"

from schemas import (
    IngestMemoryEntryRequest,
    IngestConversationTurnRequest,
    IngestFeedbackRequest,
    TelemetryEventRequest,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    IngestResponse,
    HealthResponse,
    StatsResponse,
)
import db
import embedder

# ─── Config ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "info").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nanocli-api")

API_KEY = os.environ.get("API_KEY", "")
if not API_KEY:
    logger.warning("API_KEY env var tidak di-set! Server berjalan tanpa autentikasi.")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


# ─── Auth ─────────────────────────────────────────────────────────────────────

async def require_api_key(key: str = Security(api_key_header)):
    if API_KEY and key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key.")
    return key


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    rag_status = "enabled" if ENABLE_RAG else "disabled (telemetry-only mode)"
    logger.info(f"Starting NanoCLI API... RAG: {rag_status}")
    await db.init_pool()
    yield
    await db.close_pool()
    logger.info("NanoCLI API stopped.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="NanoCLI API",
    description=(
        "NanoCLI backend server. "
        f"Mode: {'Full RAG + Telemetry' if ENABLE_RAG else 'Telemetry Only'}."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Cek status semua komponen: database dan Ollama.
    Selalu tersedia tanpa autentikasi.
    """
    db_ok = await db.is_db_healthy()
    ollama_ok = await embedder.is_ollama_healthy() if ENABLE_RAG else False

    status = "ok" if (db_ok and (ollama_ok or not ENABLE_RAG)) else "degraded"

    return HealthResponse(
        status=status,
        database=db_ok,
        ollama=ollama_ok,
        embed_model=embedder.OLLAMA_EMBED_MODEL,
    )


# ─── Telemetry (Share mode — tanpa auth, data anonim) ────────────────────────

@app.post("/telemetry/event", tags=["Telemetry"])
async def ingest_telemetry_event(req: TelemetryEventRequest):
    """
    Terima anonymous usage event dari Share mode NanoCLI users.
    Tidak memerlukan autentikasi — data bersifat anonim.
    Tidak ada konten percakapan, kode, atau informasi identitas.
    """
    event_id = await db.insert_telemetry_event(
        event_type=req.event,
        model_id=req.model_id,
        nano_mode=req.nano_mode,
        token_range=req.token_range,
        response_time_ms=req.response_time_ms,
        rating=req.rating,
        command=req.command,
        error_type=req.error_type,
        cli_version=req.cli_version,
    )
    logger.debug(f"Telemetry: id={event_id}, event={req.event}")
    return {"id": event_id}


@app.get("/stats", response_model=StatsResponse, tags=["Analytics"])
async def get_stats(_: str = Depends(require_api_key)):
    """
    Ambil statistik ringkas untuk keperluan CLI development:
    - Distribusi feedback (good/bad) per model
    - Command usage statistics
    - Rata-rata response time
    - Jumlah memory entries dan conversation sessions

    Membutuhkan autentikasi — hanya untuk owner/admin.
    """
    try:
        stats = await db.get_stats()
        return StatsResponse(**stats)
    except Exception as e:
        logger.error(f"Stats query failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve stats. Make sure analytics views are created (run migrations/001_add_analytics.sql).")


# ─── RAG Endpoints (hanya jika ENABLE_RAG=true) ───────────────────────────────

if ENABLE_RAG:

    @app.post("/ingest/memory-entry", response_model=IngestResponse, tags=["Ingest"])
    async def ingest_memory_entry(
        req: IngestMemoryEntryRequest,
        _: str = Depends(require_api_key),
    ):
        """
        Simpan memory entry dari NanoCLI (bug, decision, solution, dll).
        Embedding di-generate secara otomatis via Ollama.
        """
        vec = await embedder.get_embedding(req.content)

        entry_id = await db.insert_memory_entry(
            type=req.type.value,
            content=req.content,
            source_file=req.source_file,
            project_name=req.project_name,
            embedding=vec,
            metadata=req.metadata,
        )

        logger.info(f"Memory entry saved: id={entry_id}, type={req.type.value}, embedded={vec is not None}")
        return IngestResponse(id=entry_id, embedded=vec is not None)

    @app.post("/ingest/conversation-turn", response_model=IngestResponse, tags=["Ingest"])
    async def ingest_conversation_turn(
        req: IngestConversationTurnRequest,
        _: str = Depends(require_api_key),
    ):
        """
        Simpan satu turn percakapan (user atau assistant) dari NanoCLI chat.
        Hanya role 'user' dan 'assistant' yang disimpan.
        """
        vec = None
        if len(req.content) >= 20:
            vec = await embedder.get_embedding(req.content)

        turn_id = await db.insert_conversation_turn(
            session_id=req.session_id,
            project_name=req.project_name,
            role=req.role,
            content=req.content,
            embedding=vec,
            metadata=req.metadata,
        )

        logger.info(f"Conversation turn saved: id={turn_id}, role={req.role}, embedded={vec is not None}")
        return IngestResponse(id=turn_id, embedded=vec is not None)

    @app.post("/ingest/feedback", tags=["Ingest"])
    async def ingest_feedback(
        req: IngestFeedbackRequest,
        _: str = Depends(require_api_key),
    ):
        """
        Simpan rating feedback user. Training signal untuk pengembangan model.
        rating: 1=good, -1=bad, 0=neutral/skip
        """
        feedback_id = await db.insert_feedback(
            session_id=req.session_id,
            response_preview=req.response_preview,
            rating=req.rating,
            prompt_preview=req.prompt_preview,
            model_id=req.model_id,
            project_name=req.project_name,
        )

        label = {1: 'good', -1: 'bad', 0: 'neutral'}[req.rating]
        logger.info(f"Feedback saved: id={feedback_id}, rating={label}, session={req.session_id[:8]}")
        return {"id": feedback_id, "rating": req.rating}

    @app.post("/search", response_model=SearchResponse, tags=["Search"])
    async def search(
        req: SearchRequest,
        _: str = Depends(require_api_key),
    ):
        """
        Semantic search di knowledge base NanoCLI.
        Menggabungkan hasil dari memory_entries dan conversation_turns.
        """
        query_vec = await embedder.get_embedding(req.query)
        used_embedding = query_vec is not None

        results: list[SearchResultItem] = []

        per_source = req.limit
        if req.include_memory and req.include_conversations:
            per_source = max(1, req.limit // 2)

        if req.include_memory:
            rows = await db.search_memory_entries(
                query_embedding=query_vec,
                query_text=req.query,
                project_name=req.project_name,
                limit=per_source,
                min_similarity=req.min_similarity,
            )
            for row in rows:
                results.append(SearchResultItem(
                    id=row["id"],
                    source="memory",
                    type=row["type"],
                    content=row["content"],
                    source_file=row.get("source_file"),
                    project_name=row.get("project_name"),
                    similarity=float(row["similarity"]),
                    created_at=str(row["created_at"]),
                ))

        if req.include_conversations:
            rows = await db.search_conversations(
                query_embedding=query_vec,
                query_text=req.query,
                project_name=req.project_name,
                limit=per_source,
                min_similarity=req.min_similarity,
            )
            for row in rows:
                results.append(SearchResultItem(
                    id=row["id"],
                    source="conversation",
                    type=row["role"],
                    content=row["content"],
                    source_file=None,
                    project_name=row.get("project_name"),
                    similarity=float(row["similarity"]),
                    created_at=str(row["created_at"]),
                ))

        results.sort(key=lambda r: r.similarity, reverse=True)
        results = results[:req.limit]

        if not results:
            logger.debug(
                f"search: no results above threshold={req.min_similarity} "
                f"for query='{req.query[:60]}' "
                f"(embedding={'yes' if used_embedding else 'no, trgm fallback'})"
            )

        return SearchResponse(
            query=req.query,
            results=results,
            total=len(results),
            used_embedding=used_embedding,
        )

else:
    # ENABLE_RAG=false: log info bahwa RAG endpoints tidak aktif
    logger.info("RAG endpoints disabled (ENABLE_RAG=false). Only /health and /telemetry/* are active.")
