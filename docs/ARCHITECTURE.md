# Architecture

## Overview

```
bundesfinanzministerium.de
        │
        │  HTTP fetch (temporary, in-memory only)
        ▼
┌─────────────────┐
│  Ingestion      │  node-cron (daily)
│  Pipeline       │  pdf-parse → chunking → embedding → upsert
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB Atlas  │  M0 Free Tier
│  bmf_chunks     │  Vector Search Index (cosine, 1024 dims)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Apollo GraphQL │  Node.js + Express
│  Server         │  query → embed → $vectorSearch → LLM → response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  React Frontend │  Apollo Client
│  (Vercel)       │  search input → answer + source links
└─────────────────┘
```

---

## Ingestion Pipeline

Two distinct ingestion paths serve different purposes:

### Path 1 — Bulk backfill (one-time)

| | |
|---|---|
| Script | `scripts/ingest_bulk_local.py` |
| Runs on | Developer machine (local, never on server) |
| Scope | All 51 listing pages on bundesfinanzministerium.de (~509 documents) |
| Embeddings | Local sentence-transformers (CPU) — avoids HuggingFace API costs for large batch |
| Idempotent | Upserts on `{doc_id, chunk_index}` — safe to re-run |
| Command | `python3 scripts/ingest_bulk_local.py [--dry-run] [--limit N]` |

```
1. Crawl all 51 BMF listing pages → collect PDF URLs
2. For each document: check MongoDB (already ingested?) → skip if yes
3. Fetch PDF into memory → extract text with pdfplumber
4. Chunk: recursive split (1000 chars, 200 overlap, German legal separators)
5. Embed locally: mxbai-embed-de-large-v1 via sentence-transformers (1024 dims)
6. Upsert chunks + metadata into MongoDB Atlas
7. Buffer garbage-collected — no PDF bytes remain on disk or in memory
```

### Path 2 — Daily incremental updates (automated)

| | |
|---|---|
| Script | `scripts/ingest.ts` |
| Runs on | Server via node-cron (`0 6 * * *` — 6am daily, configurable via CRON_SCHEDULE) |
| Scope | New documents only (checks BMF listing for unseen URLs) |
| Embeddings | HuggingFace Inference API (negligible cost at 2–5 new docs/week) |
| Triggered by | Cron schedule registered on server startup in `server/src/index.ts` |

```
1. Scrape BMF listing page → collect PDF URLs
2. Check each URL against MongoDB → skip already-indexed documents
3. New only: fetch PDF into memory via axios — never write to disk
4. Extract text: pdf-parse (UTF-8, German umlauts handled)
5. Chunk: RecursiveCharacterTextSplitter
   - chunkSize: 512 tokens
   - overlap: 50 tokens
   - separators: ["\n\n", "\nRz.", "\n§", "\n1.", "\n2.", "\n"]
6. Extract metadata: date, GZ (Aktenzeichen), Steuerart, §-references, BMF URL
7. Embed: mxbai-embed-de-large-v1 via HuggingFace Inference API (1024 dims)
8. Upsert vectors + metadata into MongoDB Atlas — no PDF bytes stored
9. Buffer garbage-collected — no original document remains on server
```

### BMF URL Structure

```
https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/
  Steuerarten/
    [Steuerart]/
      [YYYY-MM-DD]-[slug].pdf?__blob=publicationFile&v=[version]
```

Known Steuerart categories:
- `Einkommensteuer`
- `Umsatzsteuer`
- `Koerperschaftsteuer_Umwandlungssteuer`
- `Lohnsteuer`
- `Umsatzsteuer/Umsatzsteuer-Anwendungserlass`

### Crawl Behaviour

robots.txt requires a 180-second crawl delay. This is strictly respected. `/Content/DE/` is not disallowed.

---

## Query Pipeline

```
1. User question → embed with identical model (mxbai-embed-de-large-v1)
2. $vectorSearch in MongoDB Atlas
   - index: "vector_index"
   - numCandidates: 100
   - limit: 5
   - optional filter: { "metadata.steuerart": <value> }
3. Top-K chunks + metadata → LLM prompt
4. LLM (Mistral) generates answer in its own words — no reproduction of source text
5. Response: answer text + structured source references with BMF URLs
```

---

## MongoDB Schema

### Collection: `bmf_chunks`

```json
{
  "_id": "ObjectId",
  "doc_id": "2025-03-06-kryptowerte",
  "chunk_index": 3,
  "text": "Beim Proof of Stake gilt die Blockerstellung...",
  "embedding": [0.023, -0.441, "... 1024 dims total"],
  "metadata": {
    "date": "2025-03-06",
    "gz": "IV C 1 - S 2256/19/10003",
    "steuerart": "Einkommensteuer",
    "title": "Einzelfragen zu Kryptowerten",
    "bmf_url": "https://www.bundesfinanzministerium.de/Content/DE/Downloads/...",
    "paragraphen": ["§22 EStG", "§23 EStG"],
    "is_superseded": false
  }
}
```

### Vector Search Index (create manually in Atlas UI)

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "metadata.steuerart"
    },
    {
      "type": "filter",
      "path": "metadata.date"
    }
  ]
}
```

> Vector Search indexes must be created manually in the Atlas UI on M0 — programmatic creation is not supported on the free tier.

---

## GraphQL Schema

```graphql
type Query {
  search(question: String!, steuerart: String): SearchResult!
  stats: IndexStats!
}

type SearchResult {
  answer: String!
  sources: [Source!]!
}

type Source {
  title: String!
  date: String!
  gz: String!
  steuerart: String!
  bmfUrl: String!
  relevanceScore: Float!
}

type IndexStats {
  totalDocuments: Int!
  lastUpdated: String!
  byCategory: [CategoryCount!]!
}

type CategoryCount {
  steuerart: String!
  count: Int!
}
```

---

## Embedding Model

**`mixedbread-ai/deepset-mxbai-embed-de-large-v1`**

- 1024 dimensions
- Trained on 30M+ German text pairs
- State-of-the-art for German retrieval tasks
- Supports Matryoshka truncation (512 dims @ 93% performance)
- Apache 2.0 license
- HuggingFace Inference API: free

Why not Gemini embeddings: Gemini free tier was cut to 20 requests/day in December 2025 — unusable for batch ingestion.

---

## Deployment

| Service | Purpose | Free Tier | Caveat |
|---|---|---|---|
| Vercel Hobby | React frontend | 100 GB BW/month | — |
| Render Free | Node.js backend | 750h/month, 512 MB RAM | 15 min spin-down |
| Koyeb Starter | Backend alternative | Always-on, 512 MB RAM | Recommended for demo |
| MongoDB Atlas M0 | Database + vectors | 512 MB storage | Vector Search included |

### Environment Variables (`.env`)

```
MISTRAL_API_KEY=
MONGODB_URI=mongodb+srv://...
HUGGINGFACE_API_KEY=
GROQ_API_KEY=
PORT=4000
CRON_SCHEDULE="0 6 * * *"
```
