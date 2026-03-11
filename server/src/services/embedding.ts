import axios from "axios";
import { EmbeddingError } from "../errors/index.js";

const HUGGINGFACE_API_URL =
  "https://router.huggingface.co/hf-inference/models/mixedbread-ai/deepset-mxbai-embed-de-large-v1/pipeline/feature-extraction";

const EMBEDDING_DIMENSIONS_RAW = 1024;
const EMBEDDING_DIMENSIONS = 512;
const TIMEOUT_MS = 30_000;

/** Truncate to first N dims and re-normalize (Matryoshka truncation). */
function truncateAndNormalize(
  embedding: number[],
  dims: number
): number[] {
  const truncated = embedding.slice(0, dims);
  const norm = Math.sqrt(truncated.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return truncated;
  return truncated.map((x) => x / norm);
}

/**
 * Embed a single text string using the HuggingFace Inference API.
 * Returns a 512-dimensional float array (Matryoshka truncation from 1024).
 */
export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("HUGGINGFACE_API_KEY is not set");
  }

  let response: { data: unknown };
  try {
    response = await axios.post(
      HUGGINGFACE_API_URL,
      { inputs: text },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: TIMEOUT_MS,
      }
    );
  } catch (error: unknown) {
    throw new EmbeddingError("HuggingFace API request failed", error);
  }

  const rawEmbedding = response.data;
  if (!isNumberArray(rawEmbedding)) {
    throw new EmbeddingError(
      "HuggingFace API returned unexpected response format"
    );
  }

  if (rawEmbedding.length !== EMBEDDING_DIMENSIONS_RAW) {
    throw new EmbeddingError(
      `Expected ${String(EMBEDDING_DIMENSIONS_RAW)} raw dimensions, got ${String(rawEmbedding.length)}`
    );
  }

  return truncateAndNormalize(rawEmbedding, EMBEDDING_DIMENSIONS);
}

/**
 * Embed multiple text strings in a single batch request.
 * Returns an array of 512-dimensional float arrays (Matryoshka truncation from 1024).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("HUGGINGFACE_API_KEY is not set");
  }

  let response: { data: unknown };
  try {
    response = await axios.post(
      HUGGINGFACE_API_URL,
      { inputs: texts },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: TIMEOUT_MS,
      }
    );
  } catch (error: unknown) {
    throw new EmbeddingError("HuggingFace batch API request failed", error);
  }

  const embeddings = response.data;
  if (!isNestedNumberArray(embeddings)) {
    throw new EmbeddingError(
      "HuggingFace API returned unexpected batch response format"
    );
  }

  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS_RAW) {
      throw new EmbeddingError(
        `Expected ${String(EMBEDDING_DIMENSIONS_RAW)} raw dimensions, got ${String(embedding.length)}`
      );
    }
  }

  return embeddings.map((e) => truncateAndNormalize(e, EMBEDDING_DIMENSIONS));
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.length > 0 && typeof value[0] === "number"
  );
}

function isNestedNumberArray(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    typeof value[0][0] === "number"
  );
}
