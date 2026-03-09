import { embedText, embedBatch } from "../services/embedding.js";

describe("embedding service", () => {
  describe("embedText", () => {
    it.todo("should return a 1024-dimensional array");
    it.todo("should call HuggingFace API with correct headers");
    it.todo("should throw on API error");
  });

  describe("embedBatch", () => {
    it.todo("should return an array of 1024-dim arrays");
    it.todo("should handle empty input array");
    it.todo("should call HuggingFace API with batch input");
  });
});
