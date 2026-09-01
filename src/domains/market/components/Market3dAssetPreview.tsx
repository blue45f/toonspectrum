import { Box, Layers, Move3d, RotateCw } from "lucide-react";

import type { RecipePreviewData } from "../models/market-preview";

interface Market3dAssetPreviewProps {
  readonly recipe: RecipePreviewData;
  className?: string;
}

/**
 * 3D 에셋 리소스의 웹 미리보기. Studio의 Three.js 씬 대신 아이소메트릭 와이어프레임과
 * 에셋 메타데이터를 렌더링해 웹 브라우저에서 3D 에셋 구성을 직관적으로 보여준다.
 */
export function Market3dAssetPreview({ recipe, className }: Market3dAssetPreviewProps) {
  return (
    <div
      role="region"
      aria-labelledby="market-3d-asset-heading"
      aria-describedby="market-3d-asset-preview-note"
      className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel/50 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Box className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <h2 id="market-3d-asset-heading" className="min-w-0 break-words text-xs font-semibold text-fg">3D 에셋 미리보기 ({recipe.name})</h2>
        </div>
        <span className="inline-flex min-h-6 min-w-0 max-w-full items-center break-all rounded bg-raised px-2 text-[0.65rem] text-fg-3">
          레시피: {recipe.recipeId}
        </span>
      </div>

      <div className="relative flex aspect-[16/9] w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-raised via-canvas to-panel p-6">
        {/* 3D Asset Isometric Wireframe Preview */}
        <svg aria-hidden="true" className="h-full w-full max-w-[340px]" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="assetFloor" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="assetBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Floor Grid */}
          <polygon points="200,220 340,270 200,280 60,270" fill="url(#assetFloor)" stroke="#14b8a6" strokeWidth="1" strokeOpacity="0.3" />
          <line x1="130" y1="245" x2="270" y2="275" stroke="#2dd4bf" strokeWidth="0.6" strokeOpacity="0.2" />
          <line x1="270" y1="245" x2="130" y2="275" stroke="#2dd4bf" strokeWidth="0.6" strokeOpacity="0.2" />

          {/* Main 3D Object — Humanoid placeholder (head + torso + arms) */}
          {/* Head (sphere) */}
          <ellipse cx="200" cy="85" rx="22" ry="20" fill="none" stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.7" />
          <ellipse cx="200" cy="85" rx="22" ry="8" fill="none" stroke="#2dd4bf" strokeWidth="1" strokeOpacity="0.35" />

          {/* Neck */}
          <line x1="200" y1="105" x2="200" y2="120" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.6" />

          {/* Torso */}
          <polygon points="175,120 225,120 230,185 170,185" fill="url(#assetBody)" stroke="#2dd4bf" strokeWidth="1.5" />

          {/* Arms */}
          <line x1="175" y1="125" x2="145" y2="165" stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.6" />
          <line x1="145" y1="165" x2="150" y2="200" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="225" y1="125" x2="255" y2="165" stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.6" />
          <line x1="255" y1="165" x2="250" y2="200" stroke="#2dd4bf" strokeWidth="1.5" strokeOpacity="0.5" />

          {/* Legs */}
          <line x1="185" y1="185" x2="180" y2="235" stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.6" />
          <line x1="215" y1="185" x2="220" y2="235" stroke="#2dd4bf" strokeWidth="1.8" strokeOpacity="0.6" />

          {/* Rotation indicator arc */}
          <path
            d="M 290 130 A 50 50 0 0 1 290 180"
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="1"
            strokeOpacity="0.3"
            strokeDasharray="4,3"
          />
          <polygon points="288,180 292,172 296,180" fill="#2dd4bf" fillOpacity="0.4" />

          {/* Axis indicator */}
          <line x1="100" y1="250" x2="130" y2="250" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="100" y1="250" x2="100" y2="220" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.5" />
          <line x1="100" y1="250" x2="85" y2="260" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.5" />
          <text x="133" y="253" fontSize="8" fill="#ef4444" fillOpacity="0.6">X</text>
          <text x="96" y="217" fontSize="8" fill="#22c55e" fillOpacity="0.6">Y</text>
          <text x="77" y="267" fontSize="8" fill="#3b82f6" fillOpacity="0.6">Z</text>
        </svg>

        <div className="absolute bottom-3 left-3 flex min-h-6 items-center gap-2 rounded bg-canvas px-2 text-[0.65rem] text-fg shadow-sm">
          <Move3d className="h-3 w-3 text-accent" aria-hidden="true" />
          <span>3D 에셋</span>
        </div>
        <div className="absolute bottom-3 right-3 flex min-h-6 items-center gap-2 rounded bg-canvas px-2 text-[0.65rem] text-fg shadow-sm">
          <RotateCw className="h-3 w-3 text-fg-3" aria-hidden="true" />
          <span>회전 가능</span>
        </div>

        {recipe.parameters ? (
          <div className="absolute right-3 top-3 flex min-h-6 items-center gap-1.5 rounded bg-canvas px-2 text-[0.65rem] text-fg shadow-sm">
            <Layers className="h-3 w-3 text-accent" aria-hidden="true" />
            <span>{Object.keys(recipe.parameters).length}개 파라미터</span>
          </div>
        ) : null}
      </div>

      <p id="market-3d-asset-preview-note" className="border-t border-line bg-panel/30 px-4 py-2 text-[0.68rem] leading-relaxed text-fg-3">
        3D 에셋의 구조를 설명하기 위한 단순화된 일러스트이며 실제 Studio 렌더 결과가 아닙니다.
        Studio에서 Three.js로 실시간 렌더링됩니다.
      </p>
    </div>
  );
}
