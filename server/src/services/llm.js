import { Mistral } from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || "" });

/**
 * Generate a German-language answer based on the user's question and
 * retrieved context chunks from BMF-Schreiben.
 *
 * @param {string} question - The user's question in German
 * @param {Array<{text: string, metadata: object}>} chunks - Retrieved context chunks
 * @returns {Promise<string>} LLM-generated answer text
 */
export async function generateAnswer(question, chunks) {
  // TODO: Build prompt with context chunks and call Mistral API
  // Use client.chat.complete({ model: "mistral-small-latest", messages: [...] })
  return `Placeholder answer for: "${question}"`;
}
