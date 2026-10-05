import React from 'react';
import { FileEdit, Highlighter, ListTree, Sparkles } from 'lucide-react';
import type { ParsedAnnotation, TOCItem, AISettings } from '../../types';
import { MarkdownNotepad } from './MarkdownNotepad';
import { AnnotationsList } from './AnnotationsList';
import { OutlineView } from './OutlineView';
import { AIDeepDivePanel } from './AIDeepDivePanel';

export type SidebarTab = 'notes' | 'annotations' | 'outline' | 'ai';

interface SidebarTabsProps {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  notesContent: string;
  annotations: ParsedAnnotation[];
  activeAnnotationId: string | null;
  outline: TOCItem[];
  aiQuery: string;
  aiMode?: string;
  documentId?: string | null;
  currentPage?: number;
  aiSettings?: AISettings;
  onOpenAISettings?: () => void;
  onSaveNotes: (content: string) => Promise<void>;
  onJumpToPage: (pageNumber: number) => void;
  onJumpToAnnotation: (pageNumber: number, annotationId: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onUpdateComment?: (id: string, comment: string) => void;
  onAppendToNotes: (markdownSnippet: string) => void;
  onSearchInDoc?: (searchTerm: string) => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({
  activeTab,
  onChangeTab,
  notesContent,
  annotations,
  activeAnnotationId,
  outline,
  aiQuery,
  aiMode = 'explain',
  documentId,
  currentPage,
  aiSettings,
  onOpenAISettings,
  onSaveNotes,
  onJumpToPage,
  onJumpToAnnotation,
  onDeleteAnnotation,
  onUpdateComment,
  onAppendToNotes,
  onSearchInDoc,
}) => {
  return (
    <aside className="w-96 md:w-[420px] lg:w-[460px] h-full flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg z-10 min-w-0 overflow-hidden">
      {/* Top Tab Switcher */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-800 px-2 pt-2 bg-gray-50/70 dark:bg-gray-900/70 overflow-x-hidden min-w-0">
        <button
          onClick={() => onChangeTab('notes')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'notes'
              ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-gray-900 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <FileEdit className="w-3.5 h-3.5" />
          <span>Notes</span>
        </button>

        <button
          onClick={() => onChangeTab('annotations')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'annotations'
              ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-gray-900 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <Highlighter className="w-3.5 h-3.5" />
          <span>Highlights</span>
          {annotations.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              {annotations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => onChangeTab('outline')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'outline'
              ? 'border-indigo-600 text-indigo-600 bg-white dark:bg-gray-900 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          <span>TOC</span>
        </button>

        <button
          onClick={() => onChangeTab('ai')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
            activeTab === 'ai'
              ? 'border-purple-600 text-purple-600 bg-white dark:bg-gray-900 dark:text-purple-400'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>AI Research</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeTab === 'notes' && (
          <MarkdownNotepad
            key={documentId}
            initialContent={notesContent}
            annotations={annotations}
            onSaveNotes={onSaveNotes}
            onJumpToAnnotation={onJumpToAnnotation}
          />
        )}

        {activeTab === 'annotations' && (
          <AnnotationsList
            annotations={annotations}
            activeAnnotationId={activeAnnotationId}
            onJumpToAnnotation={onJumpToAnnotation}
            onDeleteAnnotation={onDeleteAnnotation}
            onUpdateComment={onUpdateComment}
          />
        )}

        {activeTab === 'outline' && (
          <OutlineView
            items={outline}
            onJumpToPage={onJumpToPage}
          />
        )}

        {activeTab === 'ai' && (
          <AIDeepDivePanel
            initialQuery={aiQuery}
            initialMode={aiMode}
            documentId={documentId}
            currentPage={currentPage}
            onAppendToNotes={onAppendToNotes}
            onJumpToPage={onJumpToPage}
            onSearchInDoc={onSearchInDoc}
            onOpenSettings={onOpenAISettings}
            aiSettings={aiSettings}
          />
        )}
      </div>
    </aside>
  );
};
