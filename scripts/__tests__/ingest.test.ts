/**
 * Tests for the ingestion pipeline functions.
 * Tests logic by mocking all external I/O (HTTP, MongoDB, LLM).
 *
 * Uses @jest/globals for ESM compatibility (scripts/ is "type": "module").
 * Run with: NODE_OPTIONS='--experimental-vm-modules' npx jest
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// ── Mock definitions (must come before dynamic imports) ─────────────────

const mockBulkWrite = jest.fn().mockResolvedValue({
  upsertedCount: 2,
  matchedCount: 0,
  modifiedCount: 0,
} as never);

jest.unstable_mockModule("axios", () => ({
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.unstable_mockModule("mongoose", () => ({
  default: {
    Schema: jest.fn(() => ({ index: jest.fn() })),
    model: jest.fn(() => ({ bulkWrite: mockBulkWrite })),
    connect: jest.fn().mockResolvedValue(undefined as never),
    disconnect: jest.fn().mockResolvedValue(undefined as never),
  },
}));

jest.unstable_mockModule("@mistralai/mistralai", () => ({
  Mistral: jest.fn().mockImplementation(() => ({
    chat: {
      complete: jest.fn().mockResolvedValue({
        choices: [{ message: { content: "TLDR Zusammenfassung." } }],
      } as never),
    },
  })),
}));

jest.unstable_mockModule("dotenv", () => ({
  default: { config: jest.fn() },
}));

jest.unstable_mockModule("@langchain/textsplitters", () => ({
  RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => ({
    splitText: jest
      .fn()
      .mockResolvedValue(["chunk1 text content", "chunk2 text content"] as never),
  })),
}));

jest.unstable_mockModule("pdf-parse", () => ({
  PDFParse: jest.fn(),
}));

// ── Dynamic imports (resolved after mocks are set up) ───────────────────

const { default: axios } = await import("axios");
const { fetchRssFeed, extractPdfUrl, extractMetadata, embedChunks, upsertToMongodb } =
  await import("../ingest.js");

const mockedAxios = axios as jest.Mocked<typeof axios>;

// RSS feed with 2 BMF-Schreiben entries
const SAMPLE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Test BMF-Schreiben 1</title>
      <link>https://www.bundesfinanzministerium.de/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2024-01-15-test-doc1.html</link>
      <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Test BMF-Schreiben 2</title>
      <link>https://www.bundesfinanzministerium.de/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/2024-02-20-test-doc2.html</link>
      <pubDate>Tue, 20 Feb 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS_XML = `<?xml version="1.0"?><rss><channel></channel></rss>`;

const SAMPLE_HTML_WITH_PDF = `<html><body>
  <a href="/Content/DE/Downloads/BMF_Schreiben/test.pdf?__blob=publicationFile&amp;v=1">PDF</a>
</body></html>`;

const SAMPLE_HTML_NO_PDF = `<html><body><p>No PDF link here</p></body></html>`;

// HF API returns 1024 raw; embedChunks truncates to 512 (Matryoshka)
const MOCK_RAW_EMBEDDING = new Array(1024).fill(0.1) as number[];
const MOCK_EMBEDDING = new Array(256).fill(0.1) as number[];

beforeEach(() => {
  jest.clearAllMocks();
  process.env.HUGGINGFACE_API_KEY = "test-hf-key";
  process.env.MISTRAL_API_KEY = "test-mistral-key";
  process.env.MONGODB_URI = "mongodb://test";
});

describe("Ingestion pipeline", () => {
  describe("fetchRssFeed", () => {
    it("parses RSS entries with correct titles, dates, and Steuerart", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_RSS_XML } as never);

      const entries = await fetchRssFeed();

      expect(entries).toHaveLength(2);
      expect(entries[0]?.title).toBe("Test BMF-Schreiben 1");
      expect(entries[0]?.date).toBe("2024-01-15");
      expect(entries[0]?.steuerart).toBe("Einkommensteuer");
      expect(entries[1]?.title).toBe("Test BMF-Schreiben 2");
      expect(entries[1]?.date).toBe("2024-02-20");
      expect(entries[1]?.steuerart).toBe("Umsatzsteuer");
    });

    it("returns empty array when RSS feed has no items", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: EMPTY_RSS_XML } as never);

      const entries = await fetchRssFeed();

      expect(entries).toHaveLength(0);
    });
  });

  describe("extractPdfUrl", () => {
    it("extracts and resolves PDF URL from HTML detail page", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: SAMPLE_HTML_WITH_PDF,
      } as never);

      const pdfUrl = await extractPdfUrl("https://example.com/detail.html");

      expect(pdfUrl).toBe(
        "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/test.pdf?__blob=publicationFile&v=1"
      );
    });

    it("returns null when HTML page has no PDF link", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: SAMPLE_HTML_NO_PDF } as never);

      const pdfUrl = await extractPdfUrl("https://example.com/no-pdf.html");

      expect(pdfUrl).toBeNull();
    });

    it("propagates HTTP error when detail page returns 404", async () => {
      mockedAxios.get.mockRejectedValueOnce(
        new Error("Request failed with status code 404")
      );

      await expect(
        extractPdfUrl("https://example.com/missing.html")
      ).rejects.toThrow("404");
    });
  });

  describe("extractMetadata", () => {
    it("extracts date, GZ, steuerart, and paragraph references from text and URL", () => {
      const text =
        "GZ: IV C 6 - S 2145/19/10006 Gemäß § 22 EStG wird folgendes bestimmt...";
      const url =
        "https://www.bundesfinanzministerium.de/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2024-03-01-test.pdf";

      const metadata = extractMetadata(text, url, "Test Schreiben");

      expect(metadata.date).toBe("2024-03-01");
      expect(metadata.gz).toBe("IV C 6 - S 2145/19/10006");
      expect(metadata.steuerart).toBe("Einkommensteuer");
      expect(metadata.title).toBe("Test Schreiben");
      expect(metadata.bmf_url).toBe(url);
      expect(metadata.paragraphen).toContain("§ 22 EStG");
    });
  });

  describe("embedChunks", () => {
    it("returns one embedding per chunk truncated to 256 dims", async () => {
      mockedAxios.post
        .mockResolvedValueOnce({ data: MOCK_RAW_EMBEDDING } as never)
        .mockResolvedValueOnce({ data: MOCK_RAW_EMBEDDING } as never);

      const embeddings = await embedChunks(["chunk1", "chunk2"]);

      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(256);
      expect(embeddings[1]).toHaveLength(256);
    });

    it("throws on embedding dimension mismatch", async () => {
      const wrongDimEmbedding = new Array(768).fill(0.1);
      mockedAxios.post.mockResolvedValueOnce({ data: wrongDimEmbedding } as never);

      await expect(embedChunks(["chunk"])).rejects.toThrow(
        "dimension mismatch"
      );
    });

    it("throws when HUGGINGFACE_API_KEY is missing", async () => {
      delete process.env.HUGGINGFACE_API_KEY;

      await expect(embedChunks(["chunk"])).rejects.toThrow(
        "HUGGINGFACE_API_KEY not set"
      );
    });
  });

  describe("upsertToMongodb", () => {
    const sampleMetadata = {
      date: "2024-01-01",
      gz: "IV C 6",
      steuerart: "Einkommensteuer",
      title: "Test Schreiben",
      bmf_url:
        "https://www.bundesfinanzministerium.de/Downloads/BMF_Schreiben/2024-01-01-test-doc.html",
      paragraphen: [] as string[],
    };

    it("calls bulkWrite with correct doc_id and chunk_index fields", async () => {
      mockBulkWrite.mockResolvedValueOnce({
        upsertedCount: 2,
        matchedCount: 0,
      } as never);

      const result = await upsertToMongodb(
        ["text1", "text2"],
        [[0.1], [0.2]],
        sampleMetadata
      );

      expect(result.inserted).toBe(2);
      expect(result.skipped).toBe(0);

      const operations = mockBulkWrite.mock.calls[0]?.[0] as Array<{
        updateOne: {
          filter: { doc_id: string; chunk_index: number };
          update: {
            $setOnInsert: {
              doc_id: string;
              chunk_index: number;
              text: string;
              tldr: string | null;
            };
          };
        };
      }>;
      expect(operations).toHaveLength(2);
      expect(operations[0]?.updateOne.filter.doc_id).toBe(
        "2024-01-01-test-doc"
      );
      expect(operations[0]?.updateOne.filter.chunk_index).toBe(0);
      expect(operations[1]?.updateOne.filter.chunk_index).toBe(1);
    });

    it("reports skipped count when documents already exist (idempotency)", async () => {
      mockBulkWrite.mockResolvedValueOnce({
        upsertedCount: 0,
        matchedCount: 2,
      } as never);

      const result = await upsertToMongodb(
        ["text1", "text2"],
        [[0.1], [0.2]],
        sampleMetadata
      );

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(2);
    });

    it("stores null tldr when TLDR generation fails", async () => {
      mockBulkWrite.mockResolvedValueOnce({
        upsertedCount: 2,
        matchedCount: 0,
      } as never);

      await upsertToMongodb(
        ["text1", "text2"],
        [[0.1], [0.2]],
        sampleMetadata,
        [null, null]
      );

      const operations = mockBulkWrite.mock.calls[0]?.[0] as Array<{
        updateOne: {
          update: { $setOnInsert: { tldr: string | null } };
        };
      }>;
      expect(operations[0]?.updateOne.update.$setOnInsert.tldr).toBeNull();
      expect(operations[1]?.updateOne.update.$setOnInsert.tldr).toBeNull();
    });
  });
});
