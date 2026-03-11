import { searchChunks } from "../services/vectorSearch.js";
import { BmfChunk } from "../models/BmfChunk.js";
import { VectorSearchError } from "../errors/index.js";

jest.mock("../models/BmfChunk.js");

const mockedBmfChunk = BmfChunk as jest.Mocked<typeof BmfChunk>;

const QUERY_EMBEDDING = new Array(256).fill(0.5) as number[];

const MOCK_RESULTS = [
  {
    text: "Test chunk text",
    metadata: {
      date: "2023-01-01",
      gz: "IV C 6",
      steuerart: "Einkommensteuer",
      title: "Test BMF",
      bmf_url: "https://example.com",
      paragraphen: [],
      is_superseded: false,
    },
    score: 0.95,
  },
];

interface VectorSearchStage {
  $vectorSearch: {
    index: string;
    path: string;
    queryVector: number[];
    numCandidates: number;
    limit: number;
    filter: Record<string, unknown>;
  };
}

function extractVectorSearchStage(): VectorSearchStage {
  const pipelineArg: unknown = mockedBmfChunk.aggregate.mock.calls[0]?.[0];
  const pipeline = pipelineArg as VectorSearchStage[];
  const stage = pipeline[0];
  if (!stage) {
    throw new Error("No $vectorSearch stage found in pipeline");
  }
  return stage;
}

afterEach(() => {
  jest.resetAllMocks();
});

describe("searchChunks", () => {
  it("calls BmfChunk.aggregate with $vectorSearch pipeline", async () => {
    mockedBmfChunk.aggregate.mockResolvedValueOnce(MOCK_RESULTS);

    const results = await searchChunks(QUERY_EMBEDDING);

    expect(mockedBmfChunk.aggregate).toHaveBeenCalledTimes(1);
    const stage = extractVectorSearchStage();
    expect(stage).toHaveProperty("$vectorSearch");
    expect(results).toEqual(MOCK_RESULTS);
  });

  it("filters by steuerart when provided", async () => {
    mockedBmfChunk.aggregate.mockResolvedValueOnce([]);

    await searchChunks(QUERY_EMBEDDING, { steuerart: "Einkommensteuer" });

    const stage = extractVectorSearchStage();
    expect(stage.$vectorSearch.filter["metadata.steuerart"]).toEqual({
      $eq: "Einkommensteuer",
    });
  });

  it("always filters out superseded documents", async () => {
    mockedBmfChunk.aggregate.mockResolvedValueOnce([]);

    await searchChunks(QUERY_EMBEDDING);

    const stage = extractVectorSearchStage();
    expect(stage.$vectorSearch.filter["metadata.is_superseded"]).toEqual({
      $eq: false,
    });
  });

  it("uses default limit of 5", async () => {
    mockedBmfChunk.aggregate.mockResolvedValueOnce([]);

    await searchChunks(QUERY_EMBEDDING);

    const stage = extractVectorSearchStage();
    expect(stage.$vectorSearch.limit).toBe(5);
  });

  it("throws VectorSearchError on aggregation failure", async () => {
    mockedBmfChunk.aggregate.mockRejectedValueOnce(new Error("DB error"));

    await expect(searchChunks(QUERY_EMBEDDING)).rejects.toThrow(
      VectorSearchError
    );
  });

  it("returns all results when all scores are above threshold", async () => {
    const aboveThreshold = [
      { ...MOCK_RESULTS[0]!, score: 0.82 },
      { ...MOCK_RESULTS[0]!, score: 0.79 },
    ];
    mockedBmfChunk.aggregate.mockResolvedValueOnce(aboveThreshold);

    const results = await searchChunks(QUERY_EMBEDDING);

    expect(results).toHaveLength(2);
  });

  it("returns empty array when all scores are below threshold", async () => {
    const belowThreshold = [
      { ...MOCK_RESULTS[0]!, score: 0.65 },
      { ...MOCK_RESULTS[0]!, score: 0.71 },
    ];
    mockedBmfChunk.aggregate.mockResolvedValueOnce(belowThreshold);

    const results = await searchChunks(QUERY_EMBEDDING);

    expect(results).toHaveLength(0);
  });

  it("filters out results below similarity threshold", async () => {
    const mixedScores = [
      { ...MOCK_RESULTS[0]!, score: 0.82 },
      { ...MOCK_RESULTS[0]!, score: 0.71 },
      { ...MOCK_RESULTS[0]!, score: 0.90 },
    ];
    mockedBmfChunk.aggregate.mockResolvedValueOnce(mixedScores);

    const results = await searchChunks(QUERY_EMBEDDING);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.score >= 0.75)).toBe(true);
  });
});
