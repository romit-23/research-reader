import React from 'react';
import type { ParsedAnnotation } from '../../types';
import { MessageSquare } from 'lucide-react';

interface HighlightLayerProps {
  annotations: ParsedAnnotation[];
  activeAnnotationId: string | null;
  onSelectAnnotation: (id: string) => void;
}

export const HighlightLayer: React.FC<HighlightLayerProps> = ({
  annotations,
  activeAnnotationId,
  onSelectAnnotation,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-[3]">
      {annotations.map((ann) => {
        const isActive = activeAnnotationId === ann.id;
        return (
          <div key={ann.id} data-annotation-id={ann.id} className="contents">
            {ann.rects.map((rect, idx) => {
              const isFirstRect = idx === 0;
              return (
                <div
                  key={idx}
                  id={isFirstRect ? `pdf-highlight-${ann.id}` : undefined}
                  title={ann.comment_text ? `Note: ${ann.comment_text}` : ann.selected_text}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                    backgroundColor: ann.color,
                    opacity: isActive ? 0.85 : 0.55,
                    mixBlendMode: 'multiply',
                  }}
                  className={`absolute pointer-events-none transition-all duration-200 rounded-[2px] ${
                    isActive ? 'highlight-pulse ring-2 ring-indigo-500' : ''
                  }`}
                >
                  {/* Note badge on first rect if comment exists - clickable to view/focus note */}
                  {isFirstRect && ann.comment_text && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAnnotation(ann.id);
                      }}
                      className="absolute -top-3 -right-1 bg-indigo-600 text-white p-0.5 rounded-full shadow-md pointer-events-auto hover:scale-125 transition-transform z-10"
                      style={{ fontSize: '9px' }}
                      title={`View Note: ${ann.comment_text}`}
                    >
                      <MessageSquare className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
