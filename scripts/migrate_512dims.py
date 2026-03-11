#!/usr/bin/env python3
"""
migrate_512dims.py — Truncate embeddings from 1024 to 512 dimensions (Matryoshka).

Reads each chunk's 1024-dim embedding, truncates to first 512 dimensions,
re-normalizes to unit length, and updates the document in-place.

When over Atlas M0 quota, works in batches: delete a batch, then re-insert
with truncated embeddings.

Safe to re-run: skips chunks that already have exactly 512 dimensions.

Usage:
    python scripts/migrate_512dims.py [--dry-run]
"""

import argparse
import math
import os
import sys
from pathlib import Path

import pymongo
from dotenv import load_dotenv

TARGET_DIMS = 256
BATCH_SIZE = 500


def l2_normalize(vec: list[float]) -> list[float]:
    """Normalize a vector to unit length."""
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def main() -> None:
    parser = argparse.ArgumentParser(description="Truncate embeddings to 512 dims")
    parser.add_argument("--dry-run", action="store_true", help="Print stats without modifying data")
    args = parser.parse_args()

    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("ERROR: MONGODB_URI not set")
        sys.exit(1)

    client: pymongo.MongoClient[dict[str, object]] = pymongo.MongoClient(uri)
    db = client.get_default_database()
    col = db["bmf_chunks"]

    total = col.count_documents({})
    already_done = col.count_documents({"$expr": {"$eq": [{"$size": "$embedding"}, TARGET_DIMS]}})
    needs_migration = col.count_documents({"$expr": {"$gt": [{"$size": "$embedding"}, TARGET_DIMS]}})

    print(f"Total chunks: {total}")
    print(f"Already {TARGET_DIMS}d: {already_done}")
    print(f"Need migration (>{TARGET_DIMS}d): {needs_migration}")

    if args.dry_run:
        print("\n[DRY RUN] No changes made.")
        client.close()
        return

    if needs_migration == 0:
        print("\nNothing to migrate.")
        client.close()
        return

    print(f"\nMigrating {needs_migration} chunks in batches of {BATCH_SIZE}...")
    print("Strategy: delete batch → re-insert with truncated embeddings\n")

    migrated = 0
    while True:
        # Fetch a batch of documents that still need migration
        batch = list(col.find(
            {"$expr": {"$gt": [{"$size": "$embedding"}, TARGET_DIMS]}},
        ).limit(BATCH_SIZE))

        if not batch:
            break

        # Prepare truncated versions
        truncated_docs = []
        ids_to_delete = []
        for doc in batch:
            embedding = doc["embedding"]
            truncated = list(embedding[:TARGET_DIMS])
            normalized = l2_normalize(truncated)
            doc["embedding"] = normalized
            truncated_docs.append(doc)
            ids_to_delete.append(doc["_id"])

        # Delete originals (allowed even over quota)
        col.delete_many({"_id": {"$in": ids_to_delete}})

        # Re-insert with truncated embeddings (now under quota after delete)
        col.insert_many(truncated_docs)

        migrated += len(batch)
        print(f"  Migrated {migrated}/{needs_migration}...", flush=True)

    print(f"\nDone. Migrated {migrated} chunks total.")

    # Verify
    still_big = col.count_documents({"$expr": {"$gt": [{"$size": "$embedding"}, TARGET_DIMS]}})
    now_small = col.count_documents({"$expr": {"$eq": [{"$size": "$embedding"}, TARGET_DIMS]}})
    print(f"Post-migration: {now_small} chunks at {TARGET_DIMS}d, {still_big} still >{TARGET_DIMS}d")

    # Storage check
    stats = db.command("dbStats")
    print(f"DB storage: {stats['storageSize'] / 1024 / 1024:.1f} MB")
    print(f"DB dataSize: {stats['dataSize'] / 1024 / 1024:.1f} MB")

    client.close()


if __name__ == "__main__":
    main()
