import { embedText } from "../services/embedding.js";
import { searchChunks } from "../services/vectorSearch.js";
import { generateAnswer } from "../services/llm.js";
import { BmfChunk } from "../models/BmfChunk.js";
import type {
  SearchResult,
  IndexStats,
  Source,
} from "../types/search.types.js";
import type { LlmContextChunk } from "../types/llm.types.js";

interface SearchArgs {
  question: string;
  steuerart?: string;
}

export const resolvers = {
  Query: {
    search: async (
      _parent: unknown,
      { question, steuerart }: SearchArgs
    ): Promise<SearchResult> => {
      const queryEmbedding = await embedText(question);

      const chunks = await searchChunks(queryEmbedding, { steuerart });

      const llmChunks: LlmContextChunk[] = chunks.map((chunk) => ({
        text: chunk.text,
        metadata: {
          date: chunk.metadata.date,
          gz: chunk.metadata.gz,
          steuerart: chunk.metadata.steuerart,
          title: chunk.metadata.title,
          bmf_url: chunk.metadata.bmf_url,
        },
      }));

      const answer = await generateAnswer(question, llmChunks);

      const sources: Source[] = chunks.map((chunk) => ({
        title: chunk.metadata.title,
        date: chunk.metadata.date,
        gz: chunk.metadata.gz,
        steuerart: chunk.metadata.steuerart,
        bmfUrl: chunk.metadata.bmf_url,
        relevanceScore: chunk.score,
      }));

      return { answer, sources };
    },

    stats: async (): Promise<IndexStats> => {
      const totalDocuments = await BmfChunk.countDocuments().exec();

      const byCategory = await BmfChunk.aggregate<{
        steuerart: string;
        count: number;
      }>([
        { $group: { _id: "$metadata.steuerart", count: { $sum: 1 } } },
        { $project: { _id: 0, steuerart: "$_id", count: 1 } },
        { $sort: { count: -1 } },
      ]);

      // Find the most recently dated document
      const latestDoc = await BmfChunk.findOne()
        .sort({ "metadata.date": -1 })
        .select("metadata.date")
        .lean()
        .exec();

      const lastUpdated = latestDoc?.metadata?.date ?? new Date().toISOString();

      return { totalDocuments, lastUpdated, byCategory };
    },
  },
};
