import { Mistral } from "@mistralai/mistralai";
import Groq from "groq-sdk";
import type { LlmContextChunk } from "../types/llm.types.js";

const MISTRAL_MODEL = "mistral-small-latest";
const GROQ_MODEL = "llama-3.1-8b-instant";
const TIMEOUT_MS = 30_000;

function buildSystemPrompt(): string {
  return [
    "Du bist ein Experte für deutsches Steuerrecht.",
    "Beantworte die Frage ausschließlich auf Basis der bereitgestellten BMF-Schreiben.",
    "Zitiere jede verwendete Quelle mit Titel und Datum.",
    "Wenn die bereitgestellten Quellen die Frage nicht beantworten können, sage das ehrlich.",
    "Antworte immer auf Deutsch.",
  ].join(" ");
}

function buildContextBlock(chunks: LlmContextChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const { title, date, gz } = chunk.metadata;
      return `--- Quelle ${String(index + 1)}: ${title} (${date}, ${gz}) ---\n${chunk.text}`;
    })
    .join("\n\n");
}

function buildUserPrompt(question: string, chunks: LlmContextChunk[]): string {
  const context = buildContextBlock(chunks);
  return `Kontext aus BMF-Schreiben:\n\n${context}\n\nFrage: ${question}`;
}

/**
 * Generate a German-language answer using Mistral (primary) with Groq fallback.
 * The answer cites source documents by title and date.
 */
export async function generateAnswer(
  question: string,
  chunks: LlmContextChunk[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(question, chunks);

  // Try Mistral first
  try {
    return await callMistral(systemPrompt, userPrompt);
  } catch (error: unknown) {
    const mistralMsg =
      error instanceof Error ? error.message : "Unknown Mistral error";
    console.error(`Mistral API failed: ${mistralMsg}, falling back to Groq`);
  }

  // Fallback to Groq
  return callGroq(systemPrompt, userPrompt);
}

async function callMistral(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not set");
  }

  const client = new Mistral({ apiKey });

  const response = await client.chat.complete(
    {
      model: MISTRAL_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    { timeoutMs: TIMEOUT_MS }
  );

  const firstChoice = response.choices?.[0];
  if (!firstChoice) {
    throw new Error("Mistral returned no choices");
  }

  const content = firstChoice.message?.content;
  if (typeof content !== "string") {
    throw new Error("Mistral returned non-string content");
  }

  return content;
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const client = new Groq({ apiKey });

  const response = await client.chat.completions.create(
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    { timeout: TIMEOUT_MS }
  );

  const firstChoice = response.choices[0];
  if (!firstChoice) {
    throw new Error("Groq returned no choices");
  }

  const content = firstChoice.message.content;
  if (!content) {
    throw new Error("Groq returned empty content");
  }

  return content;
}

// Exported for testing
export { buildSystemPrompt, buildContextBlock, buildUserPrompt };
