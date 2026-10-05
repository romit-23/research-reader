import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  DocumentMeta,
  ParsedAnnotation,
  ReadingTheme,
  TOCItem,
  NormalizedRect,
  SearchMatch,
  AISettings,
} from './types';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  fetchDocumentFileBlob,
  updateProgress,
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getDocumentNotes,
  updateDocumentNotes,
  reuploadDocumentFile,
  getStoredAISettings,
} from './api/client';
import {
  getLocalDocuments,
  saveLocalDocument,
  getLocalDocumentBlob,
  saveCachedPdfBlob,
  deleteLocalDocument,
  updateLocalProgress,
  getLocalAnnotations,
  saveLocalAnnotation,
  updateLocalAnnotation,
  deleteLocalAnnotation,
  getLocalNotes,
  saveLocalNotes,
  chunkLocalDocument,
} from './utils/localDocumentStorage';
import { pdfjsLib } from './utils/pdfWorker';

import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/Auth/AuthModal';
import { AdminModal } from './components/Admin/AdminModal';
import { AISettingsModal } from './components/AI/AISettingsModal';
import { Header } from './components/Header';
import { PdfViewer } from './components/PdfViewer/PdfViewer';
import { SearchBar } from './components/PdfViewer/SearchBar';
import { SidebarTabs, type SidebarTab } from './components/Sidebar/SidebarTabs';
import { DocumentLibraryModal } from './components/DocumentLibraryModal';
import { BookOpen, UploadCloud, Loader2, AlertCircle } from 'lucide-react';

