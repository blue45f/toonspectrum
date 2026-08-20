import React, { type KeyboardEvent, useRef } from "react";

import {
  STUDIO_SUB_TOOL_PALETTE_CATEGORIES,
  type StudioSubToolPaletteCategory,
} from "./studio-sub-tool-palette-data";

export interface StudioSubToolPaletteProps {
  activeCategory: string;
  activeSubToolId: string;
  onSelectSubTool: (subToolId: string) => void;
  onCategoryChange?: (category: string) => void;
  /** Data injection seam for tests; defaults to the real core-catalogue mapping. */
  categories?: readonly StudioSubToolPaletteCategory[];
  className?: string;
}

export const StudioSubToolPalette: React.FC<StudioSubToolPaletteProps> = ({
  activeCategory,
  activeSubToolId,
  onSelectSubTool,
  onCategoryChange,
  categories = STUDIO_SUB_TOOL_PALETTE_CATEGORIES,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTools =
    categories.find((category) => category.id === activeCategory)?.tools ?? [];

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (index + 1) % currentTools.length;
      focusItem(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (index - 1 + currentTools.length) % currentTools.length;
      focusItem(prev);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectSubTool(currentTools[index].id);
    }
  };

  const focusItem = (index: number) => {
    if (containerRef.current) {
      const items = containerRef.current.querySelectorAll('[role="option"]');
      if (items[index]) {
        (items[index] as HTMLElement).focus();
      }
    }
  };

  return (
    <div className={`flex flex-col rounded-md border border-line bg-card text-fg-2 ${className}`}>
      <div role="tablist" aria-label="서브 도구 분류" className="flex overflow-x-auto border-b border-line">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryChange?.(cat.id)}
            className={`px-3 py-2 text-xs flex-shrink-0 transition-colors ${
              activeCategory === cat.id ? 'bg-raised text-fg font-medium' : 'hover:bg-raised text-fg-3'
            }`}
            aria-selected={activeCategory === cat.id}
            role="tab"
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        role="listbox"
        aria-label="서브 도구"
        className="flex flex-col p-2 space-y-1 overflow-y-auto max-h-80"
      >
        {currentTools.map((tool, index) => {
          const isActive = activeSubToolId === tool.id;
          return (
            <div
              key={tool.id}
              role="option"
              aria-selected={isActive}
              tabIndex={isActive || (index === 0 && !currentTools.find(t => t.id === activeSubToolId)) ? 0 : -1}
              onClick={() => onSelectSubTool(tool.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`flex items-center justify-between p-2 rounded cursor-pointer select-none transition-colors outline-none
                ${isActive
                  ? 'bg-accent-soft/60 text-accent ring-1 ring-accent/60'
                  : 'hover:bg-raised focus:bg-raised focus:ring-1 focus:ring-line-strong'
                }
              `}
            >
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{tool.name}</span>
              </div>
              {tool.shortcut && (
                <span className="text-[10px] bg-raised text-fg-3 px-1.5 py-0.5 rounded border border-line">
                  {tool.shortcut}
                </span>
              )}
            </div>
          );
        })}
        {currentTools.length === 0 && (
          <div className="p-4 text-center text-sm text-fg-3">
            도구가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
};
