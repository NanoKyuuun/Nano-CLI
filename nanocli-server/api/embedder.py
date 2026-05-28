"""
embedder.py — Ollama embedding client dengan graceful fallback.

Alur:
1. Kirim teks ke Ollama /api/embeddings (nomic-embed-text, 384 dimensi)
2. Jika Ollama timeout / error → kembalikan None (tidak crash)
3. Caller yang decide: simpan tanpa embedding, atau skip
"""

import os
import logging
from typing import Optional, List

import httpx

logger = logging.getLogger(__name__)

OLLAMA_URL        = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBED_TIMEOUT_SEC  = 8.0   # timeout per request embedding


async def get_embedding(text: str) -> Optional[List[float]]:
    """
    Generate embedding vector dari teks menggunakan Ollama.

    Returns:
        List[float] — vektor 384 dimensi jika berhasil
        None        — jika Ollama tidak tersedia atau timeout
    """
    if not text or not text.strip():
        return None

    # Truncate teks agar tidak melebihi context Ollama (~8K token untuk nomic-embed-text)
    truncated = text[:6_000]

    try:
        async with httpx.AsyncClient(timeout=EMBED_TIMEOUT_SEC) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": OLLAMA_EMBED_MODEL, "prompt": truncated}
            )
            resp.raise_for_status()
            data = resp.json()
            embedding = data.get("embedding")

            if not embedding or not isinstance(embedding, list):
                logger.warning("Ollama mengembalikan embedding kosong atau format tidak valid.")
                return None

            return embedding

    except httpx.TimeoutException:
        logger.warning(f"Ollama timeout ({EMBED_TIMEOUT_SEC}s) — embedding dilewati, data tetap disimpan.")
        return None
    except httpx.HTTPStatusError as e:
        logger.warning(f"Ollama HTTP error {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        logger.warning(f"Ollama tidak tersedia: {type(e).__name__}: {e}")
        return None


async def is_ollama_healthy() -> bool:
    """
    Cek apakah Ollama bisa diakses dan model sudah di-pull.
    Digunakan oleh health check endpoint.
    """
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            resp.raise_for_status()
            tags = resp.json()
            models = [m.get("name", "") for m in tags.get("models", [])]
            return any(OLLAMA_EMBED_MODEL in m for m in models)
    except Exception:
        return False
