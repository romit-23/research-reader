import type { DocumentMeta, Annotation, DocumentNote, DocumentChunk, CitedChunk } from '../types';
import { pdfjsLib } from './pdfWorker';

const DB_NAME = 'ResearchReaderLocalDB';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('pdf_files')) {
        db.createObjectStore('pdf_files', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('annotations')) {
        const annStore = db.createObjectStore('annotations', { keyPath: 'id' });
        annStore.createIndex('document_id', 'document_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'document_id' });
      }

      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('document_id', 'document_id', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open local IndexedDB'));
    };
  });

  return dbPromise;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'local_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
}

/**
 * Retrieve all locally saved documents
 */
export async function getLocalDocuments(): Promise<DocumentMeta[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const request = store.getAll();

    request.onsuccess = () => {
      const docs: DocumentMeta[] = request.result || [];
      // Sort newest first
      docs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      resolve(docs);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to fetch local documents'));
    };
  });
}

/**
 * Save a new PDF file and metadata into local IndexedDB
 */
export async function saveLocalDocument(file: File, pageCount: number): Promise<DocumentMeta> {
  const db = await openLocalDB();
  const id = generateUUID();
  const now = new Date().toISOString();

  const meta: DocumentMeta = {
    id,
    original_name: file.name,
    file_size: file.size,
    page_count: Math.max(1, pageCount),
    last_page: 1,
    progress_percent: 0,
    chunk_count: 0,
    is_chunked: false,
    created_at: now,
    updated_at: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'pdf_files', 'notes'], 'readwrite');

    tx.oncomplete = () => {
      resolve(meta);
    };

    tx.onerror = () => {
      reject(tx.error || new Error('Failed to save document locally'));
    };

    // Store metadata
    tx.objectStore('documents').put(meta);

    // Store binary PDF Blob
    tx.objectStore('pdf_files').put({
      id,
      blob: file,
      name: file.name,
      updated_at: now,
    });

    // Initialize blank note
    tx.objectStore('notes').put({
      id: generateUUID(),
      document_id: id,
      content: '',
      updated_at: now,
    });
  });
}

/**
 * Retrieve the binary PDF Blob for a local document
 */
export async function getLocalDocumentBlob(docId: string): Promise<Blob | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdf_files', 'readonly');
    const store = tx.objectStore('pdf_files');
    const request = store.get(docId);

    request.onsuccess = () => {
      if (request.result && request.result.blob) {
        resolve(request.result.blob);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to get local PDF blob'));
    };
  });
}

/**
 * Cache binary PDF blob in browser IndexedDB (used for offline & cloud persistence cache)
 */
export async function saveCachedPdfBlob(docId: string, blob: Blob, name: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdf_files', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to cache PDF blob'));
    tx.objectStore('pdf_files').put({
      id: docId,
      blob,
      name,
      updated_at: new Date().toISOString(),
    });
  });
}

/**
 * Delete a local document and all associated files, annotations, notes, and chunks
 */
export async function deleteLocalDocument(docId: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'pdf_files', 'annotations', 'notes', 'chunks'], 'readwrite');

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(tx.error || new Error('Failed to delete local document'));
    };

    tx.objectStore('documents').delete(docId);
    tx.objectStore('pdf_files').delete(docId);
    tx.objectStore('notes').delete(docId);

    // Delete all annotations for this document
    const annStore = tx.objectStore('annotations');
    const annIndex = annStore.index('document_id');
    const annReq = annIndex.openCursor(IDBKeyRange.only(docId));
    annReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete all chunks for this document
    const chunkStore = tx.objectStore('chunks');
    const chunkIndex = chunkStore.index('document_id');
    const chunkReq = chunkIndex.openCursor(IDBKeyRange.only(docId));
    chunkReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

/**
 * Chunk a local document client-side using PDF.js and store chunks in IndexedDB
 */
export async function chunkLocalDocument(
  docId: string,
  targetWords = 160,
  overlapWords = 35
): Promise<DocumentChunk[]> {
  const blob = await getLocalDocumentBlob(docId);
  if (!blob) throw new Error('Local PDF document not found');

  const arrayBuffer = await blob.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  const allChunks: DocumentChunk[] = [];
  let chunkIndex = 0;
  const now = new Date().toISOString();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rawText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawText) continue;

    const words = rawText.split(' ').filter(Boolean);
    if (!words.length) continue;

    const step = Math.max(1, targetWords - overlapWords);

    for (let i = 0; i < words.length; i += step) {
      const chunkWords = words.slice(i, i + targetWords);
      const chunkText = chunkWords.join(' ');
      if (chunkText.length < 15 && i > 0) continue;

      allChunks.push({
        id: generateUUID(),
        document_id: docId,
        page_number: pageNum,
        chunk_index: chunkIndex++,
        content: chunkText,
        token_count: Math.round(chunkWords.length * 1.3),
        created_at: now,
      });

      if (i + targetWords >= words.length) break;
    }
  }

  // Save chunks in IndexedDB and update document metadata
  const db = await openLocalDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['chunks', 'documents'], 'readwrite');

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to save document chunks'));

    // Remove existing chunks for this document
    const chunkStore = tx.objectStore('chunks');
    const index = chunkStore.index('document_id');
    const req = index.openCursor(IDBKeyRange.only(docId));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Store new chunks
    for (const chunk of allChunks) {
      chunkStore.put(chunk);
    }

    // Update document record
    const docStore = tx.objectStore('documents');
    const docReq = docStore.get(docId);
    docReq.onsuccess = () => {
      const doc: DocumentMeta = docReq.result;
      if (doc) {
        doc.is_chunked = allChunks.length > 0;
        doc.chunk_count = allChunks.length;
        doc.updated_at = new Date().toISOString();
        docStore.put(doc);
      }
    };
  });

  return allChunks;
}

