#!/usr/bin/env python3
"""
backfill_tldrs.py — Generate TLDR summaries for chunks missing them.

Uses Groq API (free tier, llama-3.1-8b-instant) to generate 1-2 sentence
summaries for each chunk. Rate-limited to respect Groq free tier (30 RPM).

Safe to re-run: only processes chunks where tldr is null.

Usage:
    python scripts/backfill_tldrs.py [--dry-run] [--limit N]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import pymongo
from dotenv import load_dotenv

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"

TLDR_SYSTEM_PROMPT = (
    "Fasse den folgenden Abschnitt aus einem BMF-Schreiben in 1-2 "
    "prägnanten Sätzen zusammen. Nur die Zusammenfassung, keine Einleitung."
)

# Groq free tier: 30 RPM → 1 request every 2 seconds with margin
REQUEST_DELAY_SECONDS = 2.1
BATCH_LOG_INTERVAL = 50
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 10


def generate_tldr(api_key: str, chunk_text: str) -> str | None:
    """Call Groq API to generate a TLDR for a chunk. Returns None on failure."""
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": TLDR_SYSTEM_PROMPT},
            {"role": "user", "content": chunk_text[:3000]},
        ],
        "max_tokens": 150,
    }).encode("utf-8")

    req = Request(
        GROQ_API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Steuerpilot-TLDR/1.0",
        },
        method="POST",
    )

    for attempt in range(MAX_RETRIES):
        try:
            with urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                content = body.get("choices", [{}])[0].get("message", {}).get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
                return None
        except HTTPError as e:
            if e.code == 429:
                wait = RETRY_DELAY_SECONDS * (attempt + 1)
                print(f"    Rate limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            print(f"    HTTP {e.code}: {e.reason}", flush=True)
            return None
        except Exception as e:
            print(f"    Error: {e}", flush=True)
            return None
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill TLDR summaries")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no API calls")
    parser.add_argument("--limit", type=int, default=0, help="Max chunks to process (0=all)")
    args = parser.parse_args()

    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)

    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key and not args.dry_run:
        print("ERROR: GROQ_API_KEY not set")
        sys.exit(1)

    mongodb_uri = os.environ.get("MONGODB_URI")
    if not mongodb_uri:
        print("ERROR: MONGODB_URI not set")
        sys.exit(1)

    client: pymongo.MongoClient[dict[str, object]] = pymongo.MongoClient(mongodb_uri)
    db = client.get_default_database()
    col = db["bmf_chunks"]

    # Count chunks needing TLDRs
    missing_filter = {"$or": [{"tldr": None}, {"tldr": {"$exists": False}}]}
    total_missing = col.count_documents(missing_filter)
    total_has = col.count_documents({"tldr": {"$ne": None, "$exists": True}})
    total = col.count_documents({})

    print(f"Total chunks: {total}")
    print(f"Already have TLDR: {total_has}")
    print(f"Missing TLDR: {total_missing}")

    if args.dry_run:
        est_minutes = total_missing * REQUEST_DELAY_SECONDS / 60
        print(f"\n[DRY RUN] Estimated time: ~{est_minutes:.0f} minutes")
        client.close()
        return

    if total_missing == 0:
        print("\nAll chunks have TLDRs. Nothing to do.")
        client.close()
        return

    process_count = min(total_missing, args.limit) if args.limit > 0 else total_missing
    est_minutes = process_count * REQUEST_DELAY_SECONDS / 60
    print(f"\nProcessing {process_count} chunks (~{est_minutes:.0f} minutes estimated)")
    print(f"Using Groq API ({GROQ_MODEL})\n")

    cursor = col.find(missing_filter, {"_id": 1, "text": 1, "doc_id": 1, "chunk_index": 1})
    if args.limit > 0:
        cursor = cursor.limit(args.limit)

    generated = 0
    failed = 0
    for i, doc in enumerate(cursor):
        tldr = generate_tldr(groq_key, doc["text"])

        if tldr:
            col.update_one({"_id": doc["_id"]}, {"$set": {"tldr": tldr}})
            generated += 1
        else:
            failed += 1

        if (i + 1) % BATCH_LOG_INTERVAL == 0:
            print(
                f"  [{i + 1}/{process_count}] "
                f"generated={generated}, failed={failed}",
                flush=True,
            )

        time.sleep(REQUEST_DELAY_SECONDS)

    print(f"\nDone. Generated: {generated}, Failed: {failed}")

    # Final stats
    final_missing = col.count_documents(missing_filter)
    print(f"Remaining without TLDR: {final_missing}")

    client.close()


if __name__ == "__main__":
    main()
