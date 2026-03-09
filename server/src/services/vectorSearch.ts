import { BmfChunk } from "../models/BmfChunk.js";
import type {
  VectorSearchOptions,
  VectorSearchResult,
} from "../types/search.types.js";

/**
 * Perform a MongoDB Atlas vector search on the bmf_chunks collection.
 * Uses the "vector_index" with cosine similarity and 1024 dimensions.
 */
export async function searchChunks(
  queryEmbedding: number[],
  options: VectorSearchOptions = {}
): Promise<VectorSearchResult[]> {
  const { steuerart, limit = 5, numCandidates = 100 } = options;

  // TODO: Build and execute $vectorSearch aggregation pipeline
  // const filter = steuerart ? { "metadata.steuerart": steuerart } : undefined;
  // const pipeline = [
  //   {
  //     $vectorSearch: {
  //       index: "vector_index",
  //       path: "embedding",
  //       queryVector: queryEmbedding,
  //       numCandidates,
  //       limit,
  //       ...(filter && { filter }),
  //     },
  //   },
  //   { $project: { text: 1, metadata: 1, score: { $meta: "vectorSearchScore" } } },
  // ];
  // return BmfChunk.aggregate(pipeline);

  return [];
}
