# CLAUDE.md — Steuerpilot

This file governs how Claude Code operates in this repository.
Read it fully before writing any code, running any commands, or making any architectural decisions.

---

## Commands
```bash
# Install
cd server && npm install
cd client && npm install

# Dev
cd server && npm run dev        # tsx, port 4000
cd client && npm run dev        # vite, port 5173

# Tests (must pass before any commit)
cd server && npm test           # jest
cd scripts && npm test          # jest

# DSGVO compliance check (must pass before any commit or deploy)
node scripts/dsgvo-check.js

# Bulk backfill (one-time, runs locally on developer machine)
# Crawls all 51 BMF listing pages, embeds locally via sentence-transformers (CPU).
# Idempotent — upserts on {doc_id, chunk_index}, safe to re-run.
pip3 install -r scripts/requirements.txt
python3 scripts/ingest_bulk_local.py [--dry-run] [--limit N]

# Daily incremental ingestion (automated on server)
# Runs via node-cron (CRON_SCHEDULE, default "0 6 * * *").
# Watches BMF listing for new documents only, embeds via HuggingFace Inference API.
# Triggered automatically on server startup — no manual action needed.

# Lint
cd server && npm run lint
cd client && npm run lint
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Apollo Client |
| Backend | Node.js, Express 5, Apollo Server 5, GraphQL |
| Backend integration | @as-integrations/express5 + expressMiddleware |
| Database | MongoDB Atlas M0, Mongoose, Vector Search |
| Embeddings | HuggingFace Inference API — mixedbread-ai/deepset-mxbai-embed-de-large-v1 |
| LLM | Mistral API (primary), Groq (fallback) |
| PDF parsing | pdf-parse (in-memory only, never written to disk) |
| Chunking | @langchain/textsplitters RecursiveCharacterTextSplitter |
| Scheduling | node-cron |

---

## Code Style

- ES modules throughout (import/export, not require)
- async/await — no raw Promise chains
- Named exports — no default exports except React components
- TypeScript throughout, strict mode, no any
- Error messages in English, UI strings in German
- No console.log in production paths — use console.error for actual errors only

---

## Testing Rules

- All business logic must have unit tests
- npm test must be green before any commit
- Tests use Jest + Supertest (server) and Vitest (client)
- New modules ship with at least it.todo() stubs so coverage gaps are visible
- No mocking of the actual MongoDB vector search in integration tests — use a real Atlas M0 connection with a test collection

---

## Code Quality Standards

Apply these standards to all new code without being asked.

### TDD Workflow
Follow red-green-refactor:
1. Write a failing test that describes the behaviour
2. Write the minimum code to make it pass
3. Refactor — clean up without changing behaviour

Write tests before or alongside logic — never after the fact.
Boilerplate and scaffolding are exceptions. Any function containing
real business logic must have a test written before or during implementation,
not retrospectively.

### Clean Code Rules
- Functions do one thing — if you need "and" to describe it, split it
- Max function length: ~20 lines. If longer, extract
- Name variables and functions for what they mean, not what they are
  - BAD: data, result, temp, item, obj
  - GOOD: bmfChunk, embeddingVector, ingestResult
- No magic numbers or strings — use named constants
- Fail fast and explicitly — validate inputs at function entry, throw meaningful errors

### AI-First Workflow Discipline
- Use AI for: scaffolding, refactoring, test generation, boilerplate, debugging
- Always verify AI-generated logic with tests before moving on
- When a function is generated, write or generate a test for it immediately
- Document non-obvious decisions with a one-line comment explaining WHY, not WHAT

---

## TypeScript Standards

The entire codebase is TypeScript with strict mode enabled.
These rules are non-negotiable.

### Strict Mode Requirements
tsconfig.json enables:
- strict: true (covers noImplicitAny, strictNullChecks, strictFunctionTypes etc.)
- noUncheckedIndexedAccess: true
- noImplicitReturns: true
- noFallthroughCasesInSwitch: true
- skipLibCheck: true
// skipLibCheck skips vendor .d.ts files only — your own code remains fully type-checked.
// Acceptable for known vendor type bugs. Never use to hide errors in our own source files.

### Forbidden Patterns — Never Do These
```typescript
// FORBIDDEN: any type
const data: any = response

// FORBIDDEN: type assertion to bypass errors
const user = response as User

// FORBIDDEN: non-null assertion without genuine certainty
const name = user!.name

// FORBIDDEN: @ts-ignore or @ts-expect-error to silence errors
// @ts-ignore
doSomethingBroken()

