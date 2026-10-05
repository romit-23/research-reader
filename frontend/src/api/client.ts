import type {
  DocumentMeta,
  Annotation,
  DocumentNote,
  AIDeepDiveResponse,
  AIChatResponse,
  AIProvidersInfo,
  AISettings,
  User,
  AuthResponse
} from '../types';

const rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = rawApiBase.replace(/\/+$/, '');

const TOKEN_KEY = 'research_reader_auth_token';
const AI_SETTINGS_KEY = 'research_reader_ai_settings';

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  ollamaUrl: 'http://localhost:11434',
};

export function getStoredAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
    // Auto-migrate legacy/deprecated model names from previous session cache
    if (parsed.provider === 'gemini' && (parsed.model === 'gemini-1.5-flash' || parsed.model === 'gemini-2.0-flash-exp')) {
      parsed.model = 'gemini-2.5-flash';
    }
    return parsed;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function setStoredAISettings(settings: AISettings): void {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getStoredToken();
  const aiSettings = getStoredAISettings();
  const headers: Record<string, string> = { ...extraHeaders };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Forward client-side BYOK configuration
  if (aiSettings.provider) {
    headers['X-AI-Provider'] = aiSettings.provider;
  }
  if (aiSettings.apiKey) {
    headers['X-AI-Key'] = aiSettings.apiKey;
  }
  if (aiSettings.model) {
    headers['X-AI-Model'] = aiSettings.model;
  }
  if (aiSettings.ollamaUrl) {
    headers['X-Ollama-Url'] = aiSettings.ollamaUrl;
  }

  return headers;
}

// --- Auth Endpoints ---

export async function apiSignup(data: { email: string; username: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to sign up' }));
    throw new Error(err.detail || 'Failed to sign up');
  }
  const result: AuthResponse = await res.json();
  setStoredToken(result.access_token);
  return result;
}

export async function apiLogin(data: { email: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Invalid email or password' }));
    throw new Error(err.detail || 'Invalid email or password');
  }
  const result: AuthResponse = await res.json();
  setStoredToken(result.access_token);
  return result;
}

export async function apiGetMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    clearStoredToken();
    throw new Error('Session expired or invalid. Please log in.');
  }
  return res.json();
}

// --- Documents Endpoints ---

export async function getDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch(`${API_BASE}/api/documents`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function uploadDocument(file: File): Promise<DocumentMeta> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/documents/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to upload document' }));
    throw new Error(err.detail || 'Failed to upload document');
  }
  return res.json();
}

export async function reuploadDocumentFile(id: string, file: File): Promise<DocumentMeta> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/api/documents/${id}/reupload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to re-upload document file' }));
    throw new Error(err.detail || 'Failed to re-upload document file');
  }
  return res.json();
}

export async function getDocument(id: string): Promise<DocumentMeta> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch document details');
  return res.json();
}

export function getDocumentFileUrl(id: string): string {
  // We can pass token via query parameter or fetch with bearer
  return `${API_BASE}/api/documents/${id}/file`;
}

// Helper to fetch protected PDF binary with bearer token
export async function fetchDocumentFileBlob(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/documents/${id}/file`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load document file');
  return res.blob();
}

export async function updateProgress(id: string, lastPage: number, progressPercent?: number): Promise<DocumentMeta> {
  const res = await fetch(`${API_BASE}/api/documents/${id}/progress`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ last_page: lastPage, progress_percent: progressPercent }),
  });
  if (!res.ok) throw new Error('Failed to update progress');
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete document');
}

// --- Annotations Endpoints ---

export async function getAnnotations(docId: string): Promise<Annotation[]> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/annotations`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch annotations');
  return res.json();
}

