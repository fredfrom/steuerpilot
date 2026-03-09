import { BmfChunk } from "../models/BmfChunk.js";

/**
 * Perform a MongoDB Atlas vector search on the bmf_chunks collection.
 * Uses the "vector_index" with cosine similarity and 1024 dimensions.
 *
 * @param {number[]} queryEmbedding - 1024-dim query embedding vector
 * @param {object} [options] - Search options
 * @param {string} [options.steuerart] - Optional Steuerart filter
 * @param {number} [options.limit=5] - Number of results to return
 * @param {number} [options.numCandidates=100] - Number of candidates to consider
 * @returns {Promise<Array<{text: string, metadata: object, score: number}>>} Search results
 */
export async function searchChunks(queryEmbedding, options = {}) {
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
