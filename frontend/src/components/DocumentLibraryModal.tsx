import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileText,
  Clock,
  Trash2,
  X,
  Loader2,
  BookOpen,
  CheckCircle2,
  Layers,
  Sparkles,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';
import type { DocumentMeta } from '../types';
import { chunkUserDocument } from '../api/client';
import { chunkLocalDocument } from '../utils/localDocumentStorage';
import { useAuth } from '../context/AuthContext';

interface DocumentLibraryModalProps {
  isOpen: boolean;
  documents: DocumentMeta[];
  currentDocId: string | null;
  onSelectDocument: (id: string) => void;
  onUploadDocument: (file: File) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefreshDocuments?: () => void;
  onClose: () => void;
}

export const DocumentLibraryModal: React.FC<DocumentLibraryModalProps> = ({
  isOpen,
  documents,
  currentDocId,
  onSelectDocument,
  onUploadDocument,
  onDeleteDocument,
  onRefreshDocuments,
  onClose,
}) => {
  const { isGuest } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [chunkingDocId, setChunkingDocId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Please select a valid PDF file.');
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      await onUploadDocument(file);
      onClose();
    } catch (e: any) {
      setUploadError(e?.message || 'Failed to upload PDF');
    } finally {
      setIsUploading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleChunk = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    setChunkingDocId(docId);
    try {
      if (isGuest) {
        await chunkLocalDocument(docId);
      } else {
        await chunkUserDocument(docId);
      }
      if (onRefreshDocuments) onRefreshDocuments();
    } catch (err: any) {
      alert(`Failed to process document: ${err?.message || err}`);
    } finally {
      setChunkingDocId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Document Library</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
              {documents.length} papers
            </span>
            {isGuest && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                <span>Local Storage</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isGuest && documents.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (confirm(`Delete all ${documents.length} locally saved papers and their notes from this browser?`)) {
                    for (const doc of documents) {
                      await onDeleteDocument(doc.id);
                    }
                  }
                }}
                className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/60 transition cursor-pointer"
                title="Delete all locally stored papers from this browser"
              >
                Clear All Local Papers
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Local Storage Privacy Banner */}
        {isGuest && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span>Running locally. Uploaded PDFs, annotations, and notes are saved directly to this browser and never uploaded to any server.</span>
          </div>
        )}

        {/* Upload Zone */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all ${
              dragOver
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-2 text-indigo-600">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-xs font-semibold">Processing PDF and extracting pages...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    Click to upload
                  </span>{' '}
                  <span className="text-xs text-gray-500">or drag and drop your research PDF</span>
                </div>
                <p className="text-[11px] text-gray-400">Supports all academic papers, books, and reports (PDF)</p>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="text-xs text-rose-500 mt-2 text-center font-medium">{uploadError}</p>
          )}
        </div>

        {/* Existing Documents List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-700" />
              <p className="text-xs">No documents uploaded yet. Upload a PDF above to begin reading!</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isCurrent = doc.id === currentDocId;
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    onSelectDocument(doc.id);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 shadow-sm ring-1 ring-indigo-400'
                      : 'bg-white dark:bg-gray-800/70 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                          {doc.original_name}
                        </h4>
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-1.5 py-0.2 rounded-full">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1">
                        <span>{doc.page_count} pages</span>
                        <span>•</span>
                        <span>{formatBytes(doc.file_size)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(doc.updated_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-2 mt-2 w-48">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(5, doc.progress_percent))}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500">
                          {Math.round(doc.progress_percent)}%
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center gap-2 mt-2">
                        {doc.is_chunked ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                            AI Ready ({doc.chunk_count} chunks)
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            Not indexed for AI
                          </span>
                        )}
                        {isGuest && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            • Local device
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleChunk(e, doc.id)}
                      disabled={chunkingDocId === doc.id}
                      className={`p-1.5 rounded-lg transition ${
                        chunkingDocId === doc.id
                          ? 'bg-indigo-50 text-indigo-600 animate-pulse'
                          : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                      }`}
                      title={doc.is_chunked ? "Re-chunk & Index document for AI" : "Process & Chunk document for AI search"}
                    >
                      {chunkingDocId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      ) : (
                        <Layers className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${doc.original_name}" and all its notes?`)) {
                          onDeleteDocument(doc.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                      title="Delete paper"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
