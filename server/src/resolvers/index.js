// TODO: Import services and implement actual resolver logic
// import { embedText } from "../services/embedding.js";
// import { searchChunks } from "../services/vectorSearch.js";
// import { generateAnswer } from "../services/llm.js";

export const resolvers = {
  Query: {
    search: async (_parent, { question, steuerart }) => {
      // TODO: Embed question, run vector search, generate LLM answer
      return {
        answer: `Placeholder answer for: "${question}"`,
        sources: [],
      };
    },

    stats: async () => {
      // TODO: Query MongoDB for index statistics
      return {
        totalDocuments: 0,
        lastUpdated: new Date().toISOString(),
        byCategory: [],
      };
    },
  },
};
