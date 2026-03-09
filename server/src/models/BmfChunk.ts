import mongoose from "mongoose";
import type { IBmfChunkDocument } from "../types/chunk.types.js";

const bmfChunkSchema = new mongoose.Schema<IBmfChunkDocument>({
  doc_id: { type: String, required: true, index: true },
  chunk_index: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  tldr: { type: String, default: null },
  metadata: {
    date: { type: String, required: true },
    gz: { type: String, required: true },
    steuerart: { type: String, required: true },
    title: { type: String, required: true },
    bmf_url: { type: String, required: true },
    paragraphen: { type: [String], default: [] },
    is_superseded: { type: Boolean, default: false },
  },
});

bmfChunkSchema.index({ doc_id: 1, chunk_index: 1 }, { unique: true });

export const BmfChunk = mongoose.model<IBmfChunkDocument>(
  "BmfChunk",
  bmfChunkSchema,
  "bmf_chunks"
);
