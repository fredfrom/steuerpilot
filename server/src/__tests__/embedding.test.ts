import axios from "axios";
import { embedText, embedBatch } from "../services/embedding.js";
import { EmbeddingError } from "../errors/index.js";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// HF API returns 1024 dims; our functions truncate to 512 (Matryoshka)
const RAW_EMBEDDING_1024 = new Array(1024).fill(0.1) as number[];

beforeEach(() => {
  process.env.HUGGINGFACE_API_KEY = "test-key";
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("embedText", () => {
  it("returns a 512-dimensional embedding (truncated from 1024)", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: RAW_EMBEDDING_1024 });

    const result = await embedText("test input");

    expect(result).toHaveLength(512);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it("throws EmbeddingError when API key is missing", async () => {
    delete process.env.HUGGINGFACE_API_KEY;

    await expect(embedText("test")).rejects.toThrow(EmbeddingError);
    await expect(embedText("test")).rejects.toThrow(
      "HUGGINGFACE_API_KEY is not set"
    );
  });

  it("throws EmbeddingError when API returns wrong raw dimensions", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: new Array(768).fill(0.1),
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
  it("returns 512-dim embeddings for multiple inputs", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [RAW_EMBEDDING_1024, RAW_EMBEDDING_1024],
    });

    const result = await embedBatch(["text1", "text2"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(512);
    expect(result[1]).toHaveLength(512);
  });

  it("throws EmbeddingError when API key is missing", async () => {
    delete process.env.HUGGINGFACE_API_KEY;

    await expect(embedBatch(["test"])).rejects.toThrow(EmbeddingError);
  });

  it("throws EmbeddingError when any embedding has wrong raw dimensions", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [RAW_EMBEDDING_1024, new Array(768).fill(0.1)],
    });

    await expect(embedBatch(["a", "b"])).rejects.toThrow(EmbeddingError);
  });
});
