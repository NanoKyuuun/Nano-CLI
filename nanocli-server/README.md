# NanoCLI Server — Home Server RAG Backend

Service ini menyediakan backend RAG (Retrieval-Augmented Generation) untuk NanoCLI.
Data percakapan, bug, dan keputusan teknis dari semua project di-upload ke sini dan bisa di-search secara semantik.

## Stack

| Service | Image | Fungsi |
|---|---|---|
| `nanocli-db` | `pgvector/pgvector:pg16` | Vector database (PostgreSQL + pgvector) |
| `nanocli-ollama` | `ollama/ollama:latest` | Local embedding model (nomic-embed-text) |
| `nanocli-api` | Python 3.12 (build lokal) | FastAPI gateway |

## Setup di Home Server

### 1. Clone / copy folder ini ke home server

```bash
scp -r ./nanocli-server user@homeserver:/opt/nanocli-server
```

### 2. Buat file `.env`

```bash
cd /opt/nanocli-server
cp .env.example .env
nano .env   # isi DB_PASSWORD dan NANOCLI_API_KEY
```

Generate API Key yang aman:
```bash
openssl rand -hex 32
```

### 3. Jalankan semua service

```bash
docker compose up -d
```

### 4. Pull model embedding Ollama

```bash
# Tunggu Ollama container ready dulu (10-30 detik)
docker compose exec nanocli-ollama ollama pull nomic-embed-text
```

### 5. Verifikasi

```bash
curl http://localhost:8080/health
# Output: {"status":"ok","database":true,"ollama":true,"embed_model":"nomic-embed-text"}
```

## Setup di NanoCLI (client)

Setelah home server berjalan, jalankan di mesin developer:

```bash
nanocli remote setup
# Masukkan URL dan API Key home server

nanocli remote status
# Cek koneksi
```

## Konfigurasi Reverse Proxy (jika pakai Cloudflare Tunnel / Nginx)

Pastikan port `8080` (atau sesuai `API_PORT` di `.env`) ter-forward ke domain.

Contoh Nginx config:
```nginx
location /nanocli/ {
    proxy_pass http://localhost:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Perintah Berguna

```bash
# Lihat logs API
docker compose logs -f nanocli-api

# Restart service tertentu
docker compose restart nanocli-api

# Stop semua
docker compose down

# Hapus semua data (HATI-HATI: tidak bisa dikembalikan)
docker compose down -v
```

## Struktur Database

- `memory_entries` — bug, keputusan, style, dll dari NanoCLI sessions
- `conversation_turns` — riwayat percakapan per sesi (user + assistant)

Keduanya memiliki HNSW index untuk semantic similarity search via pgvector.
