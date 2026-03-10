#!/usr/bin/env python3
# Disable MPS before any PyTorch imports
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'
os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '0.0'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

"""
ingest_bulk_local.py — One-off local bulk ingestion of all historical BMF-Schreiben.

Crawls all 51 pages of the BMF publications listing, downloads PDFs in-memory,
chunks text, generates embeddings using sentence-transformers (CPU), and upserts
to MongoDB Atlas.

This script is never called by the Node.js application. It exists only for initial
seeding of the bmf_chunks collection.

Dependencies:
    pip install sentence-transformers pymongo requests beautifulsoup4 pdfplumber python-dotenv

Usage:
    python scripts/ingest_bulk_local.py [--dry-run] [--limit N]
"""

import argparse
import gc
import io
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber
import pymongo
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ── Constants ──────────────────────────────────────────────────────────────

BMF_BASE_URL = "https://www.bundesfinanzministerium.de"
BMF_LISTING_URL = (
    f"{BMF_BASE_URL}/Web/DE/Service/Publikationen/BMF_Schreiben/bmf_schreiben.html"
)
PAGINATION_PATTERN = "?gtp=246444_list%253D{page}#bmf-navIndex-top"
BMF_SCHREIBEN_PATH_FILTER = "/Downloads/BMF_Schreiben/"
TOTAL_PAGES = 51

CRAWL_DELAY_SECONDS = 3
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
EMBEDDING_DIMENSIONS = 1024
EMBEDDING_MODEL_NAME = "mixedbread-ai/deepset-mxbai-embed-de-large-v1"
# The mxbai model requires a prefix for document passages
PASSAGE_PREFIX = "passage: "

EMBED_BATCH_SIZE = 4
COLLECTION_NAME = "bmf_chunks"
REQUEST_TIMEOUT = 60


# ── Data classes ───────────────────────────────────────────────────────────


@dataclass
class BmfDocument:
    """A single BMF-Schreiben discovered on the listing page."""
    url: str
    title: str
    pdf_url: str = ""


