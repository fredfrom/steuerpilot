# Steuerpilot

Semantic search engine for German tax authority rulings (BMF-Schreiben).

Ask a question in plain German. Get a direct answer with a source link to the original document on bundesfinanzministerium.de.

> **Demo:** [coming soon] · **Stack:** React · Apollo GraphQL · Node.js · MongoDB Atlas · Mistral API
>
> ⚠️ Hosted on Render free tier — first request after inactivity may take ~30s (cold start). Subsequent requests are fast.

---

## The Problem

The German Federal Ministry of Finance (BMF) publishes hundreds of official rulings that define how tax law is applied in practice. The official website offers 52 pages of chronologically sorted PDFs — no full-text search, no semantic search, no context.

Existing AI solutions (DATEV LEXchat, Haufe CoPilot, NWB KIRA) cost €99–€3,730/month.

Steuerpilot is free.

---

## How It Works

1. User asks a question in natural German
2. Question is embedded as a vector and searched against indexed BMF-Schreiben
3. Relevant chunks are passed to an LLM as context
4. Answer is generated in the LLM's own words — with source citations and links to the original documents

Steuerpilot stores no PDFs. It indexes only vector representations and metadata.

---

## Tech Stack

| Layer | Service | Cost |
|---|---|---|
| LLM | Mistral API | Free (1B tokens/month) |
| Embeddings | HuggingFace `mxbai-embed-de-large-v1` | Free |
| Database | MongoDB Atlas M0 + Vector Search | Free |
| Backend | Node.js + Express + Apollo GraphQL | Free (Render/Koyeb) |
| Frontend | React + Apollo Client | Free (Vercel) |

No credit card required anywhere.

---

## Quickstart

```bash
# Backend
cd server
cp .env.example .env   # add Mistral API key + MongoDB URI
npm install
npm run dev

# Frontend
cd client
npm install
npm run dev

# Ingest BMF-Schreiben (run once, then daily via cron)
npm run ingest
```

---

## Docs

- [Architecture & Tech Stack](docs/ARCHITECTURE.md)
- [Legal Considerations](docs/LEGAL.md)
- [Roadmap](docs/ROADMAP.md)

---

## Known Limitations

- MongoDB Atlas network access set to `0.0.0.0/0` due to Render free tier dynamic IPs. Production fix: Render static IP add-on ($) + Atlas IP whitelist.

---

## Disclaimer

**Demo / Proof of Concept** — This project is an experimental tool built to explore RAG pipelines applied to German tax law. It is free to use, provided as-is, with no guarantees of accuracy, completeness or availability. Nothing in this tool constitutes legal or tax advice. Always consult a licensed Steuerberater for binding guidance. Maßgeblich ist stets das Originaldokument auf [bundesfinanzministerium.de](https://www.bundesfinanzministerium.de).