#!/usr/bin/env python3
"""
backfill_tldrs.py — Generate TLDR summaries for chunks missing them.

Uses Ollama (local llama3) to generate 1-2 sentence summaries for each chunk.
Runs entirely on the local machine — no API costs, no rate limits.

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

import pymongo
from dotenv import load_dotenv

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"

TLDR_PROMPT_PREFIX = (
    "Fasse den folgenden Abschnitt aus einem BMF-Schreiben in 1-2 "
    "prägnanten Sätzen zusammen. Nur die Zusammenfassung, keine Einleitung.\n\n"
)

BATCH_LOG_INTERVAL = 50


def generate_tldr(chunk_text: str) -> str | None:
    """Call local Ollama to generate a TLDR. Returns None on failure."""
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": TLDR_PROMPT_PREFIX + chunk_text[:3000],
        "stream": False,
        "options": {"num_predict": 150},
    }).encode("utf-8")

    req = Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            content = body.get("response", "")
            if isinstance(content, str) and content.strip():
                return content.strip()
            return None
    except Exception as e:
        print(f"    Ollama error: {e}", flush=True)
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill TLDR summaries")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no generation")
    parser.add_argument("--limit", type=int, default=0, help="Max chunks to process (0=all)")
    args = parser.parse_args()

    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)

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
        print("\n[DRY RUN] No changes made.")
        client.close()
        return

    if total_missing == 0:
        print("\nAll chunks have TLDRs. Nothing to do.")
        client.close()
        return

    process_count = min(total_missing, args.limit) if args.limit > 0 else total_missing
    print(f"\nProcessing {process_count} chunks")
    print(f"Using local Ollama ({OLLAMA_MODEL})\n")

    cursor = col.find(missing_filter, {"_id": 1, "text": 1, "doc_id": 1, "chunk_index": 1})
    if args.limit > 0:
        cursor = cursor.limit(args.limit)

    generated = 0
    failed = 0
    start_time = time.time()
    for i, doc in enumerate(cursor):
        tldr = generate_tldr(doc["text"])

        if tldr:
            col.update_one({"_id": doc["_id"]}, {"$set": {"tldr": tldr}})
            generated += 1
        else:
            failed += 1

        if (i + 1) % BATCH_LOG_INTERVAL == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed * 60
            remaining = (process_count - i - 1) / rate if rate > 0 else 0
            print(
                f"  [{i + 1}/{process_count}] "
                f"generated={generated}, failed={failed}, "
                f"{rate:.1f}/min, ~{remaining:.0f}min remaining",
                flush=True,
            )

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed/60:.1f} minutes. Generated: {generated}, Failed: {failed}")

    # Final stats
    final_missing = col.count_documents(missing_filter)
    print(f"Remaining without TLDR: {final_missing}")

    client.close()


if __name__ == "__main__":
    main()
