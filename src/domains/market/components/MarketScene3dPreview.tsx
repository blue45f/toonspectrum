import { Box, Camera, Sun } from "lucide-react";

import type { RecipePreviewData } from "../models/market-preview";

interface MarketScene3dPreviewProps {
  readonly recipe: RecipePreviewData;
  className?: string;
}

export function MarketScene3dPreview({ recipe, className }: MarketScene3dPreviewProps) {
  return (
    <div
      role="region"
      aria-labelledby="market-3d-heading"
      aria-describedby="market-3d-preview-note"
      className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-panel/50">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 id="market-3d-heading" className="text-xs font-semibold text-fg">3D 프리셋 참고 일러스트 ({recipe.name})</h3>
        </div>
        <span className="inline-flex min-h-6 items-center rounded bg-raised px-2 text-[0.65rem] text-fg-3">
          레시피: {recipe.recipeId}
        </span>
      </div>

      <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-raised via-canvas to-panel p-6">
        {/* Isometric 3D Room / Camera Mockup SVG */}
        <svg aria-hidden="true" className="h-full w-full max-w-[340px]" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wallLeft" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#1e293b" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="wallRight" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#334155" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="floor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Floor grid */}
          <polygon points="200,160 360,230 200,295 40,230" fill="url(#floor)" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="120" y1="195" x2="280" y2="262" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.3" />
          <line x1="280" y1="195" x2="120" y2="262" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.3" />

          {/* Left Wall */}
          <polygon points="40,90 200,20 200,160 40,230" fill="url(#wallLeft)" stroke="#475569" strokeWidth="1" />
          {/* Right Wall */}
          <polygon points="200,20 360,90 360,230 200,160" fill="url(#wallRight)" stroke="#475569" strokeWidth="1" />

          {/* 3D Prop Object (Desk / Block) */}
          <polygon points="180,180 230,158 260,172 210,194" fill="#f59e0b" opacity="0.8" />
          <polygon points="180,180 210,194 210,218 180,204" fill="#d97706" opacity="0.9" />
          <polygon points="210,194 260,172 260,196 210,218" fill="#b45309" opacity="0.9" />

          {/* Camera Visualizer Cones */}
          <circle cx="80" cy="250" r="10" fill="#3b82f6" opacity="0.9" />
          <polygon points="80,250 160,180 210,210" fill="#3b82f6" opacity="0.15" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3,3" />
        </svg>

        <div className="absolute bottom-3 left-3 flex min-h-6 items-center gap-2 rounded bg-canvas px-2 text-[0.65rem] text-fg shadow-sm">
          <Camera className="h-3 w-3 text-accent" aria-hidden="true" />
          <span>구도 예시</span>
        </div>
        <div className="absolute bottom-3 right-3 flex min-h-6 items-center gap-2 rounded bg-canvas px-2 text-[0.65rem] text-fg shadow-sm">
          <Sun className="h-3 w-3 text-warn" aria-hidden="true" />
          <span>조명 예시</span>
        </div>
      </div>

      <p id="market-3d-preview-note" className="border-t border-line bg-panel/30 px-4 py-2 text-[0.68rem] leading-relaxed text-fg-3">
        레시피 메타데이터를 설명하기 위한 단순화된 일러스트이며 실제 Studio 렌더 결과가 아닙니다.
      </p>
    </div>
  );
}
