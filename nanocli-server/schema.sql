-- NanoCLI RAG Database Schema
-- PostgreSQL 16 + pgvector
-- Dijalankan otomatis saat container pertama kali dibuat (via docker-entrypoint-initdb.d/)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector untuk semantic search
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram similarity untuk fallback search

-- ============================================================
-- TABLE: memory_entries
-- Menyimpan bug, decision, solution, todo dari NanoCLI sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_entries (
    id          SERIAL PRIMARY KEY,
    type        TEXT NOT NULL,           -- 'bug' | 'decision' | 'solution' | 'todo' | 'style' | 'dependency' | 'preference' | 'web'
    content     TEXT NOT NULL,
    source_file TEXT,
    project_name TEXT,
    embedding   vector(384),             -- nomic-embed-text menghasilkan 384 dimensi
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: conversation_turns
-- Menyimpan riwayat percakapan NanoCLI per turn
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_turns (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL,           -- UUID unik per sesi chat
    project_name TEXT,
    role        TEXT NOT NULL,           -- 'user' | 'assistant'
    content     TEXT NOT NULL,
    embedding   vector(384),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: feedback
-- Menyimpan rating user terhadap response AI
-- rating: 1=good, -1=bad, 0=neutral/skip
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
    id              SERIAL PRIMARY KEY,
    session_id      TEXT NOT NULL,
    response_preview TEXT NOT NULL,
    rating          SMALLINT NOT NULL CHECK (rating IN (-1, 0, 1)),
    prompt_preview  TEXT,
    model_id        TEXT,
    project_name    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: telemetry_events
-- Menyimpan anonymous usage events dari Share mode users.
-- TIDAK mengandung konten percakapan, kode, atau data sensitif.
-- Digunakan untuk analitik pengembangan CLI.
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry_events (
    id              SERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,        -- chat_response, feedback, command, error, dll
    model_id        TEXT,                  -- ID model yang dipakai
    nano_mode       TEXT,                  -- mode NanoCLI (normal, high, dll)
    token_range     TEXT,                  -- '0-4k', '4k-8k', '8k-32k', '32k+'
    response_time_ms INT,                  -- estimasi durasi response
    rating          SMALLINT,              -- hanya untuk event feedback: 1/-1/0
    command         TEXT,                  -- nama command (ask, review, debug, dll)
    error_type      TEXT,                  -- kategori error (bukan stack trace)
    cli_version     TEXT,                  -- versi CLI yang dipakai
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- HNSW vector indexes
CREATE INDEX IF NOT EXISTS memory_entries_embedding_idx
    ON memory_entries USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS conversation_turns_embedding_idx
    ON conversation_turns USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Index pendukung memory_entries
CREATE INDEX IF NOT EXISTS memory_entries_type_idx       ON memory_entries (type);
CREATE INDEX IF NOT EXISTS memory_entries_project_idx    ON memory_entries (project_name);
CREATE INDEX IF NOT EXISTS memory_entries_created_at_idx ON memory_entries (created_at DESC);

-- Index pendukung conversation_turns
CREATE INDEX IF NOT EXISTS conversation_turns_session_idx    ON conversation_turns (session_id);
CREATE INDEX IF NOT EXISTS conversation_turns_project_idx    ON conversation_turns (project_name);
CREATE INDEX IF NOT EXISTS conversation_turns_created_at_idx ON conversation_turns (created_at DESC);

-- Index pada feedback
CREATE INDEX IF NOT EXISTS feedback_rating_idx     ON feedback (rating);
CREATE INDEX IF NOT EXISTS feedback_model_idx      ON feedback (model_id);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);

-- Index pada telemetry_events (penting untuk analytics queries)
CREATE INDEX IF NOT EXISTS telemetry_event_type_idx   ON telemetry_events (event_type);
CREATE INDEX IF NOT EXISTS telemetry_created_at_idx   ON telemetry_events (created_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_model_idx        ON telemetry_events (model_id) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS telemetry_command_idx      ON telemetry_events (command) WHERE command IS NOT NULL;

-- GIN trigram indexes untuk fallback search (ketika Ollama tidak tersedia)
-- Memungkinkan pg_trgm similarity search yang bermakna tanpa pgvector
CREATE INDEX IF NOT EXISTS memory_entries_content_trgm_idx
    ON memory_entries USING GIN (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS conversation_turns_content_trgm_idx
    ON conversation_turns USING GIN (content gin_trgm_ops);

-- ============================================================
-- ANALYTICS VIEWS
-- Views ini digunakan oleh `nanocli data stats` command.
-- Semua query langsung bisa dijalankan tanpa tulis raw SQL.
-- ============================================================

-- Statistik harian: jumlah event per hari per tipe
CREATE OR REPLACE VIEW v_cli_daily_stats AS
    SELECT
        DATE(created_at)           AS date,
        event_type,
        model_id,
        COUNT(*)                   AS total_events,
        AVG(response_time_ms)      AS avg_response_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms) AS p50_response_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) AS p95_response_ms
    FROM telemetry_events
    GROUP BY DATE(created_at), event_type, model_id
    ORDER BY date DESC, total_events DESC;

-- Ringkasan feedback per model
CREATE OR REPLACE VIEW v_feedback_summary AS
    SELECT
        COALESCE(model_id, 'unknown')                          AS model_id,
        COUNT(*)                                               AS total,
        COUNT(*) FILTER (WHERE rating = 1)                    AS good,
        COUNT(*) FILTER (WHERE rating = -1)                   AS bad,
        COUNT(*) FILTER (WHERE rating = 0)                    AS neutral,
        ROUND(
            (COUNT(*) FILTER (WHERE rating = 1))::numeric
            / NULLIF(COUNT(*), 0) * 100, 1
        )                                                      AS good_pct
    FROM telemetry_events
    WHERE event_type = 'feedback'
    GROUP BY model_id
    ORDER BY total DESC;

-- Penggunaan command (ask, review, debug, dll)
CREATE OR REPLACE VIEW v_command_usage AS
    SELECT
        COALESCE(command, 'unknown')  AS command,
        COUNT(*)                      AS total,
        ROUND(
            COUNT(*)::numeric
            / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1
        )                             AS pct
    FROM telemetry_events
    WHERE event_type = 'command' AND command IS NOT NULL
    GROUP BY command
    ORDER BY total DESC;

-- Ringkasan error berdasarkan tipe
CREATE OR REPLACE VIEW v_error_summary AS
    SELECT
        COALESCE(error_type, 'unknown')  AS error_type,
        COUNT(*)                          AS total,
        MAX(created_at)                   AS last_seen
    FROM telemetry_events
    WHERE event_type = 'error'
    GROUP BY error_type
    ORDER BY total DESC;

-- Overview lengkap untuk stats endpoint
-- CATATAN: Kolom total_memory_entries dan total_conversation_turns
-- akan 0 di Share/telemetry-only server (ENABLE_RAG=false) — ini expected.
CREATE OR REPLACE VIEW v_stats_overview AS
    SELECT
        -- Telemetry section (tersedia di semua mode server)
        (SELECT COUNT(*) FROM telemetry_events)                              AS total_events,
        (SELECT COUNT(*) FROM telemetry_events
         WHERE event_type = 'feedback')                                      AS total_feedback,
        (SELECT COUNT(*) FROM telemetry_events
         WHERE event_type = 'feedback' AND rating = 1)                       AS feedback_good,
        (SELECT COUNT(*) FROM telemetry_events
         WHERE event_type = 'feedback' AND rating = -1)                      AS feedback_bad,
        (SELECT COUNT(*) FROM telemetry_events
         WHERE event_type = 'feedback' AND rating = 0)                       AS feedback_neutral,
        (SELECT ROUND(AVG(response_time_ms)::numeric, 0)
         FROM telemetry_events WHERE response_time_ms IS NOT NULL)           AS avg_response_ms,
        -- RAG section (hanya terisi di self-host server dengan ENABLE_RAG=true)
        (SELECT COUNT(*) FROM memory_entries)                                AS total_memory_entries,
        (SELECT COUNT(*) FROM conversation_turns)                            AS total_conversation_turns,
        (SELECT COUNT(DISTINCT session_id) FROM conversation_turns)          AS total_sessions,
        (SELECT MIN(created_at) FROM telemetry_events)                       AS data_since;

-- ============================================================
-- RETENTION FUNCTION
-- Hapus data lama untuk mencegah database bloat.
-- Panggil secara manual atau via pg_cron:
--   SELECT * FROM cleanup_old_telemetry(90);  -- hapus data > 90 hari
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_telemetry(days_to_keep INT DEFAULT 90)
RETURNS TABLE(deleted_telemetry BIGINT, deleted_conversations BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
    cutoff              TIMESTAMPTZ := NOW() - (days_to_keep || ' days')::INTERVAL;
    del_telemetry       BIGINT;
    del_conversations   BIGINT;
BEGIN
    -- Hapus telemetry events lama (data anonim, aman dihapus)
    DELETE FROM telemetry_events WHERE created_at < cutoff;
    GET DIAGNOSTICS del_telemetry = ROW_COUNT;

    -- Hapus conversation turns lama (data RAG, hanya untuk self-host)
    DELETE FROM conversation_turns WHERE created_at < cutoff;
    GET DIAGNOSTICS del_conversations = ROW_COUNT;

    RAISE NOTICE 'Cleanup done: % telemetry events, % conversation turns deleted (older than % days)',
        del_telemetry, del_conversations, days_to_keep;

    RETURN QUERY SELECT del_telemetry, del_conversations;
END;
$$;