export function App() {
  const { user, isGuest, isLoading: authLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [aiSettingsModalOpen, setAiSettingsModalOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>(getStoredAISettings());

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const currentDocIdRef = useRef(currentDocId);
  useLayoutEffect(() => {
    currentDocIdRef.current = currentDocId;
  }, [currentDocId]);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isReuploading, setIsReuploading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [theme, setTheme] = useState<ReadingTheme>('light');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>('notes');
  const [isSearching, setIsSearching] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const [annotations, setAnnotations] = useState<ParsedAnnotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [notesContent, setNotesContent] = useState('');
  const [outline, setOutline] = useState<TOCItem[]>([]);
  const [aiQuery, setAiQuery] = useState('');
  const [aiMode, setAiMode] = useState('explain');
  const [targetPageJump, setTargetPageJump] = useState<number | null>(null);
  const [activePdfDoc, setActivePdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatch, setActiveSearchMatch] = useState<SearchMatch | null>(null);

  const currentDoc = useMemo(
    () => documents.find((d) => d.id === currentDocId) || null,
    [documents, currentDocId]
  );

  // Load documents: from server if logged in, or from local IndexedDB if guest
  useEffect(() => {
    if (!user && !isGuest) {
      setDocuments([]);
      setCurrentDocId(null);
      setAnnotations([]);
      setNotesContent('');
      setPdfBlobUrl(null);
      return;
    }

    async function loadDocs() {
      setLoadingDocs(true);
      try {
        const docs = user ? await getDocuments() : await getLocalDocuments();
        setDocuments(docs);
        if (docs.length > 0) {
          setCurrentDocId(docs[0].id);
          setCurrentPage(docs[0].last_page || 1);
        } else {
          setCurrentDocId(null);
        }
      } catch (err) {
        console.error('Error fetching documents:', err);
      } finally {
        setLoadingDocs(false);
      }
    }

    loadDocs();
  }, [user, isGuest]);

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = user ? await getDocuments() : await getLocalDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error refreshing documents:', err);
    }
  }, [user]);

  // When active document changes, load its PDF blob
  useEffect(() => {
    if (!currentDocId || (!user && !isGuest)) {
      setPdfBlobUrl(null);
      setPdfLoading(false);
      setPdfError(null);
      return;
    }

    let isCancelled = false;
    let createdUrl: string | null = null;

    async function loadPdfBlob() {
      setPdfLoading(true);
      setPdfError(null);
      try {
        // 1. Try local browser IndexedDB cache first (instant, survives server redeploys/restarts!)
        let blob = await getLocalDocumentBlob(currentDocId!);

        // 2. If not in local cache, fetch from backend if user
        if (!blob && user) {
          blob = await fetchDocumentFileBlob(currentDocId!);
          // Cache in IndexedDB for subsequent loads
          if (blob) {
            await saveCachedPdfBlob(currentDocId!, blob, currentDoc?.original_name || 'document.pdf');
          }
        }

        if (isCancelled) return;
        if (!blob) {
          throw new Error('PDF file not found on server or locally');
        }

        createdUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(createdUrl);
        setPdfError(null);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('Error fetching PDF file blob:', err);
        setPdfBlobUrl(null);
        setPdfError(err?.message || 'Failed to load PDF file');
      } finally {
        if (!isCancelled) {
          setPdfLoading(false);
        }
      }
    }

    loadPdfBlob();

    return () => {
      isCancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [currentDocId, user, isGuest, currentDoc?.original_name]);

  // When active document changes, fetch its annotations and notes
  useEffect(() => {
    if (!currentDocId || (!user && !isGuest)) {
      setAnnotations([]);
      setNotesContent('');
      return;
    }

    let isCancelled = false;

    async function loadDocDetails() {
      try {
        const [anns, notes] = await Promise.all([
          user ? getAnnotations(currentDocId!) : getLocalAnnotations(currentDocId!),
          user ? getDocumentNotes(currentDocId!) : getLocalNotes(currentDocId!),
        ]);
        if (isCancelled) return;

        const parsed: ParsedAnnotation[] = anns.map((a) => {
          let rects: NormalizedRect[] = [];
          try {
            rects = JSON.parse(a.rects_json);
          } catch {
            rects = [];
          }
          return {
            id: a.id,
            document_id: a.document_id,
            page_number: a.page_number,
            color: a.color,
            selected_text: a.selected_text,
            comment_text: a.comment_text,
            created_at: a.created_at,
            rects,
          };
        });

        setAnnotations(parsed);
        const rawContent = notes.content || '';
        const isLegacyBoilerplate = /^# Notes for .*\n\nStart typing/s.test(rawContent.trim());
        setNotesContent(isLegacyBoilerplate ? '' : rawContent);
      } catch (e) {
        console.error('Failed to load document annotations/notes:', e);
      }
    }

    loadDocDetails();
    return () => {
      isCancelled = true;
    };
  }, [currentDocId, user, isGuest]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearching((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle page visibility change and update reading progress
  const handlePageChange = useCallback(
    async (pageNum: number) => {
      setCurrentPage(pageNum);
      if (!currentDocId) return;

      if (user) {
        try {
          const updated = await updateProgress(currentDocId, pageNum);
          setDocuments((prev) =>
            prev.map((d) => (d.id === currentDocId ? { ...d, last_page: updated.last_page, progress_percent: updated.progress_percent } : d))
          );
        } catch (e) {
          console.warn('Could not sync reading progress to server:', e);
        }
      } else if (isGuest) {
        try {
          const updated = await updateLocalProgress(currentDocId, pageNum);
          setDocuments((prev) =>
            prev.map((d) => (d.id === currentDocId ? { ...d, last_page: updated.last_page, progress_percent: updated.progress_percent } : d))
          );
        } catch (e) {
          console.warn('Could not sync reading progress locally:', e);
        }
      }
    },
    [currentDocId, user, isGuest]
  );

  // Jump to specific page
  const handleJumpToPage = (pageNum: number) => {
    setTargetPageJump(pageNum);
    setCurrentPage(pageNum);
  };

  // Jump to highlight (bi-directional link - vertically centers highlighted text in viewport)
  const handleJumpToAnnotation = (pageNum: number, annotationId: string) => {
    setActiveAnnotationId(annotationId);
    setCurrentPage(pageNum);

    const tryScroll = () => {
      const el = document.getElementById(`pdf-highlight-${annotationId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    };

    if (!tryScroll()) {
      const pageEl = document.getElementById(`pdf-page-${pageNum}`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryScroll() || attempts > 25) {
          clearInterval(interval);
        }
      }, 80);
    }

    setTimeout(() => {
      setActiveAnnotationId((curr) => (curr === annotationId ? null : curr));
    }, 2500);
  };

  // In-document search state change handler
  const handleSearchChange = useCallback(
    (data: {
      query: string;
      currentMatch: SearchMatch | null;
      totalMatches: number;
    }) => {
      setSearchQuery(data.query);
      setActiveSearchMatch(data.currentMatch);
    },
    []
  );

  // Trigger in-document search and highlight from AI keywords or external triggers
  const handleSearchInDoc = useCallback((term: string) => {
    setIsSearching(true);
    setSearchQuery(term);
  }, []);

  // When clicking a highlight directly on the PDF
  const handleSelectAnnotationOnPdf = (annotationId: string) => {
    setActiveAnnotationId(annotationId);
    setSidebarOpen(true);
    setActiveSidebarTab('annotations');
    setTimeout(() => {
      const el = document.getElementById(`sidebar-annotation-${annotationId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  // Add Annotation
  const handleAddAnnotation = async (data: {
    pageNumber: number;
    color: string;
    selectedText: string;
    rects: NormalizedRect[];
    commentText?: string;
  }) => {
    if (!currentDocId) return;

    try {
      const annotationPayload = {
        page_number: data.pageNumber,
        color: data.color,
        selected_text: data.selectedText,
        rects_json: JSON.stringify(data.rects),
        comment_text: data.commentText,
      };

      const created = user
        ? await createAnnotation(currentDocId, annotationPayload)
        : await saveLocalAnnotation(currentDocId, annotationPayload);

      const parsed: ParsedAnnotation = {
        ...created,
        rects: data.rects,
      };

      setAnnotations((prev) => [...prev, parsed]);

      if (data.commentText) {
        setSidebarOpen(true);
        setActiveSidebarTab('annotations');
      }
    } catch (e) {
      console.error('Failed to create annotation:', e);
    }
  };

  // Delete Annotation
  const handleDeleteAnnotation = async (id: string) => {
    try {
      if (user) {
        await deleteAnnotation(id);
      } else {
        await deleteLocalAnnotation(id);
      }
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error('Failed to delete annotation:', e);
    }
  };

  // Update Annotation Comment / Note
  const handleUpdateComment = async (id: string, comment: string) => {
    try {
      if (user) {
        await updateAnnotation(id, { comment_text: comment });
      } else {
        await updateLocalAnnotation(id, { comment_text: comment });
      }
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, comment_text: comment } : a))
      );
    } catch (e) {
      console.error('Failed to update annotation comment:', e);
    }
  };

  // Save Markdown Notes
  const handleSaveNotes = useCallback(async (content: string) => {
    if (!currentDocId) throw new Error('No document selected');
    const updated = user
      ? await updateDocumentNotes(currentDocId, content)
      : await saveLocalNotes(currentDocId, content);

    // A save finishing after a document switch must not replace its notes.
    if (currentDocIdRef.current === currentDocId) {
      setNotesContent(updated.content);
    }
  }, [currentDocId, user]);

  // AI Deep Dive Trigger (USP)
  const handleAIDeepDive = (text: string, mode: string = 'explain') => {
    setAiQuery(text);
    setAiMode(mode);
    setSidebarOpen(true);
    setActiveSidebarTab('ai');
  };

  // Upload New PDF
  const handleUploadDocument = async (file: File) => {
    if (user) {
      const newDoc = await uploadDocument(file);
      // Immediately cache file blob in browser IndexedDB
      await saveCachedPdfBlob(newDoc.id, file, file.name).catch(() => {});
      setDocuments((prev) => [newDoc, ...prev]);
      setCurrentDocId(newDoc.id);
      setCurrentPage(1);
      setTotalPages(newDoc.page_count);
    } else {
      // Client-side page count extraction using PDF.js without sending to any backend
      let pageCount = 1;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pageCount = doc.numPages;
      } catch (e) {
        console.warn('Could not extract page count locally:', e);
      }

      const newDoc = await saveLocalDocument(file, pageCount);
      setDocuments((prev) => [newDoc, ...prev]);
      setCurrentDocId(newDoc.id);
      setCurrentPage(1);
      setTotalPages(newDoc.page_count);

      // Automatically chunk the document in the background for local AI search
      chunkLocalDocument(newDoc.id)
        .then((chunks) => {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === newDoc.id
                ? { ...d, is_chunked: true, chunk_count: chunks.length }
                : d
            )
          );
        })
        .catch((err) => console.warn('Background client chunking failed:', err));
    }
  };

  // Delete Document
  const handleDeleteDocument = async (id: string) => {
    if (user) {
      await deleteDocument(id);
    } else {
      await deleteLocalDocument(id);
    }

    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (currentDocId === id) {
      const remaining = documents.filter((d) => d.id !== id);
      if (remaining.length > 0) {
        setCurrentDocId(remaining[0].id);
      } else {
        setCurrentDocId(null);
      }
    }
  };

  // Re-upload PDF file for existing document (e.g. when cloud host restarted temporary disk)
  const handleReuploadCurrentDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentDocId) return;

    setIsReuploading(true);
    try {
      if (user) {
        const updated = await reuploadDocumentFile(currentDocId, file);
        setDocuments((prev) =>
          prev.map((d) => (d.id === currentDocId ? { ...d, page_count: updated.page_count, file_size: updated.file_size } : d))
        );
      }
      // Cache in IndexedDB immediately
      await saveCachedPdfBlob(currentDocId, file, file.name);

      // Reload blob url
      const newUrl = URL.createObjectURL(file);
      setPdfBlobUrl(newUrl);
      setPdfError(null);
    } catch (err: any) {
      console.error('Failed to re-upload document:', err);
      alert(`Failed to re-upload PDF: ${err?.message || err}`);
    } finally {
      setIsReuploading(false);
      e.target.value = '';
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-950 text-indigo-600">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs font-semibold text-gray-500">Connecting to Research Reader...</span>
      </div>
    );
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden theme-${theme} ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Top Navbar */}
      <Header
        currentDoc={currentDoc}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        theme={theme}
        sidebarOpen={sidebarOpen}
        isSearching={isSearching}
        onZoomIn={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
        onZoomReset={() => setZoom(1.15)}
        onPageChange={handleJumpToPage}
        onThemeChange={setTheme}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onToggleSearch={() => setIsSearching((prev) => !prev)}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenAdmin={() => setAdminModalOpen(true)}
        onOpenAISettings={() => setAiSettingsModalOpen(true)}
      />

      {/* Main Reading Canvas & Split Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {loadingDocs || pdfLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="text-xs font-medium">
              {loadingDocs ? 'Loading your documents...' : 'Loading document PDF...'}
            </span>
          </div>
        ) : pdfError && currentDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3 shadow-sm">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">
              PDF File Missing on Server
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mt-1 mb-4 leading-relaxed">
              The file for <span className="font-semibold text-gray-700 dark:text-gray-200">"{currentDoc.original_name}"</span> was not found on the server (cloud host restarted its temporary disk).
              <br className="my-1" />
              Re-upload this PDF file below to restore it — all your existing notes, highlights, and reading progress are safely preserved!
            </p>
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="reupload-file-input"
                accept="application/pdf"
                className="hidden"
                onChange={handleReuploadCurrentDoc}
              />
              <button
                onClick={() => document.getElementById('reupload-file-input')?.click()}
                disabled={isReuploading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-md transition disabled:opacity-50"
              >
                {isReuploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                <span>{isReuploading ? 'Re-uploading...' : 'Re-upload PDF File'}</span>
              </button>
              <button
                onClick={() => setLibraryOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition"
              >
                Choose from Library
              </button>
            </div>
          </div>
        ) : pdfBlobUrl ? (
          <>
            {/* PDF Viewer */}
            <PdfViewer
              pdfUrl={pdfBlobUrl}
              zoom={zoom}
              theme={theme}
              annotations={annotations}
              activeAnnotationId={activeAnnotationId}
              onSelectAnnotation={handleSelectAnnotationOnPdf}
              onAddAnnotation={handleAddAnnotation}
              onAIDeepDive={handleAIDeepDive}
              onPageChange={handlePageChange}
              onOutlineLoaded={setOutline}
              onTotalPagesLoaded={setTotalPages}
              onDocLoaded={setActivePdfDoc}
              targetPageJump={targetPageJump}
              onClearPageJump={() => setTargetPageJump(null)}
              searchQuery={searchQuery}
              activeSearchMatch={activeSearchMatch}
            />

            {/* Split Screen Sidebar */}
            {sidebarOpen && (
              <SidebarTabs
                activeTab={activeSidebarTab}
                onChangeTab={setActiveSidebarTab}
                notesContent={notesContent}
                annotations={annotations}
                activeAnnotationId={activeAnnotationId}
                outline={outline}
                aiQuery={aiQuery}
                aiMode={aiMode}
                documentId={currentDocId}
                currentPage={currentPage}
                aiSettings={aiSettings}
                onOpenAISettings={() => setAiSettingsModalOpen(true)}
                onSaveNotes={handleSaveNotes}
                onJumpToPage={handleJumpToPage}
                onJumpToAnnotation={handleJumpToAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                onUpdateComment={handleUpdateComment}
                onSearchInDoc={handleSearchInDoc}
                onAppendToNotes={(snippet) => {
                  setNotesContent((prev) => {
                    const updated = prev + snippet;
                    handleSaveNotes(updated).catch((error) => {
                      console.error('Failed to save AI notes:', error);
                    });
                    return updated;
                  });
                }}
              />
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
            <BookOpen className="w-12 h-12 text-indigo-500 mb-3" />
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">
              {user ? `Welcome, ${user.username}!` : 'Welcome to Research Reader'}
            </h2>
            <p className="text-xs text-gray-500 max-w-sm mt-1 mb-4">
              {user
                ? 'Upload a scientific publication, pre-print, or book to start reading and taking notes.'
                : 'Upload any scientific publication, pre-print, or book to highlight, annotate, and take notes. All files are stored privately on your device.'}
            </p>
            <button
              onClick={() => setLibraryOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-md transition"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload or Choose a PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* In-document Search Overlay */}
      <SearchBar
        pdfDoc={activePdfDoc}
        isOpen={isSearching}
        initialQuery={searchQuery}
        onClose={() => {
          setIsSearching(false);
          setSearchQuery('');
          setActiveSearchMatch(null);
        }}
        onJumpToPage={handleJumpToPage}
        onSearchChange={handleSearchChange}
      />

      {/* Library & Upload Modal */}
      <DocumentLibraryModal
        isOpen={libraryOpen}
        documents={documents}
        currentDocId={currentDocId}
        onSelectDocument={(id) => {
          setCurrentDocId(id);
          const selected = documents.find((d) => d.id === id);
          if (selected) {
            setCurrentPage(selected.last_page || 1);
            setTotalPages(selected.page_count);
          }
        }}
        onUploadDocument={handleUploadDocument}
        onDeleteDocument={handleDeleteDocument}
        onRefreshDocuments={refreshDocuments}
        onClose={() => setLibraryOpen(false)}
      />

      {/* Authentication Modal - Only shown when explicitly requested */}
      <AuthModal
        isOpen={authModalOpen}
        canClose={true}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* Database & RAG Admin Modal */}
      <AdminModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />

      {/* AI Engine & BYOK Settings Modal */}
      <AISettingsModal
        isOpen={aiSettingsModalOpen}
        onClose={() => setAiSettingsModalOpen(false)}
        onSettingsSaved={(newSettings) => setAiSettings(newSettings)}
      />
    </div>
  );
}

export default App;
