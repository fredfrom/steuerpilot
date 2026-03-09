import {
  buildSystemPrompt,
  buildContextBlock,
  buildUserPrompt,
  generateAnswer,
} from "../services/llm.js";
import type { LlmContextChunk } from "../types/llm.types.js";

// Mock both LLM SDKs before imports resolve
jest.mock("@mistralai/mistralai");
jest.mock("groq-sdk");

import { Mistral } from "@mistralai/mistralai";
import Groq from "groq-sdk";

const MockedMistral = Mistral as jest.MockedClass<typeof Mistral>;
const MockedGroq = Groq as jest.MockedClass<typeof Groq>;

const sampleChunks: LlmContextChunk[] = [
  {
    text: "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.",
    metadata: {
      date: "2023-01-01",
      gz: "IV C 6 - S 2145/19/10006 :013",
      steuerart: "Einkommensteuer",
      title: "BMF-Schreiben zur Homeoffice-Pauschale",
      bmf_url: "https://example.com/bmf1",
    },
  },
  {
    text: "Maximal 1.260 Euro pro Jahr sind absetzbar.",
    metadata: {
      date: "2023-06-15",
      gz: "IV C 6 - S 2145/19/10006 :014",
      steuerart: "Einkommensteuer",
      title: "Ergänzung zur Homeoffice-Pauschale",
      bmf_url: "https://example.com/bmf2",
    },
  },
];

const SAMPLE_QUESTION = "Wie hoch ist die Homeoffice-Pauschale?";
const MISTRAL_ANSWER = "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.";
const GROQ_ANSWER = "Laut BMF-Schreiben beträgt die Pauschale 6 Euro.";

// Helper to set up Mistral mock with a specific chat.complete response
function setupMistralMock(
  behavior: "success" | "error",
  answer: string = MISTRAL_ANSWER
): void {
  const mockComplete =
    behavior === "success"
      ? jest
          .fn()
          .mockResolvedValue({
            choices: [{ message: { content: answer } }],
          })
      : jest.fn().mockRejectedValue(new Error("Mistral API timeout"));

  MockedMistral.mockImplementation(
    () =>
      ({
        chat: { complete: mockComplete },
      }) as unknown as InstanceType<typeof Mistral>
  );
}

// Helper to set up Groq mock with a specific chat.completions.create response
function setupGroqMock(
  behavior: "success" | "error",
  answer: string = GROQ_ANSWER
): void {
  const mockCreate =
    behavior === "success"
      ? jest
          .fn()
          .mockResolvedValue({
            choices: [{ message: { content: answer } }],
          })
      : jest.fn().mockRejectedValue(new Error("Groq API timeout"));

  MockedGroq.mockImplementation(
    () =>
      ({
        chat: { completions: { create: mockCreate } },
      }) as unknown as InstanceType<typeof Groq>
  );
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-mistral-key";
  process.env.GROQ_API_KEY = "test-groq-key";
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("buildSystemPrompt", () => {
  it("returns a German system prompt mentioning Steuerrecht", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Steuerrecht");
    expect(prompt).toContain("Deutsch");
  });
});

describe("buildContextBlock", () => {
  it("includes all chunk titles, dates, and text", () => {
    const block = buildContextBlock(sampleChunks);
    expect(block).toContain("BMF-Schreiben zur Homeoffice-Pauschale");
    expect(block).toContain("2023-01-01");
    expect(block).toContain("Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.");
    expect(block).toContain("Ergänzung zur Homeoffice-Pauschale");
    expect(block).toContain("2023-06-15");
    expect(block).toContain("Maximal 1.260 Euro pro Jahr sind absetzbar.");
  });

  it("labels sources with sequential numbers", () => {
    const block = buildContextBlock(sampleChunks);
    expect(block).toContain("Quelle 1:");
    expect(block).toContain("Quelle 2:");
  });
});

describe("buildUserPrompt", () => {
  it("includes both the context and the question", () => {
    const prompt = buildUserPrompt(SAMPLE_QUESTION, sampleChunks);
    expect(prompt).toContain("Kontext aus BMF-Schreiben:");
    expect(prompt).toContain(SAMPLE_QUESTION);
    expect(prompt).toContain("Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.");
  });
});

describe("generateAnswer", () => {
  it("returns Mistral answer when Mistral succeeds", async () => {
    setupMistralMock("success");

    const answer = await generateAnswer(SAMPLE_QUESTION, sampleChunks);

    expect(answer).toBe(MISTRAL_ANSWER);
    // Groq should not have been instantiated
    expect(MockedGroq).not.toHaveBeenCalled();
  });

  it("falls back to Groq when Mistral fails", async () => {
    setupMistralMock("error");
    setupGroqMock("success");

    const answer = await generateAnswer(SAMPLE_QUESTION, sampleChunks);

    expect(answer).toBe(GROQ_ANSWER);
    // Both clients should have been instantiated
    expect(MockedMistral).toHaveBeenCalled();
    expect(MockedGroq).toHaveBeenCalled();
  });

  it("throws when both Mistral and Groq fail", async () => {
    setupMistralMock("error");
    setupGroqMock("error");

    await expect(
      generateAnswer(SAMPLE_QUESTION, sampleChunks)
    ).rejects.toThrow("Groq API timeout");
  });

  it("throws when MISTRAL_API_KEY is missing and GROQ_API_KEY is also missing", async () => {
    delete process.env.MISTRAL_API_KEY;
    delete process.env.GROQ_API_KEY;

    // Mistral will throw "MISTRAL_API_KEY is not set", then Groq will throw "GROQ_API_KEY is not set"
    await expect(
      generateAnswer(SAMPLE_QUESTION, sampleChunks)
    ).rejects.toThrow("GROQ_API_KEY is not set");
  });
});
