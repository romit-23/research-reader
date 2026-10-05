import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { pdfjsLib } from '../../utils/pdfWorker';
import type { ParsedAnnotation, ReadingTheme } from '../../types';
import { HighlightLayer } from './HighlightLayer';
import { SearchHighlightLayer } from './SearchHighlightLayer';
import { findMatchesInTextLayer, type PageSearchMatch } from '../../utils/searchHighlight';

interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  theme: ReadingTheme;
  annotations: ParsedAnnotation[];
  activeAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
  onPageVisible: (pageNumber: number) => void;
  searchQuery?: string;
  isActiveSearchPage?: boolean;
  activeSearchMatchIndex?: number | null;
}

export const PdfPage: React.FC<PdfPageProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  theme,
  annotations,
  activeAnnotationId,
  onSelectAnnotation,
  onPageVisible,
  searchQuery,
  isActiveSearchPage,
  activeSearchMatchIndex,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [rendered, setRendered] = useState(false);
  const [searchMatches, setSearchMatches] = useState<PageSearchMatch[]>([]);

  // IntersectionObserver for tracking current page in view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
            onPageVisible(pageNumber);
          }
        });
      },
      { threshold: [0.1, 0.4, 0.8] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  // Render canvas and textLayer
  useEffect(() => {
    let isCancelled = false;
    let renderTask: any = null;

    async function renderPage() {
      try {
        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        setPageSize({ width: viewport.width, height: viewport.height });

        // Setup canvas with high DPI backing store
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;
        if (isCancelled) return;

        // Render text layer for selection and search
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          textLayerDiv.style.setProperty('--scale-factor', `${viewport.scale}`);

          const textContent = await page.getTextContent();
          if (isCancelled) return;

          // Use pdfjsLib renderTextLayer and await completion
          if ((pdfjsLib as any).renderTextLayer) {
            const textLayerTask = (pdfjsLib as any).renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport,
              textDivs: [],
            });
            await textLayerTask.promise;
          }
        }

        setRendered(true);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  // Compute search match bounding rects in rendered textLayer
  useEffect(() => {
    if (!rendered || !searchQuery || searchQuery.trim().length < 2) {
      setSearchMatches([]);
      return;
    }

    const textLayerDiv = textLayerRef.current;
    const pageEl = containerRef.current;
    if (!textLayerDiv || !pageEl) {
      setSearchMatches([]);
      return;
    }

    const matches = findMatchesInTextLayer(textLayerDiv, pageEl, searchQuery);
    setSearchMatches(matches);
  }, [rendered, searchQuery, scale]);

  // Smooth scroll active search match into center of viewport
  useEffect(() => {
    if (isActiveSearchPage && activeSearchMatchIndex !== null && searchMatches.length > 0) {
      const timer = setTimeout(() => {
        const activeEl = document.getElementById('search-active-match');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActiveSearchPage, activeSearchMatchIndex, searchMatches]);

  // Smooth scroll active highlight into center of viewport
  useEffect(() => {
    if (rendered && activeAnnotationId) {
      const hasAnnotation = annotations.some((a) => a.id === activeAnnotationId);
      if (hasAnnotation) {
        const timer = setTimeout(() => {
          const activeEl = document.getElementById(`pdf-highlight-${activeAnnotationId}`);
          if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [rendered, activeAnnotationId, annotations]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      data-page-number={pageNumber}
      className={`relative mx-auto my-4 transition-shadow duration-200 pdf-canvas-container ${
        theme === 'sepia' ? 'bg-[#f4ecd8] shadow-md border border-[#dfd2ba]' : 'bg-white shadow-lg dark:bg-gray-800'
      } rounded-sm overflow-hidden`}
      style={{
        width: pageSize.width || '100%',
        minHeight: pageSize.height || 600,
      }}
    >
      {/* 1. Canvas Rendering Layer (bottom) */}
      <canvas ref={canvasRef} className="block select-none relative z-[1]" />

      {/* 2. Annotations & User Highlights Overlay Layer (middle) */}
      {rendered && (
        <HighlightLayer
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          onSelectAnnotation={onSelectAnnotation}
        />
      )}

      {/* 2.5 In-document Search Blue Selection Highlights */}
      {rendered && searchMatches.length > 0 && (
        <SearchHighlightLayer
          matches={searchMatches}
          activeMatchIndex={isActiveSearchPage ? activeSearchMatchIndex ?? null : null}
          theme={theme}
        />
      )}

      {/* 3. PDF.js Selectable Text Layer (top: smooth, frictionless selection like Word) */}
      <div ref={textLayerRef} className="textLayer" />

      {/* Page number badge */}
      <div className="absolute bottom-2 right-3 text-[10px] font-mono text-gray-400 select-none pointer-events-none opacity-50">
        p. {pageNumber}
      </div>
    </div>
  );
};