// FORBIDDEN: implicit any in function parameters
function process(data) { ... }

// FORBIDDEN: empty catch that swallows errors
try {
  await riskyCall()
} catch (e) {}
```

### Required Patterns
```typescript
// CORRECT: explicit types on function signatures
async function fetchChunks(docId: string): Promise<BmfChunk[]> { ... }

// CORRECT: use unknown instead of any for external data
const response: unknown = await fetch(url)

// CORRECT: narrow unknown with type guards
function isBmfChunk(value: unknown): value is BmfChunk {
  return (
    typeof value === 'object' &&
    value !== null &&
    'doc_id' in value &&
    'text' in value
  )
}

// CORRECT: handle null/undefined explicitly
const chunk = chunks[0]
if (!chunk) throw new Error('No chunks returned for document')

// CORRECT: catch with unknown, narrow before using
try {
  await riskyCall()
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message)
  }
  throw error
}
```

### Type Definitions
- Define shared types in server/src/types/ directory
- One file per domain: chunk.types.ts, search.types.ts, llm.types.ts
- Export all types as named exports
- Mongoose documents get their own interface extending Document:
```typescript
import { Document } from 'mongoose'

export interface IBmfChunk {
  doc_id: string
  chunk_index: number
  text: string
  embedding: number[]
  metadata: {
    date: string
    gz: string
    steuerart: string
    title: string
    bmf_url: string
    paragraphen: string[]
    is_superseded: boolean
  }
}

export interface IBmfChunkDocument extends IBmfChunk, Document {}
```

### GraphQL + TypeScript
- Never type resolver return values as any
- Use generated types if possible, otherwise define resolver types explicitly
- Context type must be defined and used consistently:
```typescript
export interface ApolloContext {
  req: Request
}
```

### When You Hit a Type Error
1. Read the error message fully — it usually tells you exactly what is wrong
2. Fix the underlying issue — wrong type, missing null check, incorrect assumption
3. If genuinely stuck, use unknown + type guard, never any
4. Never use type assertions (as Type) unless you have verified the shape at runtime first
5. If a third-party library has no types: install @types/library — if none exist,
   write a minimal .d.ts declaration file in src/types/vendor/

---

## Stack-Specific Rules

### MongoDB / Mongoose
- Always define indexes in the Mongoose schema — schema is the source of truth, never create indexes manually in Atlas UI
- Vector search indexes are the exception — they must be created via Atlas UI or Atlas API, Mongoose cannot create them. Document this wherever vector search is configured.
- Never use findOne or find without a lean() call when you don't need Mongoose document methods — returns plain objects and is significantly faster
- Always handle the case where findOne returns null explicitly — never assume a document exists
- Never store raw user input directly — validate and sanitize at the service layer

### GraphQL / Apollo
- Resolvers must be thin — no business logic directly in a resolver
- Extract all logic to service functions in server/src/services/ that can be unit tested independently of GraphQL
- Never return raw Mongoose documents from resolvers — always call .toObject() or map to a plain object
- Always define explicit return types on resolvers matching the GraphQL schema

### RAG Pipeline
- Embedding calls to HuggingFace must always have a timeout and explicit error handling
- Never call the embedding service inside a resolver — embeddings are generated at ingest time only, not at query time
- LLM responses are non-deterministic — tests for LLM output must assert structure and presence only, never exact string content
- Always validate that embedding dimensions match (1024) before storing — a dimension mismatch silently breaks vector search

### Async Patterns
- Never use await inside a for loop unless serialization is explicitly required (e.g. respecting crawl delay in ingestion)
- Use Promise.all() for parallel async operations
- Always handle Promise.all() failures — if one fails, decide explicitly whether to fail fast or continue with partial results

### Error Handling
- All service functions must throw typed errors, not generic Error objects
- Define custom error classes in server/src/errors/:
```typescript
export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'EmbeddingError'
  }
}

