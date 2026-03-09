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
cd server && npm run dev        # nodemon, port 4000
cd client && npm run dev        # vite, port 5173

# Tests (must pass before any commit)
cd server && npm test           # jest
cd scripts && npm test          # jest

# DSGVO compliance check (must pass before any commit or deploy)
node scripts/dsgvo-check.js

# Ingestion (run once to seed MongoDB)
node scripts/ingest.js

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
- No TypeScript (plain JS with JSDoc where helpful)
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
