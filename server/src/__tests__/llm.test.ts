import {
  buildSystemPrompt,
  buildContextBlock,
  buildUserPrompt,
} from "../services/llm.js";
import type { LlmContextChunk } from "../types/llm.types.js";

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
    const prompt = buildUserPrompt(
      "Wie hoch ist die Homeoffice-Pauschale?",
      sampleChunks
    );
    expect(prompt).toContain("Kontext aus BMF-Schreiben:");
    expect(prompt).toContain("Wie hoch ist die Homeoffice-Pauschale?");
    expect(prompt).toContain("Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.");
  });
});
