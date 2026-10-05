import React from 'react';
import type { TOCItem } from '../../types';
import { Bookmark, ChevronRight, FileText } from 'lucide-react';

interface OutlineViewProps {
  items: TOCItem[];
  onJumpToPage: (pageNumber: number) => void;
}

const OutlineNode: React.FC<{
  item: TOCItem;
  level: number;
  onJumpToPage: (pageNumber: number) => void;
}> = ({ item, level, onJumpToPage }) => {
  return (
    <div className="flex flex-col">
      <button
        onClick={() => onJumpToPage(item.pageNumber)}
        style={{ paddingLeft: `${Math.max(8, level * 16)}px` }}
        className="flex items-center justify-between py-1.5 pr-2 rounded-lg text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition group"
      >
        <div className="flex items-center gap-1.5 truncate">
          {item.children && item.children.length > 0 ? (
            <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-indigo-500 transition-transform" />
          ) : (
            <span className="w-3 h-3 flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-gray-400" />
            </span>
          )}
          <span className="truncate font-medium">{item.title}</span>
        </div>
        <span className="text-[10px] font-mono text-gray-400 ml-2">p.{item.pageNumber}</span>
      </button>

      {item.children && item.children.length > 0 && (
        <div className="flex flex-col border-l border-gray-100 dark:border-gray-800 ml-3">
          {item.children.map((child, idx) => (
            <OutlineNode
              key={idx}
              item={child}
              level={level + 1}
              onJumpToPage={onJumpToPage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const OutlineView: React.FC<OutlineViewProps> = ({ items, onJumpToPage }) => {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
        <Bookmark className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">No Outline Found</h4>
        <p className="text-xs text-gray-400 max-w-xs mt-1">
          This document does not contain native bookmarks or table of contents metadata.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        <FileText className="w-3.5 h-3.5" />
        <span>Table of Contents</span>
      </div>
      {items.map((item, idx) => (
        <OutlineNode
          key={idx}
          item={item}
          level={0}
          onJumpToPage={onJumpToPage}
        />
      ))}
    </div>
  );
};
