export interface LlmContextChunk {
  text: string;
  metadata: {
    date: string;
    gz: string;
    steuerart: string;
    title: string;
    bmf_url: string;
  };
}
