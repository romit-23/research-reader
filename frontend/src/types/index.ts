export interface NormalizedRect {
  x: number;      // 0.0 to 1.0 (relative to page width)
  y: number;      // 0.0 to 1.0 (relative to page height)
  width: number;  // 0.0 to 1.0
  height: number; // 0.0 to 1.0
}

export interface Annotation {
  id: string;
  document_id: string;
  page_number: number;
  color: string;
  selected_text: string;
  rects_json: string; // JSON representation of NormalizedRect[]
  comment_text?: string;
  created_at: string;
}

export interface ParsedAnnotation extends Omit<Annotation, 'rects_json'> {
  rects: NormalizedRect[];
}

export interface DocumentMeta {
  id: string;
  original_name: string;
  file_size: number;
  page_count: number;
  last_page: number;
  progress_percent: number;
  chunk_count?: number;
  is_chunked?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentNote {
  id: string;
  document_id: string;
  content: string;
  updated_at: string;
}

export interface TOCItem {
  title: string;
  pageNumber: number;
  children?: TOCItem[];
}

export type ReadingTheme = 'light' | 'sepia' | 'dark';

export interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
  globalIndex?: number;
  contextText: string;
}

export type AIProvider = 'ollama' | 'gemini' | 'openai' | 'anthropic' | 'groq' | 'deepseek';

export interface ModelItem {
  id: string;
  name: string;
}

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

export interface CitedChunk {
  chunk_id: string;
  page_number: number;
  chunk_index: number;
  snippet: string;
  score: number;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cited_chunks?: CitedChunk[];
  suggested_followups?: string[];
  timestamp: string;
}

export interface AIDeepDiveResponse {
  query: string;
  explanation: string;
  google_search_url: string;
  suggested_followups: string[];
  provider_used?: string;
  model_used?: string;
}

export interface AIChatResponse {
  answer: string;
  cited_chunks: CitedChunk[];
  suggested_followups: string[];
  provider_used: string;
  model_used: string;
}

export interface AIProvidersInfo {
  environment?: 'prod' | 'local';
  ollama_available: boolean;
  ollama_models: string[];
  supported_cloud_providers: string[];
  default_provider: string;
  default_model: string;
  server_configured_providers?: string[];
  show_ai_reasons?: boolean;
}

export interface User {
  id: string;
  email: string;
  username: string;
  is_admin?: boolean;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  page_number: number;
  content: string;
  token_count: number;
  created_at: string;
}

export interface ChunkSummary {
  document_id: string;
  document_name: string;
  pages_processed: number;
  chunks_generated: number;
  total_tokens_estimated: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
