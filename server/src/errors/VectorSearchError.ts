export class VectorSearchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "VectorSearchError";
  }
}
