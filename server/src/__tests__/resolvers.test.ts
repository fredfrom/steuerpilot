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

const MOCK_EMBEDDING = new Array(1024).fill(0.1) as number[];

const MOCK_CHUNKS = [
  {
    text: "Die Homeoffice-Pauschale beträgt 6 Euro pro Tag.",
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
  });

  describe("stats query", () => {
    it("returns totalDocuments, lastUpdated, and byCategory", async () => {
      // Mock BmfChunk.countDocuments().exec()
      const mockExec = jest.fn().mockResolvedValue(42);
      mockedBmfChunk.countDocuments.mockReturnValue({
        exec: mockExec,
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
