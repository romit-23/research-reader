import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../../utils/pdfWorker';
import type {
  ParsedAnnotation,
  ReadingTheme,
  TOCItem,
  NormalizedRect,
  SearchMatch,
} from '../../types';
import { PdfPage } from './PdfPage';
import { SelectionToolbar } from './SelectionToolbar';
import { Loader2, AlertCircle } from 'lucide-react';

interface PdfViewerProps {
  pdfUrl: string;
  zoom: number;
  theme: ReadingTheme;
  annotations: ParsedAnnotation[];
  activeAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
  onAddAnnotation: (data: {
    pageNumber: number;
    color: string;
    selectedText: string;
    rects: NormalizedRect[];
    commentText?: string;
  }) => void;
  onAIDeepDive: (text: string, mode?: string) => void;
  onPageChange: (pageNumber: number) => void;
  onOutlineLoaded: (outline: TOCItem[]) => void;
  onTotalPagesLoaded: (totalPages: number) => void;
  onDocLoaded?: (doc: PDFDocumentProxy) => void;
  targetPageJump: number | null;
  onClearPageJump: () => void;
  searchQuery?: string;
  activeSearchMatch?: SearchMatch | null;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  zoom,
  theme,
  annotations,
  activeAnnotationId,
  onSelectAnnotation,
  onAddAnnotation,
  onAIDeepDive,
  onPageChange,
  onOutlineLoaded,
  onTotalPagesLoaded,
  onDocLoaded,
  targetPageJump,
  onClearPageJump,
  searchQuery,
  activeSearchMatch,
}) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<{
    position: { top: number; left: number };
    pageNumber: number;
    text: string;
    clusters: NormalizedRect[][];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });

    loadingTask.promise
      .then(async (doc) => {
        if (isCancelled) return;
        setPdfDoc(doc);
        onDocLoaded?.(doc);
        setLoading(false);
        onTotalPagesLoaded(doc.numPages);

        // Extract native PDF outline / Table of Contents
        try {
          const outline = await doc.getOutline();
          if (outline && outline.length > 0) {
            const parsedOutline = await parsePdfOutline(doc, outline);
            onOutlineLoaded(parsedOutline);
          } else {
            onOutlineLoaded([]);
          }
        } catch (e) {
          console.warn('Could not extract PDF outline:', e);
          onOutlineLoaded([]);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load PDF:', err);
        setError(err?.message || 'Failed to load PDF document');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
      loadingTask.destroy();
    };
  }, [pdfUrl, onTotalPagesLoaded, onOutlineLoaded]);

  // Handle target page jump requests
  useEffect(() => {
    if (targetPageJump !== null) {
      const pageEl = document.getElementById(`pdf-page-${targetPageJump}`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onClearPageJump();
    }
  }, [targetPageJump, onClearPageJump]);

  // Helper: Parse PDF bookmarks tree
  async function parsePdfOutline(doc: PDFDocumentProxy, items: any[]): Promise<TOCItem[]> {
    const result: TOCItem[] = [];
    for (const item of items) {
      let pageNum = 1;
      try {
        if (typeof item.dest === 'string') {
          const dest = await doc.getDestination(item.dest);
          if (dest && dest[0]) {
            pageNum = (await doc.getPageIndex(dest[0])) + 1;
          }
        } else if (Array.isArray(item.dest) && item.dest[0]) {
          pageNum = (await doc.getPageIndex(item.dest[0])) + 1;
        }
      } catch {
        pageNum = 1;
      }

      let children: TOCItem[] | undefined = undefined;
      if (item.items && item.items.length > 0) {
        children = await parsePdfOutline(doc, item.items);
      }

      result.push({
        title: item.title || 'Untitled Section',
        pageNumber: pageNum,
        children,
      });
    }
    return result;
  }

  // Extract clean, human-readable text from PDF.js text layer (reconstructs spaces, line-breaks, hyphens)
  function extractCleanTextFromSelection(range: Range, pageEl: HTMLElement): string {
    const spans = Array.from(pageEl.querySelectorAll('.textLayer span')) as HTMLElement[];
    const selectedParts: { text: string; top: number; left: number; height: number; width: number }[] = [];

    for (const span of spans) {
      if (range.intersectsNode(span)) {
        const fullText = span.textContent || '';
        if (!fullText) continue;

        let start = 0;
        let end = fullText.length;

        if (range.startContainer === span.firstChild || range.startContainer === span) {
          start = range.startOffset;
        }
        if (range.endContainer === span.firstChild || range.endContainer === span) {
          end = range.endOffset;
        }

        const part = fullText.substring(start, end);
        if (part.length > 0) {
          const rect = span.getBoundingClientRect();
          selectedParts.push({
            text: part,
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
          });
        }
      }
    }

    if (selectedParts.length === 0) {
      return range.toString().replace(/\s+/g, ' ').trim();
    }

    // Sort in visual reading order: top-to-bottom (Y), then left-to-right (X)
    selectedParts.sort((a, b) => {
      const yDiff = a.top - b.top;
      if (Math.abs(yDiff) > Math.min(a.height, b.height) * 0.45) {
        return yDiff;
      }
      return a.left - b.left;
    });

    let result = '';
    for (let i = 0; i < selectedParts.length; i++) {
      const curr = selectedParts[i];
      if (i === 0) {
        result += curr.text;
        continue;
      }

      const prev = selectedParts[i - 1];
      const isNewLine = Math.abs(curr.top - prev.top) > prev.height * 0.45;

      if (isNewLine) {
        if (result.endsWith('-')) {
          result = result.slice(0, -1) + curr.text;
        } else {
          result += ' ' + curr.text;
        }
      } else {
        const gap = curr.left - (prev.left + prev.width);
        if (gap > 1.5 && !result.endsWith(' ') && !curr.text.startsWith(' ')) {
          result += ' ' + curr.text;
        } else {
          result += curr.text;
        }
      }
    }

    return result.replace(/\s+/g, ' ').trim();
  }

  // Merge same-line rects into solid lines and split disconnected highlights
  function clusterNormalizedRects(rawRects: NormalizedRect[]): NormalizedRect[][] {
    if (rawRects.length <= 1) return [rawRects];

    // Sort: top-to-bottom, left-to-right
    const sorted = [...rawRects].sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > Math.min(a.height, b.height) * 0.45) return yDiff;
      return a.x - b.x;
    });

    // Merge overlapping or adjacent rectangles on the same horizontal line
    const mergedLines: NormalizedRect[] = [];
    let currentLine = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i];
      const isSameLine = Math.abs(r.y - currentLine.y) <= Math.max(r.height, currentLine.height) * 0.45;
      const isAdjacentOrOverlapping = r.x <= (currentLine.x + currentLine.width + 0.025);

      if (isSameLine && isAdjacentOrOverlapping) {
        const newX = Math.min(currentLine.x, r.x);
        const newRight = Math.max(currentLine.x + currentLine.width, r.x + r.width);
        currentLine.x = newX;
        currentLine.width = newRight - newX;
        currentLine.height = Math.max(currentLine.height, r.height);
      } else {
        mergedLines.push(currentLine);
        currentLine = { ...r };
      }
    }
    mergedLines.push(currentLine);

    // Group connected lines into clusters:
    // If two consecutive lines have a vertical gap <= 1.4 * line height, they belong to the same block.
    // Otherwise, any disconnected highlight is separated!
    const clusters: NormalizedRect[][] = [];
    let currentCluster: NormalizedRect[] = [mergedLines[0]];

    for (let i = 1; i < mergedLines.length; i++) {
      const prev = mergedLines[i - 1];
      const curr = mergedLines[i];
      const verticalGap = curr.y - (prev.y + prev.height);

      if (verticalGap >= -0.01 && verticalGap <= prev.height * 1.4) {
        currentCluster.push(curr);
      } else {
        clusters.push(currentCluster);
        currentCluster = [curr];
      }
    }
    clusters.push(currentCluster);

    return clusters;
  }

  // Handle text selection on mouse up
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    const clientRects = range.getClientRects();
    if (clientRects.length === 0) return;

    // Find the containing page element
    let node: Node | null = range.startContainer;
    let pageEl: HTMLElement | null = null;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && node.hasAttribute('data-page-number')) {
        pageEl = node;
        break;
      }
      node = node.parentNode;
    }

    if (!pageEl) return;

    const pageNumber = parseInt(pageEl.getAttribute('data-page-number') || '1', 10);
    const pageRect = pageEl.getBoundingClientRect();

    // Extract clean human-readable text with spaces preserved
    const selectedText = extractCleanTextFromSelection(range, pageEl);
    if (!selectedText || selectedText.length < 2) {
      return;
    }

    // Calculate normalized coordinates (0.0 to 1.0)
    const rawRects: NormalizedRect[] = [];
    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      if (r.width > 2 && r.height > 2) {
        rawRects.push({
          x: (r.left - pageRect.left) / pageRect.width,
          y: (r.top - pageRect.top) / pageRect.height,
          width: r.width / pageRect.width,
          height: r.height / pageRect.height,
        });
      }
    }

    if (rawRects.length === 0) return;

    // Cluster into connected blocks (merges same-line rects & separates disconnected areas)
    const clusters = clusterNormalizedRects(rawRects);

    // Toolbar popup positioning at the top center of selection
    const firstRect = clientRects[0];
    setSelectionState({
      position: {
        top: firstRect.top - 8,
        left: firstRect.left + firstRect.width / 2,
      },
      pageNumber,
      text: selectedText,
      clusters,
    });
  }, []);

  const handleCreateHighlight = (color: string, comment?: string) => {
    if (!selectionState) return;

    // Any highlight that is not connected is treated as separate
    selectionState.clusters.forEach((clusterRects, idx) => {
      onAddAnnotation({
        pageNumber: selectionState.pageNumber,
        color,
        selectedText: selectionState.text,
        rects: clusterRects,
        commentText: idx === 0 ? comment : undefined,
      });
    });

    // Clear selection
    window.getSelection()?.removeAllRanges();
    setSelectionState(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm font-medium">Rendering PDF pages...</p>
      </div>
    );
  }

  if (error || !pdfDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-rose-500">
        <AlertCircle className="w-10 h-10" />
        <p className="text-sm font-semibold">{error || 'Could not load PDF'}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className={`flex-1 overflow-y-auto overflow-x-hidden p-4 relative ${
        theme === 'sepia'
          ? 'bg-[#f6f0e2]'
          : theme === 'dark'
          ? 'bg-gray-950'
          : 'bg-gray-100'
      }`}
    >
      {/* Floating Selection Toolbar */}
      {selectionState && (
        <SelectionToolbar
          position={selectionState.position}
          selectedText={selectionState.text}
          onHighlight={handleCreateHighlight}
          onAIDeepDive={onAIDeepDive}
          onClose={() => {
            setSelectionState(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* Pages Container */}
      <div className="flex flex-col items-center">
        {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map((pageNum) => (
          <PdfPage
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNumber={pageNum}
            scale={zoom}
            theme={theme}
            annotations={annotations.filter((a) => a.page_number === pageNum)}
            activeAnnotationId={activeAnnotationId}
            onSelectAnnotation={onSelectAnnotation}
            onPageVisible={onPageChange}
            searchQuery={searchQuery}
            isActiveSearchPage={activeSearchMatch?.pageNumber === pageNum}
            activeSearchMatchIndex={
              activeSearchMatch?.pageNumber === pageNum
                ? activeSearchMatch.matchIndex
                : null
            }
          />
        ))}
      </div>
    </div>
  );
};
