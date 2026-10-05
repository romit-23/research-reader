import React from 'react';
import type { ReadingTheme } from '../../types';
import type { PageSearchMatch } from '../../utils/searchHighlight';

interface SearchHighlightLayerProps {
  matches: PageSearchMatch[];
  activeMatchIndex: number | null;
  theme: ReadingTheme;
}

export const SearchHighlightLayer: React.FC<SearchHighlightLayerProps> = ({
  matches,
  activeMatchIndex,
  theme,
}) => {
  if (!matches || matches.length === 0) return null;

  const isDark = theme === 'dark';

  return (
    <div className="absolute inset-0 pointer-events-none z-[4]">
      {matches.map((match) => {
        const isActive = activeMatchIndex !== null && match.matchIndex === activeMatchIndex;

        return (
          <div
            key={match.matchIndex}
            id={isActive ? 'search-active-match' : undefined}
            className="contents"
          >
            {match.rects.map((rect, rIdx) => (
              <div
                key={rIdx}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(96, 165, 250, 0.70)'
                      : 'rgba(37, 99, 235, 0.65)'
                    : isDark
                    ? 'rgba(59, 130, 246, 0.35)'
                    : 'rgba(59, 130, 246, 0.32)',
                  boxShadow: isActive
                    ? isDark
                      ? '0 0 0 1.5px #60a5fa, 0 0 10px rgba(96, 165, 250, 0.6)'
                      : '0 0 0 1.5px #2563eb, 0 0 10px rgba(37, 99, 235, 0.5)'
                    : '0 0 0 0.5px rgba(59, 130, 246, 0.25)',
                  mixBlendMode: isDark ? 'screen' : 'multiply',
                }}
                className={`absolute pointer-events-none rounded-[2px] transition-all duration-150 ${
                  isActive ? 'search-active-pulse ring-1 ring-blue-600' : ''
                }`}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};
