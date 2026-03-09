import { Mistral } from "@mistralai/mistralai";
import axios from "axios";
import { createRequire } from "module";
// Rename to avoid clash with CJS `require` global in test environments
const esmRequire = createRequire(import.meta.url);
const { PDFParse } = esmRequire("pdf-parse") as {
  PDFParse: new (opts: { data: Uint8Array }) => {
    load: () => Promise<void>;
    getText: () => Promise<{ text: string; pages: unknown; total: number }>;
  };
};
import mongoose from "mongoose";
import dotenv from "dotenv";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

// ── Types ──────────────────────────────────────────────────────────────

interface BmfListingEntry {
  url: string;
  title: string;
  date: string;
  steuerart: string;
}

interface BmfDocumentMetadata {
  date: string;
  gz: string;
  steuerart: string;
  title: string;
  bmf_url: string;
  paragraphen: string[];
}

interface UpsertResult {
  inserted: number;
  skipped: number;
}

interface IngestionConfig {
  limit: number;
  crawlDelayMs: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const EMBEDDING_DIMENSIONS = 1024;
const BMF_BASE_URL = "https://www.bundesfinanzministerium.de";
const RSS_FEED_URL = `${BMF_BASE_URL}/SiteGlobals/Functions/RSSFeed/DE/Steuern/RSSSteuern.xml`;
const HUGGINGFACE_API_URL =
  "https://router.huggingface.co/hf-inference/models/mixedbread-ai/deepset-mxbai-embed-de-large-v1/pipeline/feature-extraction";
// Only ingest URLs containing this path segment
const BMF_SCHREIBEN_PATH_FILTER = "/Downloads/BMF_Schreiben/";

// Future data sources to consider: BFH decisions, Gleich lautende Erlasse (GLE)
// These are legally relevant to Steuerberater but out of scope for v1 demo.
// BFH decisions use a different document structure and legal authority —
// they should be stored in a separate collection with clear source labeling.

const PRODUCTION_CRAWL_DELAY_MS = 180_000;
const DEFAULT_CONFIG: IngestionConfig = {
  limit: Infinity,
  crawlDelayMs: PRODUCTION_CRAWL_DELAY_MS,
};

// ── Mongoose Schema (inline to avoid cross-package import) ─────────────

const bmfChunkSchema = new mongoose.Schema({
  doc_id: { type: String, required: true, index: true },
  chunk_index: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  tldr: { type: String, default: null },
  metadata: {
    date: { type: String, required: true },
    gz: { type: String, required: true },
    steuerart: { type: String, required: true },
    title: { type: String, required: true },
    bmf_url: { type: String, required: true },
    paragraphen: { type: [String], default: [] },
    is_superseded: { type: Boolean, default: false },
  },
});
bmfChunkSchema.index({ doc_id: 1, chunk_index: 1 }, { unique: true });
const BmfChunk = mongoose.model("BmfChunk", bmfChunkSchema, "bmf_chunks");

// ── Helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TLDR_SYSTEM_PROMPT =
  "Fasse den folgenden Abschnitt aus einem BMF-Schreiben in 1-2 prägnanten Sätzen zusammen. Nur die Zusammenfassung, keine Einleitung.";
const TLDR_DELAY_MS = 500;

/**
 * Generate a short TLDR summary for a chunk of text via Mistral.
 * Returns null on any failure — TLDR is non-critical.
 */
async function generateTldr(chunkText: string): Promise<string | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Mistral({ apiKey });
    const response = await client.chat.complete(
      {
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: TLDR_SYSTEM_PROMPT },
          { role: "user", content: chunkText },
        ],
        maxTokens: 150,
      },
      { timeoutMs: 30_000 }
    );
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    return content.trim();
  } catch {
    return null;
  }
}

/** Decode common XML/HTML entities */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10))
    );
}

/**
 * Extract the doc_id from a BMF URL.
 * e.g. ".../2026-02-27-aenderung-aeao-122a.html" → "2026-02-27-aenderung-aeao-122a"
 */
