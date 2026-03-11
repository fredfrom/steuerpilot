import { GraphQLError } from "graphql";
import { embedText } from "../services/embedding.js";
import { searchChunks } from "../services/vectorSearch.js";
import { generateAnswer } from "../services/llm.js";
import { BmfChunk } from "../models/BmfChunk.js";
import { EmbeddingError, VectorSearchError, LlmError } from "../errors/index.js";
import type {
  SearchResult,
  IndexStats,
  Source,
} from "../types/search.types.js";
import type { LlmContextChunk } from "../types/llm.types.js";
import type { VectorSearchResult } from "../types/search.types.js";

const MAX_UNIQUE_SOURCES = 5;
const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 500;

interface SearchArgs {
  question: string;
  steuerart?: string;
}

/**
 * Deduplicate chunks by source document, keeping the chunk with the highest score.
 * Primary key: bmf_url. Fallback: title (for chunks where bmf_url is null/empty).
 */
function deduplicateBySource(
  chunks: VectorSearchResult[]
): VectorSearchResult[] {
  const bestByKey = new Map<string, VectorSearchResult>();

  for (const chunk of chunks) {
    // Use bmf_url as primary dedup key; fall back to title for missing URLs
    const url = chunk.metadata.bmf_url;
    const dedupKey = url ? url : `title:${chunk.metadata.title}`;
    const existing = bestByKey.get(dedupKey);
    if (!existing || chunk.score > existing.score) {
      bestByKey.set(dedupKey, chunk);
    }
  }

  return [...bestByKey.values()].slice(0, MAX_UNIQUE_SOURCES);
}

export const resolvers = {
  Query: {
    search: async (
      _parent: unknown,
      { question, steuerart }: SearchArgs
    ): Promise<SearchResult> => {
      // Input validation
      if (
        question.length < MIN_QUESTION_LENGTH ||
        question.length > MAX_QUESTION_LENGTH
      ) {
        throw new GraphQLError(
          "Die Frage muss zwischen 3 und 500 Zeichen lang sein.",
          { extensions: { code: "BAD_USER_INPUT" } }
        );
      }

      try {
        const queryEmbedding = await embedText(question);

        const chunks = await searchChunks(queryEmbedding, { steuerart });
        const uniqueChunks = deduplicateBySource(chunks);

        const llmChunks: LlmContextChunk[] = uniqueChunks.map((chunk) => ({
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

        const sources: Source[] = uniqueChunks.map((chunk) => ({
          title: chunk.metadata.title,
          date: chunk.metadata.date,
          gz: chunk.metadata.gz,
          steuerart: chunk.metadata.steuerart,
          bmfUrl: chunk.metadata.bmf_url,
          relevanceScore: chunk.score,
          tldr: chunk.tldr ?? null,
        }));

        return { answer, sources };
      } catch (error: unknown) {
        if (error instanceof EmbeddingError) {
          console.error(`Embedding failed: ${error.message}`);
          throw new GraphQLError(
            "Die Suche konnte nicht durchgeführt werden. Bitte versuchen Sie es später erneut.",
            { extensions: { code: "INTERNAL_SERVER_ERROR" } }
          );
        }
        if (error instanceof VectorSearchError) {
          console.error(`Vector search failed: ${error.message}`);
          throw new GraphQLError(
            "Die Datenbanksuche ist fehlgeschlagen. Bitte versuchen Sie es später erneut.",
            { extensions: { code: "INTERNAL_SERVER_ERROR" } }
          );
        }
        if (error instanceof LlmError) {
          console.error(`LLM generation failed: ${error.message}`);
          throw new GraphQLError(
            "Die Antwort konnte nicht generiert werden. Bitte versuchen Sie es später erneut.",
            { extensions: { code: "INTERNAL_SERVER_ERROR" } }
          );
        }
        // Unexpected errors — log full details, return generic message
        console.error("Unexpected search error:", error);
        throw new GraphQLError(
          "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.",
          { extensions: { code: "INTERNAL_SERVER_ERROR" } }
        );
      }
    },

    stats: async (): Promise<IndexStats> => {
      const uniqueDocIds = await BmfChunk.distinct("doc_id").exec();
      const totalDocuments = uniqueDocIds.length;

      const byCategory = await BmfChunk.aggregate<{
        steuerart: string;
        count: number;
      }>([
        { $group: { _id: { steuerart: "$metadata.steuerart", doc_id: "$doc_id" } } },
        { $group: { _id: "$_id.steuerart", count: { $sum: 1 } } },
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
