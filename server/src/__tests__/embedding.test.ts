import axios from "axios";
import { embedText, embedBatch } from "../services/embedding.js";
import { EmbeddingError } from "../errors/index.js";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const VALID_EMBEDDING = new Array(1024).fill(0.1) as number[];

beforeEach(() => {
  process.env.HUGGINGFACE_API_KEY = "test-key";
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("embedText", () => {
  it("returns a 1024-dimensional embedding for valid input", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: VALID_EMBEDDING });

    const result = await embedText("test input");

    expect(result).toHaveLength(1024);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("throws EmbeddingError when API key is missing", async () => {
    delete process.env.HUGGINGFACE_API_KEY;

    await expect(embedText("test")).rejects.toThrow(EmbeddingError);
    await expect(embedText("test")).rejects.toThrow(
      "HUGGINGFACE_API_KEY is not set"
    );
  });

  it("throws EmbeddingError when API returns wrong dimensions", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: new Array(512).fill(0.1),
    });

    await expect(embedText("test")).rejects.toThrow(EmbeddingError);
  });

  it("throws EmbeddingError when API request fails", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("Network error"));

    await expect(embedText("test")).rejects.toThrow(EmbeddingError);
  });

  it("throws EmbeddingError when API returns unexpected format", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "not an array" });

    await expect(embedText("test")).rejects.toThrow(EmbeddingError);
  });
});

describe("embedBatch", () => {
  it("returns embeddings for multiple inputs", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [VALID_EMBEDDING, VALID_EMBEDDING],
    });

    const result = await embedBatch(["text1", "text2"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1024);
    expect(result[1]).toHaveLength(1024);
  });

  it("throws EmbeddingError when API key is missing", async () => {
    delete process.env.HUGGINGFACE_API_KEY;

    await expect(embedBatch(["test"])).rejects.toThrow(EmbeddingError);
  });

  it("throws EmbeddingError when any embedding has wrong dimensions", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [VALID_EMBEDDING, new Array(512).fill(0.1)],
    });

    await expect(embedBatch(["a", "b"])).rejects.toThrow(EmbeddingError);
  });
});
