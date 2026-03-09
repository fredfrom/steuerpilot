import type { SearchResult, IndexStats } from "../types/search.types.js";

// TODO: Import services and implement actual resolver logic
// import { embedText } from "../services/embedding.js";
// import { searchChunks } from "../services/vectorSearch.js";
// import { generateAnswer } from "../services/llm.js";

interface SearchArgs {
  question: string;
  steuerart?: string;
}

export const resolvers = {
  Query: {
    search: async (
      _parent: unknown,
      { question }: SearchArgs
    ): Promise<SearchResult> => {
      // TODO: Embed question, run vector search, generate LLM answer
      return {
        answer: `Placeholder answer for: "${question}"`,
        sources: [],
      };
    },

    stats: async (): Promise<IndexStats> => {
      // TODO: Query MongoDB for index statistics
      return {
        totalDocuments: 0,
        lastUpdated: new Date().toISOString(),
        byCategory: [],
      };
    },
  },
};
