import { BmfChunk } from "../models/BmfChunk.js";
import { VectorSearchError } from "../errors/index.js";
import type {
  VectorSearchOptions,
  VectorSearchResult,
} from "../types/search.types.js";

const SIMILARITY_THRESHOLD = 0.75;

/**
 * Perform a MongoDB Atlas vector search on the bmf_chunks collection.
 * Uses the "vector_index" with cosine similarity and 1024 dimensions.
 * Filters out superseded documents automatically.
 */
export async function searchChunks(
  queryEmbedding: number[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const { steuerart, limit = 5, numCandidates = 100 } = options;

  // Build pre-filter for vector search
  const filter: Record<string, unknown> = {
    "metadata.is_superseded": { $eq: false },
  };
  if (steuerart) {
    filter["metadata.steuerart"] = { $eq: steuerart };
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates,
        limit,
        filter,
      },
    },
    {
      $project: {
        _id: 0,
        text: 1,
        tldr: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  try {
    const results = await BmfChunk.aggregate<VectorSearchResult>(pipeline);
    return results.filter((r) => r.score >= SIMILARITY_THRESHOLD);
  } catch (error: unknown) {
    throw new VectorSearchError("Vector search aggregation failed", error);
  }
}
