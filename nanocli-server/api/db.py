"""
db.py — Async PostgreSQL connection pool + query helpers untuk NanoCLI RAG.

Menggunakan asyncpg langsung (via DATABASE_URL) karena lebih performa untuk
bulk insert embedding daripada SQLAlchemy ORM.
"""

import os
import logging
from typing import Optional, List, Any

import asyncpg

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Connection pool global — diinisialisasi di startup FastAPI
_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> None:
    """Buat connection pool. Dipanggil saat FastAPI startup."""
    global _pool
    # asyncpg tidak pakai prefix postgresql+asyncpg, ganti ke postgresql://
    dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    _pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10)
    logger.info("Database connection pool initialized.")


async def close_pool() -> None:
    """Tutup connection pool. Dipanggil saat FastAPI shutdown."""
    global _pool
    if _pool:
        await _pool.close()
        logger.info("Database connection pool closed.")


def get_pool() -> asyncpg.Pool:
    if not _pool:
        raise RuntimeError("Database pool belum diinisialisasi. Panggil init_pool() dulu.")
    return _pool


# ─── Memory Entries ──────────────────────────────────────────────────────────

async def insert_memory_entry(
    type: str,
    content: str,
    source_file: Optional[str],
    project_name: Optional[str],
    embedding: Optional[List[float]],
    metadata: Optional[dict],
) -> int:
    """Insert memory entry, kembalikan ID baru."""
    pool = get_pool()
    embedding_str = f"[{','.join(map(str, embedding))}]" if embedding else None

    row = await pool.fetchrow(
        """
        INSERT INTO memory_entries (type, content, source_file, project_name, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
        RETURNING id
        """,
        type, content, source_file, project_name,
        embedding_str, _to_jsonb(metadata)
    )
    return row["id"]


async def search_memory_entries(
    query_embedding: Optional[List[float]],
    query_text: str,
    project_name: Optional[str],
    limit: int,
    min_similarity: float = 0.3,
) -> List[asyncpg.Record]:
    """
    Semantic search di memory_entries.

    Mode 1 (Ollama tersedia): cosine similarity via pgvector
      - Filter hasil di bawah min_similarity threshold
      - Urut dari paling relevan

    Mode 2 (Ollama tidak tersedia): trigram similarity via pg_trgm
      - Fallback yang bermakna — bukan random rows
      - Threshold lebih rendah karena trgm kurang akurat dari embedding

    4 branch terpisah (tidak pakai f-string) untuk kejelasan dan safety:
      A. embedding  + project_name
      B. embedding  + no project_name
      C. trgm       + project_name
      D. trgm       + no project_name
    """
    pool = get_pool()

    if query_embedding:
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        if project_name:
            # Branch A: semantic search + filter project
            return await pool.fetch(
                """
                SELECT id, type, content, source_file, project_name, created_at,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM memory_entries
                WHERE embedding IS NOT NULL
                  AND 1 - (embedding <=> $1::vector) >= $2
                  AND project_name = $3
                ORDER BY embedding <=> $1::vector
                LIMIT $4
                """,
                embedding_str, min_similarity, project_name, limit
            )
        else:
            # Branch B: semantic search, semua project
            return await pool.fetch(
                """
                SELECT id, type, content, source_file, project_name, created_at,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM memory_entries
                WHERE embedding IS NOT NULL
                  AND 1 - (embedding <=> $1::vector) >= $2
                ORDER BY embedding <=> $1::vector
                LIMIT $3
                """,
                embedding_str, min_similarity, limit
            )
    else:
        # Fallback: pg_trgm trigram similarity
        # Jauh lebih baik dari "SELECT * LIMIT N" — setidaknya berbasis query
        trgm_threshold = max(0.05, min_similarity * 0.3)

        if project_name:
            # Branch C: trgm + filter project
            rows = await pool.fetch(
                """
                SELECT id, type, content, source_file, project_name, created_at,
                       similarity(content, $1) AS similarity
                FROM memory_entries
                WHERE similarity(content, $1) > $2
                  AND project_name = $3
                ORDER BY similarity DESC
                LIMIT $4
                """,
                query_text, trgm_threshold, project_name, limit
            )
        else:
            # Branch D: trgm, semua project
            rows = await pool.fetch(
                """
                SELECT id, type, content, source_file, project_name, created_at,
                       similarity(content, $1) AS similarity
                FROM memory_entries
                WHERE similarity(content, $1) > $2
                ORDER BY similarity DESC
                LIMIT $3
                """,
                query_text, trgm_threshold, limit
            )

        if not rows:
            logger.debug(f"search_memory_entries: no trgm results for query='{query_text[:50]}'")

        return rows


# ─── Conversation Turns ──────────────────────────────────────────────────────

async def insert_conversation_turn(
    session_id: str,
    project_name: Optional[str],
    role: str,
    content: str,
    embedding: Optional[List[float]],
    metadata: Optional[dict],
) -> int:
    """Insert conversation turn, kembalikan ID baru."""
    pool = get_pool()
    embedding_str = f"[{','.join(map(str, embedding))}]" if embedding else None

    row = await pool.fetchrow(
        """
        INSERT INTO conversation_turns (session_id, project_name, role, content, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
        RETURNING id
        """,
        session_id, project_name, role, content,
        embedding_str, _to_jsonb(metadata)
    )
    return row["id"]


