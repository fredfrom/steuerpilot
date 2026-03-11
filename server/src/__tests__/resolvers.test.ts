import express from "express";
import http from "http";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import request from "supertest";
import { typeDefs } from "../schema/typeDefs.js";
import { resolvers } from "../resolvers/index.js";
import type { ApolloContext } from "../types/context.types.js";

// Mock the three services that the resolver calls
jest.mock("../services/embedding.js");
jest.mock("../services/vectorSearch.js");
jest.mock("../services/llm.js");
jest.mock("../models/BmfChunk.js");

import { embedText } from "../services/embedding.js";
import { searchChunks } from "../services/vectorSearch.js";
import { generateAnswer } from "../services/llm.js";
import { BmfChunk } from "../models/BmfChunk.js";

const mockedEmbedText = embedText as jest.MockedFunction<typeof embedText>;
const mockedSearchChunks = searchChunks as jest.MockedFunction<
  typeof searchChunks
>;
const mockedGenerateAnswer = generateAnswer as jest.MockedFunction<
  typeof generateAnswer
>;
const mockedBmfChunk = BmfChunk as jest.Mocked<typeof BmfChunk>;

const MOCK_EMBEDDING = new Array(256).fill(0.1) as number[];

const MOCK_CHUNKS = [
  {
    text: "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.",
    tldr: "Homeoffice-Pauschale: 6 Euro pro Tag absetzbar.",
    metadata: {
      date: "2023-01-01",
      gz: "IV C 6 - S 2145/19/10006 :013",
      steuerart: "Einkommensteuer",
      title: "BMF-Schreiben zur Homeoffice-Pauschale",
      bmf_url: "https://www.bundesfinanzministerium.de/bmf1",
      paragraphen: ["§ 4 Abs. 5"],
      is_superseded: false,
    },
    score: 0.95,
  },
];

const MOCK_ANSWER = "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.";

