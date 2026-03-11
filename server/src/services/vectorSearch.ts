import { BmfChunk } from "../models/BmfChunk.js";
import { VectorSearchError } from "../errors/index.js";
import type {
  VectorSearchOptions,
  VectorSearchResult,
} from "../types/search.types.js";

// TODO: Calibrate threshold after bulk ingestion of all 509 BMF-Schreiben.
// Current value (0.75) was set against a 14-document index where score
// distribution is artificially compressed — all chunks score high regardless
// of relevance because the corpus is too small. With the full corpus, out-of-scope
// queries will score lower and this threshold will work as intended.
// To calibrate: check Render logs for score values on 5-10 known good queries
// and 5-10 out-of-scope queries. Set threshold just above the out-of-scope ceiling.
// Typical target range: 0.72–0.82 depending on corpus and embedding model.
const SIMILARITY_THRESHOLD = 0.75;

/**
 * Perform a MongoDB Atlas vector search on the bmf_chunks collection.
 * Uses the "vector_index" with cosine similarity and 256 dimensions (Matryoshka).
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
