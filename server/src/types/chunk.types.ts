import type { Document } from "mongoose";

export interface BmfChunkMetadata {
  date: string;
  gz: string;
  steuerart: string;
  title: string;
  bmf_url: string;
  paragraphen: string[];
  is_superseded: boolean;
}

export interface IBmfChunk {
  doc_id: string;
  chunk_index: number;
  text: string;
  embedding: number[];
  tldr: string | null;
  metadata: BmfChunkMetadata;
}

export interface IBmfChunkDocument extends IBmfChunk, Document {}
