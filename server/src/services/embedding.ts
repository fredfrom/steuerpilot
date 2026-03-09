import axios from "axios";

const HUGGINGFACE_API_URL =
  "https://router.huggingface.co/hf-inference/models/mixedbread-ai/deepset-mxbai-embed-de-large-v1/pipeline/feature-extraction";

const EMBEDDING_DIMENSIONS = 1024;

/**
 * Embed a single text string using the HuggingFace Inference API.
 * Returns a 1024-dimensional float array.
 */
export async function embedText(text: string): Promise<number[]> {
  // TODO: Call HuggingFace Inference API
  // POST to HUGGINGFACE_API_URL with { inputs: text }
  // Headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` }
  return new Array(EMBEDDING_DIMENSIONS).fill(0) as number[];
}

/**
 * Embed multiple text strings in a single batch request.
 * Returns an array of 1024-dimensional float arrays.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  // TODO: Call HuggingFace Inference API with batch input
  return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0) as number[]);
}