function extractDocId(url: string): string {
  const match = url.match(/\/([^/]+)\.(?:html|pdf)/);
  return match?.[1] ?? url;
}

/**
 * Derive the Steuerart category from a BMF URL path.
 * URL pattern: /Downloads/BMF_Schreiben/Steuerarten/<Steuerart>/...
 * or: /Downloads/BMF_Schreiben/Weitere_Steuerthemen/<Topic>/...
 */
function deriveSteuerart(url: string): string {
  const steuerartenMatch = url.match(
    /BMF_Schreiben\/Steuerarten\/([^/]+)/
  );
  if (steuerartenMatch?.[1]) return steuerartenMatch[1];

  const weitereMatch = url.match(
    /BMF_Schreiben\/Weitere_Steuerthemen\/([^/]+)/
  );
  if (weitereMatch?.[1]) return weitereMatch[1];

  const intMatch = url.match(
    /BMF_Schreiben\/Internationales_Steuerrecht\/([^/]+)/
  );
  if (intMatch?.[1]) return `Internationales_Steuerrecht/${intMatch[1]}`;

  return "Sonstige";
}

// ── Core Functions ─────────────────────────────────────────────────────

/**
 * Fetch the BMF RSS feed and extract entries that link to BMF-Schreiben.
 * Filters: only URLs containing "/Downloads/BMF_Schreiben/".
 */
export async function fetchRssFeed(): Promise<BmfListingEntry[]> {
  const response = await axios.get<string>(RSS_FEED_URL, {
    timeout: 30_000,
    responseType: "text",
  });
  const xml = response.data;

  const items: BmfListingEntry[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1] ?? "";
    const title = decodeEntities(
      itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? ""
    );
    const link = decodeEntities(
      itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? ""
    );
    const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";

    // Future data sources to consider: BFH decisions, Gleich lautende Erlasse (GLE)
    // These are legally relevant to Steuerberater but out of scope for v1 demo.
    // BFH decisions use a different document structure and legal authority —
    // they should be stored in a separate collection with clear source labeling.
    if (!link.includes(BMF_SCHREIBEN_PATH_FILTER)) continue;

    const dateMatch = link.match(/\/(\d{4}-\d{2}-\d{2})-/);
    const date = dateMatch?.[1] ?? new Date(pubDate).toISOString().slice(0, 10);

    items.push({
      url: link,
      title,
      date,
      steuerart: deriveSteuerart(link),
    });
  }

  return items;
}

/**
 * Fetch an HTML detail page and extract the PDF download URL.
 * Looks for links containing "?__blob=publicationFile".
 */
export async function extractPdfUrl(htmlPageUrl: string): Promise<string | null> {
  const response = await axios.get<string>(htmlPageUrl, {
    timeout: 30_000,
    responseType: "text",
  });
  const html = response.data;

  const pdfMatch = html.match(
    /href="([^"]*\?__blob=publicationFile[^"]*)"/
  );
  if (!pdfMatch?.[1]) return null;

  const pdfPath = decodeEntities(pdfMatch[1]);
  // Resolve relative URLs
  if (pdfPath.startsWith("http")) return pdfPath;
  return `${BMF_BASE_URL}${pdfPath}`;
}

/**
 * Fetch a PDF from the given URL into memory and extract its text content.
 * The PDF is never written to disk — it is processed entirely in memory.
 */
export async function fetchAndParsePdf(url: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 60_000,
  });
  const buffer = Buffer.from(response.data);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const result = await parser.getText();
  return result.text;
}

/**
 * Split text into chunks using RecursiveCharacterTextSplitter.
 * Configured for German legal text with custom separators.
 */
export async function chunkText(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 50,
    separators: ["\n\n", "\nRz.", "\n§", "\n1.", "\n2.", "\n"],
  });
  return splitter.splitText(text);
}

