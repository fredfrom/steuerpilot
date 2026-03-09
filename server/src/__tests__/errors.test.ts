import { EmbeddingError, VectorSearchError, LlmError } from "../errors/index.js";

describe("EmbeddingError", () => {
  it("has the correct name and message", () => {
    const error = new EmbeddingError("test error");
    expect(error.name).toBe("EmbeddingError");
    expect(error.message).toBe("test error");
    expect(error).toBeInstanceOf(Error);
  });

  it("preserves the cause", () => {
    const cause = new Error("original");
    const error = new EmbeddingError("wrapped", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("VectorSearchError", () => {
  it("has the correct name and message", () => {
    const error = new VectorSearchError("search failed");
    expect(error.name).toBe("VectorSearchError");
    expect(error.message).toBe("search failed");
    expect(error).toBeInstanceOf(Error);
  });

  it("preserves the cause", () => {
    const cause = new Error("db timeout");
    const error = new VectorSearchError("wrapped", cause);
    expect(error.cause).toBe(cause);
  });
});

describe("LlmError", () => {
  it("has the correct name and message", () => {
    const error = new LlmError("model unavailable");
    expect(error.name).toBe("LlmError");
    expect(error.message).toBe("model unavailable");
    expect(error).toBeInstanceOf(Error);
  });

  it("preserves the cause", () => {
    const cause = new Error("timeout");
    const error = new LlmError("wrapped", cause);
    expect(error.cause).toBe(cause);
  });
});