export class VectorSearchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'VectorSearchError'
  }
}
```

---

## MCP — Context7

Context7 is configured to fetch up-to-date library documentation. Use it when working with:
- Apollo Server 5 and @as-integrations/express5
- MongoDB Atlas Vector Search (index syntax changes frequently)
- @langchain/textsplitters (recently split from main LangChain package)
- Mistral AI SDK
- HuggingFace Inference API

**QUOTA RULE — CRITICAL:**
Context7 free tier = 1,000 requests/month hard cap. There is no auto-renewal mid-month.

- Do NOT call context7 in loops, retries, or automated scripts
- Do NOT retry a failed context7 lookup — if it fails or returns empty, fall back to training knowledge and proceed immediately
- If context7 returns a rate limit error or empty result: log a single warning, continue without it, do not attempt workarounds or alternative queries
- Reserve context7 calls for genuinely ambiguous API questions, not for confirming things already known
- If quota appears exhausted mid-session: stop using context7 for the remainder of the session entirely

---

## DSGVO / Privacy Rules — STRICT, NON-NEGOTIABLE

These rules exist because Steuerpilot targets German Steuerberater (tax advisors).
Violations create legal liability under DSGVO Art. 6 and LG München I (Az. 3 O 17493/20).

### THE CORE RULE
No user IP address or browser fingerprint may ever be transmitted to a third-party server as a side effect of page load.

This means: every asset loaded by the browser must be served from our own origin.
The legal issue is not geography (not "must use German servers").
The legal issue is: third-party IP transmission without prior user consent.

### Prohibited patterns — never write these
```html
<!-- FORBIDDEN: Google Fonts via CDN -->
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">

<!-- FORBIDDEN: Any CDN-hosted JS/CSS fetched by the browser at runtime -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/..."></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/...">

<!-- FORBIDDEN: Any analytics beacon -->
<script async src="https://www.googletagmanager.com/..."></script>
```

### Required pattern

All fonts, icons, JS libraries, and CSS must be:
1. Installed via npm and bundled by Vite, OR
2. Copied into client/public/ and served as static assets from our own domain
```js
// CORRECT: npm-installed, bundled by Vite
import 'some-library/dist/style.css'

// CORRECT: local font in client/public/fonts/
// @font-face { src: url('/fonts/Inter.woff2') }

// FORBIDDEN: runtime fetch from any external CDN
```

### Server-side external calls (permitted)

These are backend-only — the browser never connects to these services directly:
- HuggingFace Inference API (embedding generation)
- Mistral API (LLM calls)
- Groq API (LLM fallback)
- bundesfinanzministerium.de (PDF ingestion via cron, never triggered by a user request)

### DSGVO compliance check

Run before every commit and every deployment:
```bash
node scripts/dsgvo-check.js
```

This script scans source files and built output for violations and exits non-zero on failure.
It is a hard gate — do not commit or deploy if it fails.

---

## Milestone Gates

Before marking any milestone complete, all three must pass:

1. npm test — all tests green
2. node scripts/dsgvo-check.js — exit 0
3. Manual browser check: DevTools → Network tab → reload → zero requests to external domains

### Milestone 1 — Ingestion pipeline
- [ ] scripts/ingest.js fetches, parses, chunks, embeds, stores BMF PDFs
- [ ] MongoDB Atlas has documents in bmf_chunks collection
- [ ] npm test passes
- [ ] dsgvo-check passes

### Milestone 2 — GraphQL API
- [ ] search(question) returns answer + sources
- [ ] Vector search returns relevant chunks
- [ ] LLM generates answer citing chunk metadata
- [ ] npm test passes
- [ ] dsgvo-check passes

### Milestone 3 — Frontend
- [ ] Search UI renders, submits query, displays answer + source links
- [ ] All fonts/assets self-hosted (verified via Network tab)
- [ ] npm test passes
- [ ] dsgvo-check passes

### Milestone 4 — Demo-ready
- [ ] Deployed to Vercel (frontend) + Render (backend)
- [ ] HTTPS on both
- [ ] Datenschutzerklärung page exists
- [ ] Impressum page exists (Pflichtangaben nach §5 TMG)
- [ ] dsgvo-check passes against production build
- [ ] Network tab on live URL shows zero external requests

---

## What Never Goes to Disk

- PDF binary content — fetch into memory buffer, extract text, discard buffer
- User queries — not persisted anywhere
- LLM responses — not persisted (stateless per request)

---

## Ingestion Constraints

- Respect bundesfinanzministerium.de robots.txt crawl delay: 180 seconds between requests
- Deduplicate by URL + version query param (?v=N)
- Mark superseded documents via metadata.is_superseded = true, do not delete

---

## Environment Variables

See .env.example for all required variables. Never commit .env.

Required:
- MONGODB_URI — Atlas connection string
- HUGGINGFACE_API_KEY
- MISTRAL_API_KEY
- GROQ_API_KEY
- PORT (default: 4000)
- ALLOWED_ORIGINS — comma-separated CORS origins (default: http://localhost:5173)
- CRON_SCHEDULE — cron expression for RSS ingestion (default: "0 6 * * *", or "disabled")