/**
 * Extract structured metadata from the PDF text and URL.
 * Parses: publication date, GZ (Aktenzeichen), Steuerart, and §-references.
 */
export function extractMetadata(
  text: string,
  url: string,
  title: string
): BmfDocumentMetadata {
  // Parse date from URL pattern YYYY-MM-DD
  const dateMatch = url.match(/\/(\d{4}-\d{2}-\d{2})-/);
  const date = dateMatch?.[1] ?? "";

  // Extract GZ (e.g., "IV C 1 - S 2256/19/10003") from text
  const gzMatch = text.match(
    /(?:GZ|Gz|Az\.?|Aktenzeichen)[:\s]*([IVX]+\s+[A-Z]\s+\d+\s*-\s*S\s+[\d/]+)/i
  );
  const gz = gzMatch?.[1]?.trim() ?? "";

  // Derive Steuerart from URL path
  const steuerart = deriveSteuerart(url);

  // Extract §-references (e.g., "§22 EStG", "§ 23 EStG")
  const paragraphenSet = new Set<string>();
  const paragraphRegex = /§\s*\d+[a-z]?\s+(?:Abs\.\s*\d+\s+)?[A-Z][A-Za-z]+/g;
  let paragraphMatch: RegExpExecArray | null;
  while ((paragraphMatch = paragraphRegex.exec(text)) !== null) {
    if (paragraphMatch[0]) {
      paragraphenSet.add(paragraphMatch[0].replace(/\s+/g, " ").trim());
    }
  }

  return {
    date,
    gz,
    steuerart,
    title,
    bmf_url: url,
    paragraphen: [...paragraphenSet],
  };
}

/**
 * Embed an array of text chunks using the HuggingFace Inference API.
 * Model: mixedbread-ai/deepset-mxbai-embed-de-large-v1 (1024 dimensions).
 * Sends chunks one at a time to avoid payload size limits.
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error("HUGGINGFACE_API_KEY not set");

  const embeddings: number[][] = [];

  for (const chunk of chunks) {
    const response = await axios.post<number[]>(
      HUGGINGFACE_API_URL,
      { inputs: chunk },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30_000,
      }
    );

    const embedding = Array.isArray(response.data[0])
      ? (response.data[0] as number[])
      : response.data;

    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: expected ${String(EMBEDDING_DIMENSIONS)}, got ${String(embedding.length)}`
      );
    }

    embeddings.push(embedding);
  }

  return embeddings;
}

/**
 * Upsert chunk documents with embeddings and metadata into MongoDB Atlas.
 * Uses doc_id + chunk_index as a composite unique key to skip already-indexed documents.
 */
export async function upsertToMongodb(
  chunks: string[],
  embeddings: number[][],
  metadata: BmfDocumentMetadata,
  tldrs: (string | null)[] = []
): Promise<UpsertResult> {
  const docId = extractDocId(metadata.bmf_url);

  const operations = chunks.map((text, index) => ({
    updateOne: {
      filter: { doc_id: docId, chunk_index: index },
      update: {
        $setOnInsert: {
          doc_id: docId,
          chunk_index: index,
          text,
          embedding: embeddings[index],
          tldr: tldrs[index] ?? null,
          metadata: {
            ...metadata,
            is_superseded: false,
          },
        },
      },
      upsert: true,
    },
  }));

  const result = await BmfChunk.bulkWrite(operations);
  return {
    inserted: result.upsertedCount,
    skipped: result.matchedCount,
  };
}

/**
 * Orchestrate the full ingestion pipeline.
 * 1. Fetch RSS feed for BMF-Schreiben entries
 * 2. For each new document: fetch HTML → extract PDF URL → fetch PDF → chunk → embed → upsert
 * 3. Respect crawl delay between requests (configurable)
 */
