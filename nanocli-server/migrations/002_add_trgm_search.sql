-- ============================================================
-- Migration: 002_add_trgm_search.sql
-- Untuk database PostgreSQL yang SUDAH ada.
-- Tambah pg_trgm extension dan GIN indexes untuk fallback search.
--
-- Jalankan:
--   docker compose exec nanocli-db psql -U nanocli -d nanocli \
--     -f /migrations/002_add_trgm_search.sql
--
-- Aman dijalankan berkali-kali (IF NOT EXISTS).
-- ============================================================

-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes untuk trigram similarity search
-- Digunakan sebagai fallback ketika Ollama tidak tersedia
-- Jauh lebih baik dari "ambil rows random" sebelumnya

CREATE INDEX IF NOT EXISTS memory_entries_content_trgm_idx
    ON memory_entries USING GIN (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS conversation_turns_content_trgm_idx
    ON conversation_turns USING GIN (content gin_trgm_ops);

-- Verifikasi:
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE indexname LIKE '%trgm%';
