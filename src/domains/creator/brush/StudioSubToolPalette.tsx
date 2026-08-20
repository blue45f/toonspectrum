import React, { type KeyboardEvent, useRef } from "react";

export interface StudioSubToolPaletteProps {
  activeCategory: string;
  activeSubToolId: string;
  onSelectSubTool: (subToolId: string) => void;
  onCategoryChange?: (category: string) => void;
  className?: string;
}

const SUB_TOOLS = {
  pen: [
    { id: 'pen-g', name: 'G펜', shortcut: 'P' },
    { id: 'pen-real-g', name: '리얼 G펜' },
    { id: 'pen-maru', name: '스푼/마루펜' },
    { id: 'pen-calligraphy', name: '캘리그래피' },
    { id: 'pen-mapping', name: '증권용 펜' },
  ],
  pencil: [
    { id: 'pencil-design', name: '디자인 연필', shortcut: 'P' },
    { id: 'pencil-rough', name: '러프 연필' },
    { id: 'pencil-dark', name: '진한 연필' },
    { id: 'pencil-colored', name: '색연필' },
  ],
  brush: [
    { id: 'brush-watercolor', name: '부드러운 수채', shortcut: 'B' },
    { id: 'brush-thick', name: '유채/두꺼운 칠' },
    { id: 'brush-dry', name: '먹물 붓' },
    { id: 'brush-oil', name: '오일 페인트' },
  ],
  airbrush: [
    { id: 'airbrush-soft', name: '부드러움', shortcut: 'B' },
    { id: 'airbrush-hard', name: '단단함' },
    { id: 'airbrush-highlight', name: '하이라이트' },
    { id: 'airbrush-spray', name: '스프레이/비말' },
  ],
  eraser: [
    { id: 'eraser-hard', name: '딱딱함', shortcut: 'E' },
    { id: 'eraser-soft', name: '부드러움' },
    { id: 'eraser-kneaded', name: '떡지우개' },
    { id: 'eraser-vector', name: '벡터선 교차 지우개' },
  ],
  manga: [
    { id: 'manga-focus', name: '방사 집중선', shortcut: 'U' },
    { id: 'manga-speed', name: '평행 속도선' },
    { id: 'manga-tone', name: '망점 스크린톤' },
  ],
};

const CATEGORIES = [
  { id: 'pen', label: '펜' },
  { id: 'pencil', label: '연필' },
  { id: 'brush', label: '붓' },
  { id: 'airbrush', label: '에어브러시' },
  { id: 'eraser', label: '지우개' },
  { id: 'manga', label: '만화' },
];

export const StudioSubToolPalette: React.FC<StudioSubToolPaletteProps> = ({
  activeCategory,
  activeSubToolId,
  onSelectSubTool,
  onCategoryChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTools = SUB_TOOLS[activeCategory as keyof typeof SUB_TOOLS] || [];

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
    <div className={`flex flex-col bg-neutral-900 text-neutral-300 rounded-md border border-neutral-700 w-64 ${className}`}>
      <div className="flex border-b border-neutral-700 overflow-x-auto hide-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange?.(cat.id)}
            className={`px-3 py-2 text-xs flex-shrink-0 transition-colors ${
              activeCategory === cat.id ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800 text-neutral-400'
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
        aria-label="Sub tools"
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
                  ? 'bg-blue-600 text-white ring-1 ring-blue-400 ring-offset-1 ring-offset-neutral-900' 
                  : 'hover:bg-neutral-800 focus:bg-neutral-800 focus:ring-1 focus:ring-neutral-500'
                }
              `}
            >
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{tool.name}</span>
              </div>
              {tool.shortcut && (
                <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">
                  {tool.shortcut}
                </span>
              )}
            </div>
          );
        })}
        {currentTools.length === 0 && (
          <div className="p-4 text-center text-sm text-neutral-500">
            도구가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
};