async def search_conversations(
    query_embedding: Optional[List[float]],
    query_text: str,
    project_name: Optional[str],
    limit: int,
    min_similarity: float = 0.3,
) -> List[asyncpg.Record]:
    """
    Semantic search di conversation_turns.
    Sama strukturnya dengan search_memory_entries: 4 branch eksplisit.
    """
    pool = get_pool()

    if query_embedding:
        embedding_str = f"[{','.join(map(str, query_embedding))}]"

        if project_name:
            # Branch A: semantic search + filter project
            return await pool.fetch(
                """
                SELECT id, session_id, project_name, role, content, created_at,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM conversation_turns
                WHERE embedding IS NOT NULL
                  AND 1 - (embedding <=> $1::vector) >= $2
                  AND project_name = $3
                ORDER BY embedding <=> $1::vector
                LIMIT $4
                """,
                embedding_str, min_similarity, project_name, limit
            )
        else:
            # Branch B: semantic search, semua project
            return await pool.fetch(
                """
                SELECT id, session_id, project_name, role, content, created_at,
                       1 - (embedding <=> $1::vector) AS similarity
                FROM conversation_turns
                WHERE embedding IS NOT NULL
                  AND 1 - (embedding <=> $1::vector) >= $2
                ORDER BY embedding <=> $1::vector
                LIMIT $3
                """,
                embedding_str, min_similarity, limit
            )
    else:
        # Fallback: pg_trgm
        trgm_threshold = max(0.05, min_similarity * 0.3)

        if project_name:
            # Branch C: trgm + filter project
            rows = await pool.fetch(
                """
                SELECT id, session_id, project_name, role, content, created_at,
                       similarity(content, $1) AS similarity
                FROM conversation_turns
                WHERE similarity(content, $1) > $2
                  AND project_name = $3
                ORDER BY similarity DESC
                LIMIT $4
                """,
                query_text, trgm_threshold, project_name, limit
            )
        else:
            # Branch D: trgm, semua project
            rows = await pool.fetch(
                """
                SELECT id, session_id, project_name, role, content, created_at,
                       similarity(content, $1) AS similarity
                FROM conversation_turns
                WHERE similarity(content, $1) > $2
                ORDER BY similarity DESC
                LIMIT $3
                """,
                query_text, trgm_threshold, limit
            )

        if not rows:
            logger.debug(f"search_conversations: no trgm results for query='{query_text[:50]}'")

        return rows


# ─── Health ──────────────────────────────────────────────────────────────────

async def is_db_healthy() -> bool:
    """Ping database."""
    try:
        pool = get_pool()
        await pool.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def insert_feedback(
    session_id: str,
    response_preview: str,
    rating: int,
    prompt_preview: Optional[str],
    model_id: Optional[str],
    project_name: Optional[str],
) -> int:
    """Insert feedback rating ke tabel feedback."""
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO feedback (session_id, response_preview, rating, prompt_preview, model_id, project_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        session_id, response_preview, rating, prompt_preview, model_id, project_name
    )
    return row["id"]


async def insert_telemetry_event(
    event_type: str,
    model_id: Optional[str],
    nano_mode: Optional[str],
    token_range: Optional[str],
    response_time_ms: Optional[int],
    rating: Optional[int],
    command: Optional[str],
    error_type: Optional[str],
    cli_version: Optional[str],
) -> int:
    """Insert anonymous telemetry event dari Share mode users."""
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO telemetry_events
            (event_type, model_id, nano_mode, token_range, response_time_ms,
             rating, command, error_type, cli_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        """,
        event_type, model_id, nano_mode, token_range, response_time_ms,
        rating, command, error_type, cli_version
    )
    return row["id"]


async def get_stats() -> dict:
    """
    Ambil statistik agregat dari analytics views.
    Digunakan oleh GET /stats endpoint.
    """
    pool = get_pool()

    # Overview: satu row dari materialized view
    overview = await pool.fetchrow("SELECT * FROM v_stats_overview")

    # Feedback per model
    fb_rows = await pool.fetch("SELECT * FROM v_feedback_summary LIMIT 10")

    # Top commands
    cmd_rows = await pool.fetch("SELECT * FROM v_command_usage LIMIT 10")

    return {
        "total_events":           int(overview["total_events"] or 0),
        "total_feedback":         int(overview["total_feedback"] or 0),
        "feedback_good":          int(overview["feedback_good"] or 0),
        "feedback_bad":           int(overview["feedback_bad"] or 0),
        "feedback_neutral":       int(overview["feedback_neutral"] or 0),
        "avg_response_ms":        float(overview["avg_response_ms"]) if overview["avg_response_ms"] else None,
        "total_memory_entries":   int(overview["total_memory_entries"] or 0),
        "total_conversation_turns": int(overview["total_conversation_turns"] or 0),
        "total_sessions":         int(overview["total_sessions"] or 0),
        "data_since":             str(overview["data_since"]) if overview["data_since"] else None,
        "feedback_by_model": [
            {
                "model_id": row["model_id"],
                "total":    int(row["total"]),
                "good":     int(row["good"]),
                "bad":      int(row["bad"]),
                "neutral":  int(row["neutral"]),
                "good_pct": float(row["good_pct"] or 0),
            }
            for row in fb_rows
        ],
        "top_commands": [
            {
                "command": row["command"],
                "total":   int(row["total"]),
                "pct":     float(row["pct"] or 0),
            }
            for row in cmd_rows
        ],
    }


# ─── Helper ──────────────────────────────────────────────────────────────────

def _to_jsonb(data: Optional[dict]) -> str:
    import json
    return json.dumps(data or {})
