import type { StudioBg3dCompositionGuideMode } from "./studio-bg3d-composition-guide";
import { resolveStudioBg3dCaptureFrame } from "./studio-bg3d-capture-frame-geometry";

export interface StudioBg3dCompositionOverlayProps {
  readonly mode: StudioBg3dCompositionGuideMode;
  readonly className?: string;
  readonly viewportSize?: { readonly width: number; readonly height: number } | null;
}

export function StudioBg3dCompositionOverlay({
  mode,
  className,
  viewportSize,
}: StudioBg3dCompositionOverlayProps) {
  if (mode === "none") return null;
  const frame = mode === "verticalWebtoon" && viewportSize
    ? resolveStudioBg3dCaptureFrame({
      viewportWidth: viewportSize.width, viewportHeight: viewportSize.height, aspectRatio: 9 / 16,
    })
    : null;
  if (mode === "verticalWebtoon" && !frame) return null;
  const frameX = frame && viewportSize ? frame.x / viewportSize.width * 1_000 : 0;
  const frameY = frame && viewportSize ? frame.y / viewportSize.height * 1_000 : 0;
  const frameWidth = frame && viewportSize ? frame.width / viewportSize.width * 1_000 : 1_000;
  const frameHeight = frame && viewportSize ? frame.height / viewportSize.height * 1_000 : 1_000;

  return (
    <div
      aria-hidden="true"
      data-testid="bg3d-composition-overlay"
      data-guide-mode={mode}
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${className ?? ""}`}
    >
      <svg
        className="size-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        {mode === "ruleOfThirds" && (
          <g stroke="currentColor" className="text-accent/40" strokeWidth="1.2">
            {/* Horizontal thirds */}
            <line x1="0" y1="333.33" x2="1000" y2="333.33" strokeDasharray="6,4" />
            <line x1="0" y1="666.66" x2="1000" y2="666.66" strokeDasharray="6,4" />
            {/* Vertical thirds */}
            <line x1="333.33" y1="0" x2="333.33" y2="1000" strokeDasharray="6,4" />
            <line x1="666.66" y1="0" x2="666.66" y2="1000" strokeDasharray="6,4" />
            {/* 4 Golden intersection points */}
            <circle cx="333.33" cy="333.33" r="6" fill="currentColor" className="text-accent/70" />
            <circle cx="666.66" cy="333.33" r="6" fill="currentColor" className="text-accent/70" />
            <circle cx="333.33" cy="666.66" r="6" fill="currentColor" className="text-accent/70" />
            <circle cx="666.66" cy="666.66" r="6" fill="currentColor" className="text-accent/70" />
          </g>
        )}

        {mode === "verticalWebtoon" && (
          <g>
            {/* Mobile cut safe box (9:16 aspect centered) */}
            <rect
              data-testid="bg3d-vertical-webtoon-frame"
              x={frameX}
              y={frameY}
              width={frameWidth}
              height={frameHeight}
              fill="none"
              stroke="currentColor"
              className="text-accent/60"
              strokeWidth="2"
            />
            {/* Safe zone top/bottom markers */}
            <line x1={frameX} y1={frameY + frameHeight * 0.12} x2={frameX + frameWidth} y2={frameY + frameHeight * 0.12} stroke="currentColor" className="text-accent/30" strokeDasharray="4,4" strokeWidth="1" />
            <line x1={frameX} y1={frameY + frameHeight * 0.88} x2={frameX + frameWidth} y2={frameY + frameHeight * 0.88} stroke="currentColor" className="text-accent/30" strokeDasharray="4,4" strokeWidth="1" />
            {/* Dimmed outer region */}
            <path d={`M 0 0 H 1000 V 1000 H 0 Z M ${frameX} ${frameY} V ${frameY + frameHeight} H ${frameX + frameWidth} V ${frameY} Z`} fill="black" fillRule="evenodd" opacity="0.22" />
            {/* Vertical midline */}
            <line x1="500" y1={frameY} x2="500" y2={frameY + frameHeight} stroke="currentColor" className="text-accent/35" strokeDasharray="3,3" strokeWidth="0.8" />
          </g>
        )}

        {mode === "goldenSpiral" && (
          <g stroke="currentColor" className="text-accent/50" fill="none" strokeWidth="1.5">
            {/* Golden rectangle divisions */}
            <rect x="0" y="0" width="618" height="1000" strokeDasharray="4,3" />
            <rect x="618" y="382" width="382" height="618" strokeDasharray="4,3" />
            <rect x="618" y="0" width="236" height="382" strokeDasharray="4,3" />
            <rect x="854" y="0" width="146" height="236" strokeDasharray="4,3" />
            {/* Golden spiral path */}
            <path
              d="M 1000,1000 A 618,618 0 0,1 382,1000 A 618,618 0 0,1 0,382 A 382,382 0 0,1 618,0 A 236,236 0 0,1 854,382 A 146,146 0 0,1 1000,236"
              stroke="currentColor"
              className="text-accent/75"
              strokeWidth="2"
            />
          </g>
        )}

        {mode === "crosshair" && (
          <g stroke="currentColor" className="text-accent/40" strokeWidth="1">
            {/* Center crosshair */}
            <line x1="0" y1="500" x2="1000" y2="500" />
            <line x1="500" y1="0" x2="500" y2="1000" />
            {/* Diagonal perspective lines */}
            <line x1="0" y1="0" x2="1000" y2="1000" strokeDasharray="5,5" strokeOpacity="0.5" />
            <line x1="0" y1="1000" x2="1000" y2="0" strokeDasharray="5,5" strokeOpacity="0.5" />
            {/* Center focal circle */}
            <circle cx="500" cy="500" r="30" fill="none" stroke="currentColor" className="text-accent/60" strokeWidth="1.5" />
            <circle cx="500" cy="500" r="3" fill="currentColor" className="text-accent" />
          </g>
        )}
      </svg>
    </div>
  );
}