export async function createAnnotation(
  docId: string,
  data: {
    page_number: number;
    color: string;
    selected_text: string;
    rects_json: string;
    comment_text?: string;
  }
): Promise<Annotation> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/annotations`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create annotation');
  return res.json();
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete annotation');
}

export async function updateAnnotation(
  annotationId: string,
  data: { color?: string; comment_text?: string }
): Promise<Annotation> {
  const res = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update annotation');
  return res.json();
}

// --- Notes Endpoints ---

export async function getDocumentNotes(docId: string): Promise<DocumentNote> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/notes`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function updateDocumentNotes(docId: string, content: string): Promise<DocumentNote> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/notes`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to update notes');
  return res.json();
}

// --- AI Endpoints ---

export async function fetchAIDeepDive(
  selectedText: string,
  mode = 'explain',
  documentId?: string,
  currentPage?: number
): Promise<AIDeepDiveResponse> {
  const res = await fetch(`${API_BASE}/api/ai/deep-dive`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      selected_text: selectedText,
      mode,
      document_id: documentId,
      current_page: currentPage,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to run AI deep dive' }));
    throw new Error(err.detail || 'Failed to run AI deep dive');
  }
  return res.json();
}

export async function fetchAIChat(
  documentId: string | undefined,
  question: string,
  currentPage?: number,
  history: { role: string; content: string }[] = [],
  mode = 'qa'
): Promise<AIChatResponse> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      document_id: documentId,
      question,
      current_page: currentPage,
      history,
      mode,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to query AI research assistant' }));
    throw new Error(err.detail || 'Failed to query AI research assistant');
  }
  return res.json();
}

export async function fetchAISummary(
  documentId: string,
  mode = 'executive'
): Promise<AIChatResponse> {
  const res = await fetch(`${API_BASE}/api/ai/summary`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      document_id: documentId,
      mode,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to generate summary' }));
    throw new Error(err.detail || 'Failed to generate summary');
  }
  return res.json();
}

export async function getAIProviders(): Promise<AIProvidersInfo> {
  const res = await fetch(`${API_BASE}/api/ai/providers`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch AI providers info');
  return res.json();
}

export async function testAIConnection(
  provider: string,
  apiKey?: string,
  model?: string,
  ollamaUrl?: string
): Promise<{ success: boolean; provider: string; message: string; models?: string[] }> {
  const res = await fetch(`${API_BASE}/api/ai/test-connection`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      provider,
      api_key: apiKey,
      model,
      ollama_url: ollamaUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Test connection failed' }));
    throw new Error(err.detail || 'Test connection failed');
  }
  return res.json();
}

export async function fetchProviderModels(
  provider: string,
  apiKey?: string,
  ollamaUrl?: string
): Promise<{ success: boolean; provider: string; models: { id: string; name: string }[]; message?: string }> {
  const res = await fetch(`${API_BASE}/api/ai/fetch-models`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      provider,
      api_key: apiKey,
      ollama_url: ollamaUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch models' }));
    throw new Error(err.detail || 'Failed to fetch models');
  }
  return res.json();
}

// --- Admin & AI RAG Endpoints ---

export async function getAdminHealth(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/health`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch admin health');
  return res.json();
}

export async function getAdminTableRecords(
  tableName: string,
  page = 1,
  limit = 25,
  search = ''
): Promise<any> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) params.append('search', search);

  const res = await fetch(`${API_BASE}/api/admin/tables/${tableName}?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch table records for ${tableName}`);
  return res.json();
}

export async function getAdminRagDocuments(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/admin/rag/documents`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch RAG documents status');
  return res.json();
}

export async function triggerDocumentChunking(
  docId: string,
  targetWords = 150,
  overlapWords = 30
): Promise<any> {
  const params = new URLSearchParams({
    target_words: String(targetWords),
    overlap_words: String(overlapWords),
  });

  const res = await fetch(`${API_BASE}/api/admin/rag/chunk/${docId}?${params.toString()}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to trigger chunking');
  return res.json();
}

export async function getAdminDocumentChunks(docId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/admin/rag/chunks/${docId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch document chunks');
  return res.json();
}

export async function testRagSearch(
  query: string,
  documentId?: string,
  topK = 5
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/admin/rag/test-search`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, document_id: documentId, top_k: topK }),
  });
  if (!res.ok) throw new Error('Failed to run RAG search test');
  return res.json();
}

// --- User-Level Document Chunking & Search ---

export async function chunkUserDocument(
  docId: string,
  targetWords = 150,
  overlapWords = 30
): Promise<any> {
  const params = new URLSearchParams({
    target_words: String(targetWords),
    overlap_words: String(overlapWords),
  });

  const res = await fetch(`${API_BASE}/api/documents/${docId}/chunk?${params.toString()}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to process and chunk document');
  return res.json();
}

export async function getUserDocumentChunks(docId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/chunks`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch document chunks');
  return res.json();
}

export async function searchUserDocumentChunks(
  docId: string,
  query: string,
  topK = 5
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/documents/${docId}/rag-search`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error('Failed to search document chunks');
  return res.json();
}

