export interface Source {
  title: string;
  date: string;
  gz: string;
  steuerart: string;
  bmfUrl: string;
  relevanceScore: number;
}

export interface SearchResult {
  answer: string;
  sources: Source[];
}

export interface CategoryCount {
  steuerart: string;
  count: number;
}

export interface IndexStats {
  totalDocuments: number;
  lastUpdated: string;
  byCategory: CategoryCount[];
}

export interface VectorSearchOptions {
  steuerart?: string;
  limit?: number;
  numCandidates?: number;
}

export interface VectorSearchResult {
  text: string;
  metadata: {
    date: string;
    gz: string;
    steuerart: string;
    title: string;
    bmf_url: string;
    paragraphen: string[];
    is_superseded: boolean;
  };
  score: number;
}
