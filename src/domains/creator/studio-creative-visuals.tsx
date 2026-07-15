/**
 * Creative-feature visual glyphs — AutoDraw / CSP / Canva / Concepts style
 * mini illustrations for tools, not brand clones. Pure presentation.
 */
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export type StudioShapeKindVisual = "line" | "rect" | "circle" | "triangle" | "poly";

/** Mini recognized-shape icons for smart-shape / rail affordances. */
export function StudioShapeKindGlyph({
  kind,
  className,
  active = false,
}: {
  kind: StudioShapeKindVisual;
  className?: string;
  active?: boolean;
}): ReactElement {
  const stroke = "currentColor";
  return (
    <svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 18 18"
      className={cn(active ? "text-accent" : "text-fg-2", className)}
      data-studio-shape-glyph={kind}
    >
      {kind === "line" && (
        <path d="M3 13 L15 5" fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" />
      )}
      {kind === "rect" && (
        <rect
          x={3.5}
          y={4.5}
          width={11}
          height={9}
          rx={1.5}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
        />
      )}
      {kind === "circle" && (
        <circle cx={9} cy={9} r={5.2} fill="none" stroke={stroke} strokeWidth={1.6} />
      )}
      {kind === "triangle" && (
        <path
          d="M9 3.5 L14.5 14 H3.5 Z"
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      )}
      {kind === "poly" && (
        <path
          d="M9 2.8 L14.2 6.2 L12.8 12.5 H5.2 L3.8 6.2 Z"
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export type StudioSymmetryVisual = "none" | "vertical" | "horizontal" | "radial";

/** Symmetry mode glyphs for the options strip (CSP mirror tools). */
export function StudioSymmetryGlyph({
  mode,
  className,
}: {
  mode: StudioSymmetryVisual;
  className?: string;
}): ReactElement {
  return (
    <svg
      aria-hidden
      width={14}
      height={14}
      viewBox="0 0 14 14"
      className={cn("text-current", className)}
      data-studio-symmetry-glyph={mode}
    >
      {mode === "none" && (
        <path
          d="M3 7 H11 M7 3 V11"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
          opacity={0.45}
        />
      )}
      {mode === "vertical" && (
        <>
          <path d="M7 2 V12" stroke="currentColor" strokeWidth={1.2} strokeDasharray="1.5 1.2" />
          <path
            d="M3 4 C5 5.5, 5 8.5, 3 10"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <path
            d="M11 4 C9 5.5, 9 8.5, 11 10"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      )}
      {mode === "horizontal" && (
        <>
          <path d="M2 7 H12" stroke="currentColor" strokeWidth={1.2} strokeDasharray="1.5 1.2" />
          <path
            d="M4 3 C5.5 5, 8.5 5, 10 3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <path
            d="M4 11 C5.5 9, 8.5 9, 10 11"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      )}
      {mode === "radial" && (
        <>
          <circle cx={7} cy={7} r={2.2} fill="none" stroke="currentColor" strokeWidth={1.2} />
          {[0, 45, 90, 135].map((deg) => (
            <path
              key={deg}
              d="M7 7 L7 2.2"
              stroke="currentColor"
              strokeWidth={1.15}
              strokeLinecap="round"
              transform={`rotate(${deg} 7 7)`}
            />
          ))}
        </>
      )}
    </svg>
  );
}

export type StudioStarterArtId =
  | "draw"
  | "smart-shape"
  | "brush-kit"
  | "template"
  | "collab-focus"
  | "character"
  | "bubble"
  | "example";

/** Gradient + glyph header for Canva-style starter cards. */
export function StudioStarterCardArt({
  id,
  className,
}: {
  id: StudioStarterArtId;
  className?: string;
}): ReactElement {
  const gradient = (() => {
    switch (id) {
      case "draw":
        return "linear-gradient(145deg, oklch(0.35 0.06 42 / 0.55), oklch(0.2 0.02 70 / 0.8))";
      case "smart-shape":
        return "linear-gradient(145deg, oklch(0.38 0.08 290 / 0.35), oklch(0.2 0.02 70 / 0.85))";
      case "brush-kit":
        return "linear-gradient(145deg, oklch(0.4 0.1 150 / 0.3), oklch(0.2 0.02 70 / 0.85))";
      case "template":
        return "linear-gradient(145deg, oklch(0.36 0.06 232 / 0.35), oklch(0.2 0.02 70 / 0.85))";
      case "collab-focus":
        return "linear-gradient(145deg, oklch(0.32 0.03 70 / 0.5), oklch(0.18 0.01 70 / 0.9))";
      case "character":
        return "linear-gradient(145deg, oklch(0.4 0.09 25 / 0.28), oklch(0.2 0.02 70 / 0.85))";
      case "bubble":
        return "linear-gradient(145deg, oklch(0.42 0.04 85 / 0.4), oklch(0.22 0.02 70 / 0.85))";
      case "example":
      default:
        return "linear-gradient(145deg, oklch(0.45 0.12 42 / 0.4), oklch(0.22 0.03 42 / 0.75))";
    }
  })();

  return (
    <div
      data-studio-starter-art={id}
      className={cn(
        "relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg",
        className
      )}
      style={{ background: gradient }}
    >
      {/* Soft ledger grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.97 0.01 85 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(0.97 0.01 85 / 0.05) 1px, transparent 1px)",
          backgroundSize: "6px 6px",
        }}
      />
      <svg
        aria-hidden
        width={40}
        height={28}
        viewBox="0 0 40 28"
        className="relative text-fg drop-shadow-sm"
      >
        {id === "draw" && (
          <path
            d="M4 20 C10 8, 16 22, 22 10 S32 18, 36 12"
            fill="none"
            stroke="oklch(0.85 0.08 42)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        )}
        {id === "smart-shape" && (
          <>
            <rect x={5} y={7} width={12} height={12} rx={1.5} fill="none" stroke="oklch(0.82 0.08 290)" strokeWidth={1.5} />
            <circle cx={29} cy={13} r={6} fill="none" stroke="oklch(0.78 0.06 232)" strokeWidth={1.5} />
          </>
        )}
        {id === "brush-kit" && (
          <>
            <path d="M6 18 C12 10, 16 20, 22 12" fill="none" stroke="oklch(0.8 0.1 150)" strokeWidth={2.2} strokeLinecap="round" />
            <path d="M18 20 C24 12, 28 20, 34 14" fill="none" stroke="oklch(0.75 0.12 42)" strokeWidth={3} strokeLinecap="round" opacity={0.75} />
          </>
        )}
        {id === "template" && (
          <>
            <rect x={4} y={5} width={14} height={18} rx={1.2} fill="oklch(0.3 0.02 232 / 0.45)" stroke="oklch(0.75 0.06 232)" strokeWidth={1.2} />
            <rect x={20} y={5} width={16} height={8} rx={1.2} fill="oklch(0.32 0.02 70 / 0.5)" stroke="oklch(0.7 0.03 70)" strokeWidth={1.1} />
            <rect x={20} y={15} width={16} height={8} rx={1.2} fill="oklch(0.32 0.02 70 / 0.5)" stroke="oklch(0.7 0.03 70)" strokeWidth={1.1} />
          </>
        )}
        {id === "collab-focus" && (
          <rect x={6} y={6} width={28} height={16} rx={2} fill="none" stroke="oklch(0.82 0.04 70)" strokeWidth={1.5} strokeDasharray="3 2" />
        )}
        {id === "character" && (
          <>
            <circle cx={20} cy={10} r={5} fill="none" stroke="oklch(0.8 0.08 25)" strokeWidth={1.5} />
            <path d="M10 24 C12 16, 28 16, 30 24" fill="none" stroke="oklch(0.8 0.08 25)" strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {id === "bubble" && (
          <path
            d="M8 6 H28 C31 6, 33 8, 33 10.5 V15 C33 17.5, 31 19.5, 28 19.5 H20 L14 24 V19.5 H12 C9 19.5, 7 17.5, 7 15 V10.5 C7 8, 9 6, 12 6 Z"
            fill="oklch(0.94 0.02 85 / 0.85)"
            stroke="oklch(0.55 0.03 70)"
            strokeWidth={1.2}
          />
        )}
        {id === "example" && (
          <>
            <path d="M5 8 H35" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} opacity={0.5} />
            <path d="M5 14 H28" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} opacity={0.7} />
            <path d="M5 20 H22" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} />
          </>
        )}
      </svg>
    </div>
  );
}

/** Row of shape kinds shown when smart-shape is armed. */
export function StudioSmartShapeKindRow({
  className,
}: {
  className?: string;
}): ReactElement {
  const kinds: StudioShapeKindVisual[] = ["line", "rect", "circle", "triangle", "poly"];
  return (
    <div
      data-studio-smart-shape-kinds="true"
      className={cn(
        "flex items-center gap-1 rounded-lg border border-line/60 bg-canvas/40 px-1.5 py-1",
        className
      )}
      aria-hidden
    >
      {kinds.map((kind) => (
        <span
          key={kind}
          className="grid size-7 place-items-center rounded-md bg-card/80 ring-1 ring-line/50"
        >
          <StudioShapeKindGlyph kind={kind} />
        </span>
      ))}
    </div>
  );
}
