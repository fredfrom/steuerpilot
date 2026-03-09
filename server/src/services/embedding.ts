import axios from "axios";
import { EmbeddingError } from "../errors/index.js";

const HUGGINGFACE_API_URL =
  "https://router.huggingface.co/hf-inference/models/mixedbread-ai/deepset-mxbai-embed-de-large-v1/pipeline/feature-extraction";

const EMBEDDING_DIMENSIONS = 1024;
const TIMEOUT_MS = 30_000;

/**
 * Embed a single text string using the HuggingFace Inference API.
 * Returns a 1024-dimensional float array.
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

  const embedding = response.data;
  if (!isNumberArray(embedding)) {
    throw new EmbeddingError(
      "HuggingFace API returned unexpected response format"
    );
  }

  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      `Expected ${String(EMBEDDING_DIMENSIONS)} dimensions, got ${String(embedding.length)}`
    );
  }

  return embedding;
}

/**
 * Embed multiple text strings in a single batch request.
 * Returns an array of 1024-dimensional float arrays.
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
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `Expected ${String(EMBEDDING_DIMENSIONS)} dimensions, got ${String(embedding.length)}`
      );
    }
  }

  return embeddings;
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
