import React, { useState } from 'react';
import type { ParsedAnnotation } from '../../types';
import {
  MessageSquare,
  Trash2,
  ExternalLink,
  Edit2,
  Check,
  X,
  Highlighter
} from 'lucide-react';

interface AnnotationsListProps {
  annotations: ParsedAnnotation[];
  activeAnnotationId: string | null;
  onJumpToAnnotation: (pageNumber: number, annotationId: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateComment?: (id: string, comment: string) => void;
}

export const AnnotationsList: React.FC<AnnotationsListProps> = ({
  annotations,
  activeAnnotationId,
  onJumpToAnnotation,
  onDeleteAnnotation,
  onUpdateComment,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  const handleStartEdit = (ann: ParsedAnnotation) => {
    setEditingId(ann.id);
    setEditCommentText(ann.comment_text || '');
  };

  const handleSaveEdit = (id: string) => {
    if (onUpdateComment) {
      onUpdateComment(id, editCommentText);
    }
    setEditingId(null);
  };

  if (annotations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
          <Highlighter className="w-6 h-6 text-gray-400" />
        </div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">No Highlights Yet</h4>
        <p className="text-xs text-gray-500 max-w-xs mt-1">
          Select any text in the PDF to highlight in color, add comments, or dive deep with AI & Google search.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {annotations.map((ann) => {
        const isActive = activeAnnotationId === ann.id;
        const isEditing = editingId === ann.id;

        return (
          <div
            key={ann.id}
            id={`sidebar-annotation-${ann.id}`}
            onClick={() => onJumpToAnnotation(ann.page_number, ann.id)}
            className={`group p-3 rounded-xl border transition-all cursor-pointer ${
              isActive
                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm ring-1 ring-indigo-400'
                : 'bg-white dark:bg-gray-800/80 border-gray-200 dark:border-gray-700/80 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {/* Header: Page & Color & Actions */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full border border-black/10 shadow-sm"
                  style={{ backgroundColor: ann.color }}
                />
                <span className="text-xs font-semibold font-mono text-gray-600 dark:text-gray-300">
                  Page {ann.page_number}
                </span>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(ann);
                  }}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700"
                  title="Edit comment"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAnnotation(ann.id);
                  }}
                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-gray-400 hover:text-rose-600"
                  title="Delete highlight"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onJumpToAnnotation(ann.page_number, ann.id)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-indigo-600"
                  title="Jump to location"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Selected Quote */}
            <blockquote className="text-xs text-gray-700 dark:text-gray-300 border-l-2 pl-2 italic line-clamp-3 mb-2" style={{ borderColor: ann.color }}>
              "{ann.selected_text}"
            </blockquote>

            {/* Comment / Note */}
            {isEditing ? (
              <div className="mt-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                <textarea
                  autoFocus
                  rows={2}
                  value={editCommentText}
                  onChange={(e) => setEditCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit(ann.id);
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  placeholder="Add or update your note... (Press Enter to save, Shift+Enter for new line)"
                  className="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Enter to save</span>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-500 text-xs flex items-center"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleSaveEdit(ann.id)}
                      className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-0.5 transition"
                    >
                      <Check className="w-3 h-3" /> Save
                    </button>
                  </div>
                </div>
              </div>
            ) : ann.comment_text ? (
              <div className="flex items-start gap-1.5 mt-1 pt-1.5 border-t border-gray-100 dark:border-gray-700/60 text-xs text-indigo-900 dark:text-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/30 p-1.5 rounded-lg">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <span className="font-medium">{ann.comment_text}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
