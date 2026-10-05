import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Globe,
  Check,
  X,
  BookMarked,
} from 'lucide-react';

interface SelectionToolbarProps {
  position: { top: number; left: number };
  selectedText: string;
  onHighlight: (color: string, comment?: string) => void;
  onAIDeepDive: (text: string, mode?: string) => void;
  onClose: () => void;
}

const PALETTE = [
  { name: 'Yellow', hex: '#fef08a', border: '#eab308' },
  { name: 'Green', hex: '#bbf7d0', border: '#22c55e' },
  { name: 'Blue', hex: '#bfdbfe', border: '#3b82f6' },
  { name: 'Purple', hex: '#e9d5ff', border: '#a855f7' },
  { name: 'Pink', hex: '#fbcfe8', border: '#ec4899' },
  { name: 'Orange', hex: '#fed7aa', border: '#f97316' },
];

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  position,
  selectedText,
  onHighlight,
  onAIDeepDive,
  onClose,
}) => {
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedColor, setSelectedColor] = useState(PALETTE[0].hex);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleGoogleSearch = () => {
    const query = encodeURIComponent(selectedText.trim());
    window.open(`https://www.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleSaveWithComment = () => {
    onHighlight(selectedColor, comment.trim() || undefined);
    onClose();
  };

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 transform -translate-x-1/2 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 animate-in fade-in zoom-in-95 duration-150"
      style={{
        top: `${Math.max(10, position.top - (showCommentInput ? 160 : 60))}px`,
        left: `${Math.min(window.innerWidth - 180, Math.max(180, position.left))}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        {/* Colors Palette */}
        <div className="flex items-center gap-1 pr-1 border-r border-gray-200 dark:border-gray-700">
          {PALETTE.map((c) => (
            <button
              key={c.hex}
              onClick={() => {
                if (showCommentInput) {
                  setSelectedColor(c.hex);
                } else {
                  onHighlight(c.hex);
                  onClose();
                }
              }}
              style={{ backgroundColor: c.hex, borderColor: c.border }}
              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center ${
                selectedColor === c.hex && showCommentInput ? 'ring-2 ring-offset-1 ring-indigo-500' : ''
              }`}
              title={`Highlight with ${c.name}`}
            >
              {selectedColor === c.hex && showCommentInput && (
                <Check className="w-3.5 h-3.5 text-gray-800" />
              )}
            </button>
          ))}
        </div>

        {/* Take Note / Comment Button (like Word) */}
        <button
          onClick={() => setShowCommentInput(!showCommentInput)}
          className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
            showCommentInput
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800'
          }`}
          title="Take a note on this text (like in Word)"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Note</span>
        </button>

        {/* Google Search (USP 1) */}
        <button
          onClick={handleGoogleSearch}
          className="px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-600 transition border border-gray-200 dark:border-gray-700"
          title={`Google Search: "${selectedText.slice(0, 40)}${selectedText.length > 40 ? '...' : ''}"`}
        >
          <Globe className="w-3.5 h-3.5 text-blue-500" />
          <span>Google</span>
        </button>

        {/* In-Paper Contextual Definition (USP) */}
        <button
          onClick={() => {
            onAIDeepDive(selectedText, 'define');
            onClose();
          }}
          className="px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-800 shadow-sm transition"
          title={`Find authors' in-paper definition for "${selectedText.slice(0, 30)}..."`}
        >
          <BookMarked className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Define</span>
        </button>

        {/* AI Deep Dive (USP 2) */}
        <button
          onClick={() => {
            onAIDeepDive(selectedText, 'explain');
            onClose();
          }}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm transition"
          title="Analyze concept with AI"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Deep Dive</span>
        </button>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Word-like Inline Note / Comment Composer */}
      {showCommentInput && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
          <div className="text-[11px] text-gray-500 truncate max-w-sm italic">
            "{selectedText.slice(0, 60)}{selectedText.length > 60 ? '...' : ''}"
          </div>
          <textarea
            autoFocus
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Type your note here... (Press Enter to save, Shift+Enter for new line)"
            className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveWithComment();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Enter to save</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowCommentInput(false)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWithComment}
                className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm transition"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