@dataclass
class IngestionStats:
    """Tracks progress across the entire ingestion run."""
    pages_crawled: int = 0
    documents_found: int = 0
    documents_skipped: int = 0
    documents_processed: int = 0
    chunks_inserted: int = 0
    failed_urls: list[str] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)

    def elapsed(self) -> str:
        elapsed_sec = time.time() - self.start_time
        minutes = int(elapsed_sec // 60)
        seconds = int(elapsed_sec % 60)
        return f"{minutes}m {seconds}s"


# ── Text chunking ─────────────────────────────────────────────────────────


def chunk_text(text: str) -> list[str]:
    """
    Split text into overlapping chunks using a recursive strategy.
    Mirrors RecursiveCharacterTextSplitter logic with German legal separators.
    """
    separators = ["\n\n", "\nRz.", "\n§", "\n1.", "\n2.", "\n", " "]
    return _recursive_split(text, separators, CHUNK_SIZE, CHUNK_OVERLAP)


def _recursive_split(
    text: str,
    separators: list[str],
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    """Recursively split text by trying separators in order of priority."""
    if len(text) <= chunk_size:
        stripped = text.strip()
        return [stripped] if stripped else []

    # Find the best separator that actually exists in the text
    chosen_separator = ""
    for sep in separators:
        if sep in text:
            chosen_separator = sep
            break

    # If no separator found, force-split by character
    if not chosen_separator:
        chunks = []
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start = end - chunk_overlap if end < len(text) else end
        return chunks

    parts = text.split(chosen_separator)
    chunks: list[str] = []
    current = ""

    for part in parts:
        candidate = (
            current + chosen_separator + part if current else part
        )
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current.strip():
                chunks.append(current.strip())
            # If this single part exceeds chunk_size, recurse with remaining separators
            if len(part) > chunk_size:
                remaining_seps = separators[separators.index(chosen_separator) + 1 :]
                sub_chunks = _recursive_split(
                    part, remaining_seps, chunk_size, chunk_overlap
                )
                chunks.extend(sub_chunks)
                current = ""
            else:
                current = part

    if current.strip():
        chunks.append(current.strip())

    # Apply overlap by extending each chunk with the start of the next
    if chunk_overlap > 0 and len(chunks) > 1:
        overlapped: list[str] = []
        for i, chunk in enumerate(chunks):
            if i > 0:
                prev_end = chunks[i - 1][-chunk_overlap:]
                chunk = prev_end + chosen_separator + chunk
            overlapped.append(chunk.strip())
        chunks = overlapped

    return chunks


# ── Metadata extraction ───────────────────────────────────────────────────


def derive_steuerart(url: str) -> str:
    """Derive the Steuerart category from a BMF URL path."""
    steuerarten_match = re.search(r"BMF_Schreiben/Steuerarten/([^/]+)", url)
    if steuerarten_match:
        return steuerarten_match.group(1)

    weitere_match = re.search(r"BMF_Schreiben/Weitere_Steuerthemen/([^/]+)", url)
    if weitere_match:
        return weitere_match.group(1)

    int_match = re.search(
        r"BMF_Schreiben/Internationales_Steuerrecht/([^/]+)", url
    )
    if int_match:
        return f"Internationales_Steuerrecht/{int_match.group(1)}"

    return "Sonstige"


def extract_gz(text: str) -> str:
    """Extract the GZ (Aktenzeichen) from PDF text."""
    gz_match = re.search(
        r"(?:GZ|Gz|Az\.?|Aktenzeichen)[:\s]*([IVX]+\s+[A-Z]\s+\d+\s*-\s*S\s+[\d/]+)",
        text,
        re.IGNORECASE,
    )
    return gz_match.group(1).strip() if gz_match else ""


def extract_date_from_url(url: str) -> str:
    """Extract date (YYYY-MM-DD) from the URL path."""
    date_match = re.search(r"/(\d{4}-\d{2}-\d{2})-", url)
    return date_match.group(1) if date_match else ""


def extract_paragraphen(text: str) -> list[str]:
    """Extract §-references from text (e.g. '§22 EStG', '§ 23 EStG')."""
    matches = re.findall(r"§\s*\d+[a-z]?\s+(?:Abs\.\s*\d+\s+)?[A-Z][A-Za-z]+", text)
    # Normalize whitespace and deduplicate
    seen: set[str] = set()
    result: list[str] = []
    for match in matches:
        normalized = re.sub(r"\s+", " ", match).strip()
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def extract_doc_id(url: str) -> str:
    """Extract the doc_id from a BMF URL."""
    match = re.search(r"/([^/]+)\.(?:html|pdf)", url)
    return match.group(1) if match else url


# ── Crawling ──────────────────────────────────────────────────────────────


def fetch_page(session: requests.Session, page_number: int) -> list[BmfDocument]:
    """Fetch a single listing page and extract BMF-Schreiben PDF URLs."""
    if page_number == 1:
        url = BMF_LISTING_URL
    else:
        url = BMF_LISTING_URL + PAGINATION_PATTERN.format(page=page_number)

    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    documents: list[BmfDocument] = []

    # Find all links that point to BMF-Schreiben PDFs or detail pages
    for link in soup.find_all("a", href=True):
        href = link["href"]
        # Resolve relative URLs
        if not href.startswith("http"):
            href = BMF_BASE_URL + "/" + href.lstrip("/")

        # Only process BMF-Schreiben downloads
        if BMF_SCHREIBEN_PATH_FILTER not in href:
            continue

        title = link.get_text(strip=True)
        if not title:
            continue

        # Direct PDF link (contains __blob=publicationFile)
        if "__blob=publicationFile" in href:
            documents.append(BmfDocument(url=href, title=title, pdf_url=href))
        # HTML detail page — we'll extract the PDF URL from it later
        elif href.endswith(".html"):
            documents.append(BmfDocument(url=href, title=title))

    return documents


def extract_pdf_url_from_detail_page(
    session: requests.Session, detail_url: str
) -> str:
    """Fetch an HTML detail page and extract the PDF download URL."""
    response = session.get(detail_url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "__blob=publicationFile" in href:
            if not href.startswith("http"):
                return BMF_BASE_URL + "/" + href.lstrip("/")
            return href

    return ""


def crawl_all_pages(
    session: requests.Session,
    stats: IngestionStats,
    limit: int,
    dry_run: bool,
) -> list[BmfDocument]:
    """Crawl all listing pages and collect unique BMF-Schreiben documents."""
    all_documents: list[BmfDocument] = []
    seen_urls: set[str] = set()

    for page in range(1, TOTAL_PAGES + 1):
        print(f"\n[Page {page}/{TOTAL_PAGES}] Fetching listing page...")
        try:
            documents = fetch_page(session, page)
            stats.pages_crawled += 1
            new_count = 0

            for doc in documents:
                if doc.url in seen_urls:
                    continue
                seen_urls.add(doc.url)
                all_documents.append(doc)
                new_count += 1

                if len(all_documents) >= limit:
                    break

            print(f"  Found {new_count} new documents (total: {len(all_documents)})")

        except requests.RequestException as exc:
            print(f"  ERROR fetching page {page}: {exc}")
            stats.failed_urls.append(f"page-{page}")

        if len(all_documents) >= limit:
            print(f"\nReached --limit={limit}, stopping crawl.")
            break

        # Crawl delay between pages
        if page < TOTAL_PAGES:
            time.sleep(CRAWL_DELAY_SECONDS)

    stats.documents_found = len(all_documents)
    print(f"\nTotal unique documents found: {len(all_documents)}")

    if dry_run:
        return all_documents

    # Resolve PDF URLs for detail pages
    print("\nResolving PDF URLs for detail pages...")
    for i, doc in enumerate(all_documents):
        if doc.pdf_url:
            continue
        try:
            time.sleep(CRAWL_DELAY_SECONDS)
            pdf_url = extract_pdf_url_from_detail_page(session, doc.url)
            if pdf_url:
                doc.pdf_url = pdf_url
            else:
                print(f"  SKIP: No PDF found on {doc.url}")
        except requests.RequestException as exc:
            print(f"  ERROR resolving PDF for {doc.title}: {exc}")
            stats.failed_urls.append(doc.url)

    return all_documents


# ── PDF processing ────────────────────────────────────────────────────────


def fetch_and_parse_pdf(session: requests.Session, pdf_url: str) -> str:
    """
    Fetch a PDF into memory and extract text. Never writes to disk.
    Uses pdfplumber for reliable German text extraction.
    """
    response = session.get(pdf_url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()

    pdf_bytes = io.BytesIO(response.content)
    text_parts: list[str] = []

    with pdfplumber.open(pdf_bytes) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    return "\n\n".join(text_parts)


# ── MongoDB operations ────────────────────────────────────────────────────


def document_already_ingested(
    collection: pymongo.collection.Collection,  # type: ignore[type-arg]
    source_url: str,
) -> bool:
    """Check if chunks for a given source URL already exist with embeddings."""
    existing = collection.find_one(
        {"metadata.bmf_url": source_url, "embedding": {"$exists": True, "$ne": []}},
    )
    return existing is not None


def upsert_chunks(
    collection: pymongo.collection.Collection,  # type: ignore[type-arg]
    chunks: list[str],
    embeddings: list[list[float]],
    metadata: dict[str, object],
    doc_id: str,
) -> int:
    """Upsert chunk documents into MongoDB. Returns number of new inserts."""
    operations = []
    for i, (chunk_text_val, embedding) in enumerate(zip(chunks, embeddings)):
        operations.append(
            pymongo.UpdateOne(
                {"doc_id": doc_id, "chunk_index": i},
                {
                    "$setOnInsert": {
                        "doc_id": doc_id,
                        "chunk_index": i,
                        "text": chunk_text_val,
                        "embedding": embedding,
                        "metadata": {
                            **metadata,
                            "is_superseded": False,
                        },
                    }
                },
                upsert=True,
            )
        )

    if not operations:
        return 0

    result = collection.bulk_write(operations)
    return result.upserted_count


# ── Main ingestion ────────────────────────────────────────────────────────


def run_ingestion(dry_run: bool = False, limit: int = sys.maxsize) -> None:
    """Orchestrate the full bulk ingestion pipeline."""
    # Load .env from project root
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)

    mongodb_uri = os.environ.get("MONGODB_URI")
    if not mongodb_uri:
        print("ERROR: MONGODB_URI not set in environment or .env file")
        sys.exit(1)

    stats = IngestionStats()
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Steuerpilot-Bulk-Ingestion/1.0 (one-off local script)",
        }
    )

    # Phase 1: Crawl all pages
    print("=" * 60)
    print("  Steuerpilot — Bulk Local Ingestion")
    print(f"  Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    if limit < sys.maxsize:
        print(f"  Limit: {limit} documents")
    print("=" * 60)

    documents = crawl_all_pages(session, stats, limit, dry_run)

    if dry_run:
        print("\n" + "=" * 60)
        print("  DRY RUN SUMMARY")
        print(f"  Pages crawled: {stats.pages_crawled}")
        print(f"  Documents found: {stats.documents_found}")
        print(f"  Elapsed: {stats.elapsed()}")
        if stats.failed_urls:
            print(f"  Failed URLs: {len(stats.failed_urls)}")
            for url in stats.failed_urls:
                print(f"    - {url}")
        print("=" * 60)
        return

    # Phase 2: Load embedding model
    print("\nLoading embedding model (this may take a few minutes on first run)...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(EMBEDDING_MODEL_NAME, device="cpu")
    print(f"  Model loaded: {EMBEDDING_MODEL_NAME}")

    # Phase 3: Connect to MongoDB
    client: pymongo.MongoClient[dict[str, object]] = pymongo.MongoClient(mongodb_uri)
    db = client.get_default_database()
    if db is None:
        print("ERROR: No default database in MONGODB_URI. Include database name in the URI.")
        sys.exit(1)
    collection = db[COLLECTION_NAME]
    print(f"  Connected to MongoDB, collection: {COLLECTION_NAME}")

    # Phase 4: Process each document
    processable = [doc for doc in documents if doc.pdf_url]
    print(f"\n{len(processable)} documents with PDF URLs ready for processing.\n")

    for i, doc in enumerate(processable):
        print(f"[{i + 1}/{len(processable)}] {doc.title}")
        print(f"  URL: {doc.pdf_url}")

        # Checkpoint: skip if already ingested
        if document_already_ingested(collection, doc.pdf_url):
            print("  SKIP: Already ingested")
            stats.documents_skipped += 1
            continue

        try:
            # Download and parse PDF in memory
            time.sleep(CRAWL_DELAY_SECONDS)
            text = fetch_and_parse_pdf(session, doc.pdf_url)
            if not text.strip():
                print("  SKIP: Empty PDF text")
                stats.failed_urls.append(doc.pdf_url)
                continue
            print(f"  Extracted {len(text)} characters")

            # Chunk text
            chunks = chunk_text(text)
            if not chunks:
                print("  SKIP: No chunks produced")
                stats.failed_urls.append(doc.pdf_url)
                continue
            print(f"  Created {len(chunks)} chunks")

            # Generate embeddings with passage: prefix (batched to avoid OOM on large docs)
            prefixed_chunks = [PASSAGE_PREFIX + c for c in chunks]
            embedding_list: list[list[float]] = []
            total_batches = (len(prefixed_chunks) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
            for batch_idx, batch_start in enumerate(range(0, len(prefixed_chunks), EMBED_BATCH_SIZE)):
                batch = prefixed_chunks[batch_start:batch_start + EMBED_BATCH_SIZE]
                batch_embeddings = model.encode(batch, show_progress_bar=False)
                embedding_list.extend(batch_embeddings.tolist())
                del batch_embeddings
                gc.collect()
                if total_batches > 5 and (batch_idx + 1) % 5 == 0:
                    print(f"    Embedded batch {batch_idx + 1}/{total_batches}")

            # Validate dimensions
            for emb in embedding_list:
                if len(emb) != EMBEDDING_DIMENSIONS:
                    raise ValueError(
                        f"Embedding dimension mismatch: expected {EMBEDDING_DIMENSIONS}, "
                        f"got {len(emb)}"
                    )
            print(f"  Generated {len(embedding_list)} embeddings ({EMBEDDING_DIMENSIONS}d)")

            # Build metadata
            date = extract_date_from_url(doc.pdf_url)
            metadata = {
                "date": date,
                "gz": extract_gz(text),
                "steuerart": derive_steuerart(doc.pdf_url),
                "title": doc.title,
                "bmf_url": doc.pdf_url,
                "paragraphen": extract_paragraphen(text),
            }

            # Upsert to MongoDB
            doc_id = extract_doc_id(doc.pdf_url)
            inserted = upsert_chunks(collection, chunks, embedding_list, metadata, doc_id)
            print(f"  Upserted: {inserted} new chunks")

            stats.documents_processed += 1
            stats.chunks_inserted += inserted

        except Exception as exc:
            print(f"  ERROR: {exc}")
            stats.failed_urls.append(doc.pdf_url)

        # Progress summary every 10 documents
        if (i + 1) % 10 == 0:
            print(f"\n  --- Progress: {stats.documents_processed} processed, "
                  f"{stats.chunks_inserted} chunks, {stats.elapsed()} elapsed ---\n")

    # Phase 5: Summary
    client.close()
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Pages crawled: {stats.pages_crawled}")
    print(f"  Documents found: {stats.documents_found}")
    print(f"  Documents processed: {stats.documents_processed}")
    print(f"  Documents skipped (already ingested): {stats.documents_skipped}")
    print(f"  Total chunks inserted: {stats.chunks_inserted}")
    print(f"  Elapsed: {stats.elapsed()}")
    if stats.failed_urls:
        print(f"\n  FAILED URLs ({len(stats.failed_urls)}):")
        for url in stats.failed_urls:
            print(f"    - {url}")
    print("=" * 60)


# ── CLI entry point ───────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Bulk ingestion of BMF-Schreiben into MongoDB Atlas"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Crawl and count documents without downloading or embedding",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=sys.maxsize,
        help="Process only the first N documents",
    )
    args = parser.parse_args()

    run_ingestion(dry_run=args.dry_run, limit=args.limit)