describe("GraphQL resolvers", () => {
  let app: ReturnType<typeof express>;
  let httpServer: http.Server;
  let server: ApolloServer<ApolloContext>;

  beforeAll(async () => {
    app = express();
    httpServer = http.createServer(app);
    server = new ApolloServer<ApolloContext>({ typeDefs, resolvers });
    await server.start();
    app.use(
      "/graphql",
      express.json(),
      expressMiddleware(server, {
        context: async ({ req }): Promise<ApolloContext> => ({ req }),
      })
    );
  });

  afterAll(async () => {
    await server.stop();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("search query", () => {
    it("returns answer and sources for a valid question", async () => {
      mockedEmbedText.mockResolvedValueOnce(MOCK_EMBEDDING);
      mockedSearchChunks.mockResolvedValueOnce(MOCK_CHUNKS);
      mockedGenerateAnswer.mockResolvedValueOnce(MOCK_ANSWER);

      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!) {
              search(question: $question) {
                answer
                sources {
                  title
                  date
                  gz
                  steuerart
                  bmfUrl
                  relevanceScore
                  tldr
                }
              }
            }
          `,
          variables: { question: "Homeoffice-Pauschale" },
        });

      expect(response.status).toBe(200);
      const searchResult = response.body.data.search;

      // Verify answer is passed through from generateAnswer
      expect(searchResult.answer).toBe(MOCK_ANSWER);

      // Verify sources are mapped correctly from VectorSearchResult to Source
      expect(searchResult.sources).toHaveLength(1);
      const source = searchResult.sources[0];
      expect(source.title).toBe("BMF-Schreiben zur Homeoffice-Pauschale");
      expect(source.date).toBe("2023-01-01");
      expect(source.gz).toBe("IV C 6 - S 2145/19/10006 :013");
      expect(source.steuerart).toBe("Einkommensteuer");
      expect(source.bmfUrl).toBe(
        "https://www.bundesfinanzministerium.de/bmf1"
      );
      expect(source.relevanceScore).toBe(0.95);
      expect(source.tldr).toBe("Homeoffice-Pauschale: 6 Euro pro Tag absetzbar.");

      // Verify wiring: embedText called with the question
      expect(mockedEmbedText).toHaveBeenCalledWith("Homeoffice-Pauschale");
      // Verify wiring: searchChunks called with the embedding
      expect(mockedSearchChunks).toHaveBeenCalledWith(MOCK_EMBEDDING, {
        steuerart: undefined,
      });
      // Verify wiring: generateAnswer called with question and mapped chunks
      expect(mockedGenerateAnswer).toHaveBeenCalledWith(
        "Homeoffice-Pauschale",
        [
          {
            text: "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.",
            metadata: {
              date: "2023-01-01",
              gz: "IV C 6 - S 2145/19/10006 :013",
              steuerart: "Einkommensteuer",
              title: "BMF-Schreiben zur Homeoffice-Pauschale",
              bmf_url: "https://www.bundesfinanzministerium.de/bmf1",
            },
          },
        ]
      );
    });

    it("passes steuerart filter through to searchChunks", async () => {
      mockedEmbedText.mockResolvedValueOnce(MOCK_EMBEDDING);
      mockedSearchChunks.mockResolvedValueOnce(MOCK_CHUNKS);
      mockedGenerateAnswer.mockResolvedValueOnce(MOCK_ANSWER);

      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!, $steuerart: String) {
              search(question: $question, steuerart: $steuerart) {
                answer
                sources { title }
              }
            }
          `,
          variables: {
            question: "Homeoffice",
            steuerart: "Einkommensteuer",
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      // Verify steuerart was passed to searchChunks
      expect(mockedSearchChunks).toHaveBeenCalledWith(MOCK_EMBEDDING, {
        steuerart: "Einkommensteuer",
      });
    });

    it("deduplicates sources by bmfUrl, keeping the highest relevanceScore", async () => {
      const duplicateChunks = [
        {
          text: "Chunk 1 from document A.",
          tldr: null,
          metadata: {
            date: "2023-01-01",
            gz: "IV C 6",
            steuerart: "Einkommensteuer",
            title: "Document A",
            bmf_url: "https://www.bundesfinanzministerium.de/docA",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.85,
        },
        {
          text: "Chunk 2 from document A (higher score).",
          tldr: "Zusammenfassung A.",
          metadata: {
            date: "2023-01-01",
            gz: "IV C 6",
            steuerart: "Einkommensteuer",
            title: "Document A",
            bmf_url: "https://www.bundesfinanzministerium.de/docA",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.92,
        },
        {
          text: "Chunk from document B.",
          tldr: "Zusammenfassung B.",
          metadata: {
            date: "2023-06-15",
            gz: "IV C 7",
            steuerart: "Umsatzsteuer",
            title: "Document B",
            bmf_url: "https://www.bundesfinanzministerium.de/docB",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.88,
        },
      ];

      mockedEmbedText.mockResolvedValueOnce(MOCK_EMBEDDING);
      mockedSearchChunks.mockResolvedValueOnce(duplicateChunks);
      mockedGenerateAnswer.mockResolvedValueOnce(MOCK_ANSWER);

      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!) {
              search(question: $question) {
                answer
                sources {
                  title
                  bmfUrl
                  relevanceScore
                }
              }
            }
          `,
          variables: { question: "test dedup" },
        });

      expect(response.status).toBe(200);
      const searchResult = response.body.data.search;

      // Two chunks from docA should be deduplicated to one
      expect(searchResult.sources).toHaveLength(2);

      // Document A should have the higher score (0.92, not 0.85)
      const docA = searchResult.sources.find(
        (s: { bmfUrl: string }) =>
          s.bmfUrl === "https://www.bundesfinanzministerium.de/docA"
      );
      expect(docA).toBeDefined();
      expect(docA.relevanceScore).toBe(0.92);

      // Document B should be present
      const docB = searchResult.sources.find(
        (s: { bmfUrl: string }) =>
          s.bmfUrl === "https://www.bundesfinanzministerium.de/docB"
      );
      expect(docB).toBeDefined();
      expect(docB.relevanceScore).toBe(0.88);

      // generateAnswer should receive only the deduplicated chunks
      expect(mockedGenerateAnswer).toHaveBeenCalledWith(
        "test dedup",
        expect.arrayContaining([
          expect.objectContaining({
            text: "Chunk 2 from document A (higher score).",
          }),
          expect.objectContaining({
            text: "Chunk from document B.",
          }),
        ])
      );
      // Verify it received exactly 2 chunks, not 3
      const llmChunksArg = mockedGenerateAnswer.mock.calls[0]?.[1];
      expect(llmChunksArg).toHaveLength(2);
    });

    it("deduplicates by title when bmfUrl is empty", async () => {
      const chunksWithEmptyUrl = [
        {
          text: "Chunk 1 from unknown-URL document.",
          tldr: null,
          metadata: {
            date: "2024-01-01",
            gz: "IV C 8",
            steuerart: "Gewerbesteuer",
            title: "Same Title Document",
            bmf_url: "",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.80,
        },
        {
          text: "Chunk 2 from unknown-URL document (higher score).",
          tldr: null,
          metadata: {
            date: "2024-01-01",
            gz: "IV C 8",
            steuerart: "Gewerbesteuer",
            title: "Same Title Document",
            bmf_url: "",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.90,
        },
        {
          text: "Chunk from a document with a URL.",
          tldr: "Zusammenfassung C.",
          metadata: {
            date: "2024-02-01",
            gz: "IV C 9",
            steuerart: "Einkommensteuer",
            title: "Different Document",
            bmf_url: "https://www.bundesfinanzministerium.de/docC",
            paragraphen: [],
            is_superseded: false,
          },
          score: 0.85,
        },
      ];

      mockedEmbedText.mockResolvedValueOnce(MOCK_EMBEDDING);
      mockedSearchChunks.mockResolvedValueOnce(chunksWithEmptyUrl);
      mockedGenerateAnswer.mockResolvedValueOnce(MOCK_ANSWER);

      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!) {
              search(question: $question) {
                answer
                sources {
                  title
                  bmfUrl
                  relevanceScore
                }
              }
            }
          `,
          variables: { question: "test title fallback" },
        });

      expect(response.status).toBe(200);
      const searchResult = response.body.data.search;

      // Two chunks with empty bmfUrl + same title → deduplicated to one
      expect(searchResult.sources).toHaveLength(2);

      // The empty-URL document should keep the higher score (0.90)
      const sameTitle = searchResult.sources.find(
        (s: { title: string }) => s.title === "Same Title Document"
      );
      expect(sameTitle).toBeDefined();
      expect(sameTitle.relevanceScore).toBe(0.90);

      // The document with a real URL should be present
      const withUrl = searchResult.sources.find(
        (s: { title: string }) => s.title === "Different Document"
      );
      expect(withUrl).toBeDefined();
      expect(withUrl.bmfUrl).toBe(
        "https://www.bundesfinanzministerium.de/docC"
      );

      // generateAnswer should receive exactly 2 deduplicated chunks
      const llmChunksArg = mockedGenerateAnswer.mock.calls[0]?.[1];
      expect(llmChunksArg).toHaveLength(2);
    });

    it("returns a GraphQL validation error when question is missing", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query {
              search {
                answer
              }
            }
          `,
        });

      // Apollo Server 5 returns 400 for GraphQL validation errors
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);

      // No services should have been called
      expect(mockedEmbedText).not.toHaveBeenCalled();
      expect(mockedSearchChunks).not.toHaveBeenCalled();
      expect(mockedGenerateAnswer).not.toHaveBeenCalled();
    });

    it("rejects questions shorter than 3 characters", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!) {
              search(question: $question) {
                answer
              }
            }
          `,
          variables: { question: "ab" },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        "zwischen 3 und 500 Zeichen"
      );
      expect(response.body.errors[0].extensions.code).toBe("BAD_USER_INPUT");

      // No services should have been called
      expect(mockedEmbedText).not.toHaveBeenCalled();
    });

    it("rejects questions longer than 500 characters", async () => {
      const longQuestion = "a".repeat(501);
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query Search($question: String!) {
              search(question: $question) {
                answer
              }
            }
          `,
          variables: { question: longQuestion },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain(
        "zwischen 3 und 500 Zeichen"
      );

      expect(mockedEmbedText).not.toHaveBeenCalled();
    });
  });

  describe("stats query", () => {
    it("returns totalDocuments, lastUpdated, and byCategory", async () => {
      // Mock BmfChunk.distinct("doc_id").exec()
      const mockDistinctExec = jest.fn().mockResolvedValue(
        Array.from({ length: 42 }, (_, i) => `doc-${String(i)}`)
      );
      mockedBmfChunk.distinct.mockReturnValue({
        exec: mockDistinctExec,
      } as never);

      // Mock BmfChunk.aggregate() for byCategory
      mockedBmfChunk.aggregate.mockResolvedValueOnce([
        { steuerart: "Einkommensteuer", count: 25 },
        { steuerart: "Umsatzsteuer", count: 17 },
      ]);

      // Mock BmfChunk.findOne().sort().select().lean().exec() for lastUpdated
      const mockLeanExec = jest
        .fn()
        .mockResolvedValue({ metadata: { date: "2024-03-15" } });
      const mockLean = jest
        .fn()
        .mockReturnValue({ exec: mockLeanExec });
      const mockSelect = jest
        .fn()
        .mockReturnValue({ lean: mockLean });
      const mockSort = jest
        .fn()
        .mockReturnValue({ select: mockSelect });
      mockedBmfChunk.findOne.mockReturnValue({
        sort: mockSort,
      } as never);

      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query {
              stats {
                totalDocuments
                lastUpdated
                byCategory {
                  steuerart
                  count
                }
              }
            }
          `,
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const stats = response.body.data.stats;
      expect(stats.totalDocuments).toBe(42);
      expect(stats.lastUpdated).toBe("2024-03-15");
      expect(stats.byCategory).toHaveLength(2);
      expect(stats.byCategory[0]).toEqual({
        steuerart: "Einkommensteuer",
        count: 25,
      });
      expect(stats.byCategory[1]).toEqual({
        steuerart: "Umsatzsteuer",
        count: 17,
      });
    });
  });
});
