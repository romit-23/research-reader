import React, { useState, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Search, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';
import type { SearchMatch } from '../../types';

interface SearchBarProps {
  pdfDoc: PDFDocumentProxy | null;
  isOpen: boolean;
  initialQuery?: string;
  onClose: () => void;
  onJumpToPage: (pageNumber: number) => void;
  onSearchChange?: (data: {
    query: string;
    currentMatch: SearchMatch | null;
    totalMatches: number;
  }) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  pdfDoc,
  isOpen,
  initialQuery = '',
  onClose,
  onJumpToPage,
  onSearchChange,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const pageTextsCache = React.useRef<Map<number, string>>(new Map());

  // Clear cache when document changes
  useEffect(() => {
    pageTextsCache.current.clear();
  }, [pdfDoc]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMatches([]);
      setCurrentMatchIndex(0);
      onSearchChange?.({ query: '', currentMatch: null, totalMatches: 0 });
    } else if (initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    }
  }, [isOpen, initialQuery]);

  const handleSearch = async (searchTerm: string) => {
    const term = searchTerm.trim().toLowerCase();
    if (!pdfDoc || term.length < 2) {
      setMatches([]);
      setCurrentMatchIndex(0);
      onSearchChange?.({ query: '', currentMatch: null, totalMatches: 0 });
      return;
    }

    setIsSearching(true);
    const foundMatches: SearchMatch[] = [];

    try {
      const numPages = pdfDoc.numPages;
      let globalIdx = 0;

      for (let i = 1; i <= numPages; i++) {
        let pageText = pageTextsCache.current.get(i);
        if (!pageText) {
          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          pageText = '';
          for (let j = 0; j < textContent.items.length; j++) {
            const item = textContent.items[j] as any;
            const str = item.str || '';
            if (!str) continue;
            if (pageText.length > 0 && !pageText.endsWith(' ') && !str.startsWith(' ')) {
              pageText += ' ' + str;
            } else {
              pageText += str;
            }
          }
          pageTextsCache.current.set(i, pageText);
        }

        const lowerPage = pageText.toLowerCase();
        let startIndex = 0;
        let matchIdxOnPage = 0;

        while ((startIndex = lowerPage.indexOf(term, startIndex)) !== -1) {
          const contextStart = Math.max(0, startIndex - 20);
          const contextEnd = Math.min(pageText.length, startIndex + term.length + 30);
          const snippet = pageText.substring(contextStart, contextEnd);

          foundMatches.push({
            pageNumber: i,
            matchIndex: matchIdxOnPage++,
            globalIndex: globalIdx++,
            contextText: snippet,
          });
          startIndex += term.length;
        }
      }

      setMatches(foundMatches);
      setCurrentMatchIndex(0);

      if (foundMatches.length > 0) {
        onSearchChange?.({
          query: searchTerm,
          currentMatch: foundMatches[0],
          totalMatches: foundMatches.length,
        });
        onJumpToPage(foundMatches[0].pageNumber);
      } else {
        onSearchChange?.({
          query: searchTerm,
          currentMatch: null,
          totalMatches: 0,
        });
      }
    } catch (err) {
      console.error('Error executing search:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    const match = matches[nextIdx];
    onSearchChange?.({
      query,
      currentMatch: match,
      totalMatches: matches.length,
    });
    onJumpToPage(match.pageNumber);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    const match = matches[prevIdx];
    onSearchChange?.({
      query,
      currentMatch: match,
      totalMatches: matches.length,
    });
    onJumpToPage(match.pageNumber);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-16 right-6 z-30 flex items-center gap-2 bg-white dark:bg-gray-900 px-3 py-2 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2 duration-150">
      <Search className="w-4 h-4 text-gray-400" />
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => {
          const val = e.target.value;
          setQuery(val);
          if (val.trim().length >= 2) {
            handleSearch(val);
          } else {
            setMatches([]);
            setCurrentMatchIndex(0);
            onSearchChange?.({ query: '', currentMatch: null, totalMatches: 0 });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (e.shiftKey) handlePrev();
            else handleNext();
          } else if (e.key === 'Escape') {
            onClose();
          }
        }}
        placeholder="Find in document..."
        className="w-48 text-xs bg-transparent border-none focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
      />

      {isSearching ? (
        <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
      ) : matches.length > 0 ? (
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {currentMatchIndex + 1} of {matches.length}
        </span>
      ) : query.trim().length >= 2 ? (
        <span className="text-[11px] text-gray-400 whitespace-nowrap">0 results</span>
      ) : null}

      <div className="flex items-center gap-0.5 border-l border-gray-200 dark:border-gray-700 pl-1.5">
        <button
          onClick={handlePrev}
          disabled={matches.length === 0}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition"
          title="Previous Match (Shift+Enter)"
        >
          <ChevronUp className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={handleNext}
          disabled={matches.length === 0}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition"
          title="Next Match (Enter)"
        >
          <ChevronDown className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition ml-1"
          title="Close Search (Esc)"
        >
          <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
        </button>
      </div>
    </div>
  );
};