/**
 * Get all chunks for a local document
 */
export async function getLocalDocumentChunks(docId: string): Promise<DocumentChunk[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('chunks', 'readonly');
    const store = tx.objectStore('chunks');
    const index = store.index('document_id');
    const request = index.getAll(IDBKeyRange.only(docId));

    request.onsuccess = () => {
      const chunks: DocumentChunk[] = request.result || [];
      chunks.sort((a, b) => a.chunk_index - b.chunk_index);
      resolve(chunks);
    };

    request.onerror = () => reject(request.error || new Error('Failed to get chunks'));
  });
}

/**
 * Search local chunks using keyword scoring (client-side RAG)
 */
export async function searchLocalDocumentChunks(
  docId: string,
  query: string,
  topK = 5
): Promise<CitedChunk[]> {
  const chunks = await getLocalDocumentChunks(docId);
  if (!chunks.length) return [];

  const queryTerms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  if (!queryTerms.length) return [];

  const scored = chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        const matches = contentLower.split(term).length - 1;
        score += matches;
      }
    }
    return {
      chunk_id: chunk.id,
      page_number: chunk.page_number,
      chunk_index: chunk.chunk_index,
      snippet: chunk.content.slice(0, 200) + '...',
      score,
    };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Update reading progress for a local document
 */
export async function updateLocalProgress(
  docId: string,
  lastPage: number,
  progressPercent?: number
): Promise<DocumentMeta> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.get(docId);

    request.onsuccess = () => {
      const doc: DocumentMeta = request.result;
      if (!doc) {
        reject(new Error('Document not found in local storage'));
        return;
      }

      const total = doc.page_count || 1;
      const computedPercent =
        progressPercent !== undefined
          ? progressPercent
          : Math.min(100, Math.round((lastPage / total) * 100));

      doc.last_page = lastPage;
      doc.progress_percent = computedPercent;
      doc.updated_at = new Date().toISOString();

      const putRequest = store.put(doc);
      putRequest.onsuccess = () => resolve(doc);
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to update local progress'));
    };
  });
}

/**
 * Retrieve all annotations for a document
 */
export async function getLocalAnnotations(docId: string): Promise<Annotation[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readonly');
    const store = tx.objectStore('annotations');
    const index = store.index('document_id');
    const request = index.getAll(IDBKeyRange.only(docId));

    request.onsuccess = () => {
      const list: Annotation[] = request.result || [];
      list.sort((a, b) => {
        if (a.page_number !== b.page_number) {
          return a.page_number - b.page_number;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      resolve(list);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to fetch local annotations'));
    };
  });
}

/**
 * Save an annotation locally
 */
export async function saveLocalAnnotation(
  docId: string,
  data: {
    page_number: number;
    color: string;
    selected_text: string;
    rects_json: string;
    comment_text?: string;
  }
): Promise<Annotation> {
  const db = await openLocalDB();
  const id = generateUUID();
  const now = new Date().toISOString();

  const annotation: Annotation = {
    id,
    document_id: docId,
    page_number: data.page_number,
    color: data.color,
    selected_text: data.selected_text,
    rects_json: data.rects_json,
    comment_text: data.comment_text,
    created_at: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.put(annotation);

    request.onsuccess = () => resolve(annotation);
    request.onerror = () => reject(request.error || new Error('Failed to save local annotation'));
  });
}

/**
 * Delete an annotation locally
 */
export async function deleteLocalAnnotation(annotationId: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.delete(annotationId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to delete local annotation'));
  });
}

/**
 * Update an annotation locally
 */
export async function updateLocalAnnotation(
  annotationId: string,
  data: { color?: string; comment_text?: string }
): Promise<Annotation> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const req = store.get(annotationId);

    req.onsuccess = () => {
      const ann: Annotation = req.result;
      if (!ann) {
        reject(new Error('Annotation not found'));
        return;
      }
      if (data.color !== undefined) ann.color = data.color;
      if (data.comment_text !== undefined) ann.comment_text = data.comment_text;
      const putReq = store.put(ann);
      putReq.onsuccess = () => resolve(ann);
      putReq.onerror = () => reject(putReq.error || new Error('Failed to update local annotation'));
    };

    req.onerror = () => reject(req.error || new Error('Failed to get local annotation'));
  });
}

/**
 * Get markdown notes for a document
 */
export async function getLocalNotes(docId: string): Promise<DocumentNote> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const store = tx.objectStore('notes');
    const request = store.get(docId);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        resolve({
          id: generateUUID(),
          document_id: docId,
          content: '',
          updated_at: new Date().toISOString(),
        });
      }
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to get local notes'));
    };
  });
}

/**
 * Save markdown notes for a document
 */
export async function saveLocalNotes(docId: string, content: string): Promise<DocumentNote> {
  const db = await openLocalDB();
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    let savedNote: DocumentNote;
    tx.oncomplete = () => resolve(savedNote);
    tx.onerror = () => reject(tx.error || new Error('Failed to save local notes'));
    tx.onabort = () => reject(tx.error || new Error('Local note save was cancelled'));
    const store = tx.objectStore('notes');
    const request = store.get(docId);

    request.onsuccess = () => {
      const existing = request.result;
      savedNote = {
        id: existing?.id || generateUUID(),
        document_id: docId,
        content,
        updated_at: now,
      };

      const putRequest = store.put(savedNote);
      putRequest.onerror = () => reject(putRequest.error);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to save local notes'));
    };
  });
}