export async function runIngestion(
  config: IngestionConfig = DEFAULT_CONFIG
): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB Atlas");

  try {
    console.log("Fetching RSS feed...");
    const entries = await fetchRssFeed();
    console.log(
      `Found ${String(entries.length)} BMF-Schreiben entries in RSS feed`
    );

    const toProcess = entries.slice(0, config.limit);
    let totalInserted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const entry = toProcess[i]!;
      console.log(
        `\n[${String(i + 1)}/${String(toProcess.length)}] Processing: ${entry.title}`
      );

      // Crawl delay between requests (not before the first one)
      if (i > 0) {
        console.log(
          `  Waiting ${String(config.crawlDelayMs / 1000)}s crawl delay...`
        );
        await sleep(config.crawlDelayMs);
      }

      try {
        // Step 1: Fetch HTML detail page → extract PDF URL
        console.log("  Fetching HTML detail page...");
        const pdfUrl = await extractPdfUrl(entry.url);
        if (!pdfUrl) {
          console.log("  SKIP: No PDF link found on detail page");
          continue;
        }
        console.log(`  PDF URL: ${pdfUrl}`);

        // Step 2: Fetch PDF into memory → extract text
        await sleep(config.crawlDelayMs);
        console.log("  Fetching and parsing PDF...");
        const text = await fetchAndParsePdf(pdfUrl);
        if (!text.trim()) {
          console.log("  SKIP: PDF text extraction returned empty");
          continue;
        }
        console.log(`  Extracted ${String(text.length)} characters`);

        // Step 3: Chunk text
        console.log("  Chunking text...");
        const chunks = await chunkText(text);
        console.log(`  Created ${String(chunks.length)} chunks`);

        // Step 4: Extract metadata
        const metadata = extractMetadata(text, pdfUrl, entry.title);
        // Use the more reliable date from RSS/URL if PDF extraction missed it
        if (!metadata.date && entry.date) {
          metadata.date = entry.date;
        }

        // Step 5: Embed chunks
        console.log("  Embedding chunks...");
        const embeddings = await embedChunks(chunks);
        console.log(`  Generated ${String(embeddings.length)} embeddings`);

        // Step 5.5: Generate TLDRs
        console.log(`  Generating TLDRs for ${entry.title}...`);
        const tldrs: (string | null)[] = [];
        for (let ci = 0; ci < chunks.length; ci++) {
          const tldr = await generateTldr(chunks[ci]!);
          tldrs.push(tldr);
          if (ci < chunks.length - 1) {
            await sleep(TLDR_DELAY_MS);
          }
        }
        const tldrCount = tldrs.filter((t) => t !== null).length;
        console.log(`  Generated ${String(tldrCount)}/${String(chunks.length)} TLDRs`);

        // Step 6: Upsert to MongoDB
        console.log("  Upserting to MongoDB...");
        const result = await upsertToMongodb(chunks, embeddings, metadata, tldrs);
        console.log(
          `  Inserted: ${String(result.inserted)}, Skipped: ${String(result.skipped)}`
        );

        totalInserted += result.inserted;
        totalSkipped += result.skipped;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`  ERROR processing ${entry.title}: ${message}`);
      }
    }

    console.log("\n════════════════════════════════════════");
    console.log(`Ingestion complete.`);
    console.log(`  Total chunks inserted: ${String(totalInserted)}`);
    console.log(`  Total chunks skipped: ${String(totalSkipped)}`);
    console.log("════════════════════════════════════════");
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// ── CLI entry point ────────────────────────────────────────────────────

const isMain = process.argv[1]?.includes("ingest");
if (isMain) {
  // Parse CLI args: --limit=N --delay=N
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const delayArg = process.argv.find((a) => a.startsWith("--delay="));

  const config: IngestionConfig = {
    limit: limitArg ? parseInt(limitArg.split("=")[1] ?? "", 10) : Infinity,
    crawlDelayMs: delayArg
      ? parseInt(delayArg.split("=")[1] ?? "", 10) * 1000
      : PRODUCTION_CRAWL_DELAY_MS,
  };

  runIngestion(config).catch(console.error);
}
