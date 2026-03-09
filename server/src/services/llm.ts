import { Mistral } from "@mistralai/mistralai";
import type { LlmContextChunk } from "../types/llm.types.js";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY ?? "" });

/**
 * Generate a German-language answer based on the user's question and
 * retrieved context chunks from BMF-Schreiben.
 */
export async function generateAnswer(
  question: string,
  chunks: LlmContextChunk[]
): Promise<string> {
  // TODO: Build prompt with context chunks and call Mistral API
  // Use client.chat.complete({ model: "mistral-small-latest", messages: [...] })
  return `Placeholder answer for: "${question}"`;
}
