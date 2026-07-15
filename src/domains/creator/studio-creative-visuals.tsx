/**
 * Creative-feature visual glyphs — AutoDraw / CSP / Canva / Concepts style
 * mini illustrations for tools, not brand clones. Pure presentation.
 */
/* eslint-disable react-refresh/only-export-components -- shape kind maps + picker kinds shared with StudioPage / options bar */
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export type StudioShapeKindVisual =
  | "line"
  | "rect"
  | "circle"
  | "triangle"
  | "poly"
  | "star"
  | "arrow"
  | "ellipse";

/** Map StudioPage DrawShapeKind → glyph id. */
export function studioDrawShapeToGlyph(
  kind: string
): StudioShapeKindVisual {
  if (kind === "ellipse") return "ellipse";
  if (kind === "polygon") return "poly";
  if (
    kind === "line" ||
    kind === "rect" ||
    kind === "triangle" ||
    kind === "star" ||
    kind === "arrow"
  ) {
    return kind;
  }
  return "rect";
}

/** Mini shape icons for smart-shape / shape tool pickers (Photopea/Canva). */
export function StudioShapeKindGlyph({
  kind,
  className,
  active = false,
  filled = false,
}: {
  kind: StudioShapeKindVisual;
  className?: string;
  active?: boolean;
  filled?: boolean;
}): ReactElement {
  const stroke = "currentColor";
  const fill = filled ? "currentColor" : "none";
  const fillOp = filled ? 0.22 : undefined;
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
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.6}
        />
      )}
      {kind === "circle" && (
        <circle
          cx={9}
          cy={9}
          r={5.2}
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.6}
        />
      )}
      {kind === "ellipse" && (
        <ellipse
          cx={9}
          cy={9}
          rx={6.2}
          ry={4.5}
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.6}
        />
      )}
      {kind === "triangle" && (
        <path
          d="M9 3.5 L14.5 14 H3.5 Z"
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      )}
      {kind === "poly" && (
        <path
          d="M9 2.8 L14.2 6.2 L12.8 12.5 H5.2 L3.8 6.2 Z"
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {kind === "star" && (
        <path
          d="M9 2.5 L10.7 6.8 L15.3 7.1 L11.7 10 L12.9 14.5 L9 12.2 L5.1 14.5 L6.3 10 L2.7 7.1 L7.3 6.8 Z"
          fill={fill}
          fillOpacity={fillOp}
          stroke={stroke}
          strokeWidth={1.35}
          strokeLinejoin="round"
        />
      )}
      {kind === "arrow" && (
        <path
          d="M3 9 H12 M12 9 L8.5 5.5 M12 9 L8.5 12.5"
          fill="none"
          stroke={stroke}
          strokeWidth={1.65}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** Canonical shape kinds for pickers (Photopea/Canva order). */
export const STUDIO_DRAW_SHAPE_PICKER_KINDS = [
  { kind: "line", label: "선" },
  { kind: "rect", label: "사각형" },
  { kind: "ellipse", label: "타원" },
  { kind: "star", label: "별" },
  { kind: "arrow", label: "화살표" },
  { kind: "triangle", label: "삼각형" },
  { kind: "polygon", label: "다각형" },
] as const;

/** Visual shape picker tile grid used in tool options / inspector. */
export function StudioShapePickerGrid({
  kinds = STUDIO_DRAW_SHAPE_PICKER_KINDS,
  activeKind,
  onSelect,
  filled = false,
  className,
}: {
  kinds?: readonly { kind: string; label: string }[];
  activeKind: string;
  onSelect: (kind: string) => void;
  /** Preview glyphs with soft fill (when shape fill is on). */
  filled?: boolean;
  className?: string;
}): ReactElement {
  return (
    <div
      data-studio-shape-picker="true"
      role="listbox"
      aria-label="도형 종류"
      className={cn("grid grid-cols-4 gap-1.5 sm:grid-cols-4", className)}
    >
      {kinds.map((item) => {
        const active = activeKind === item.kind;
        const glyph = studioDrawShapeToGlyph(item.kind);
        const canFill = item.kind !== "line" && item.kind !== "arrow";
        return (
          <button
            key={item.kind}
            type="button"
            role="option"
            aria-selected={active}
            title={item.label}
            onClick={() => onSelect(item.kind)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-1 py-1.5 transition-[background,border-color,box-shadow,transform] duration-150",
              "hover:-translate-y-px hover:shadow-sm",
              active
                ? "border-accent/55 bg-accent-soft/50 text-fg shadow-sm ring-1 ring-accent/20"
                : "border-line/70 bg-card/90 text-fg-2 hover:border-line hover:bg-raised"
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg border",
                active
                  ? "border-accent/40 bg-canvas/50 text-accent"
                  : "border-line/50 bg-canvas/40"
              )}
            >
              <StudioShapeKindGlyph kind={glyph} active={active} filled={filled && canFill} />
            </span>
            <span className="text-[0.58rem] font-bold leading-none tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact horizontal shape chips for tool-options / mobile dock (CSP/Photopea).
 * Glyph-first, label optional — denser than the inspector grid.
 */
export function StudioShapePickerStrip({
  kinds = STUDIO_DRAW_SHAPE_PICKER_KINDS,
  activeKind,
  onSelect,
  filled = false,
  showLabels = true,
  className,
}: {
  kinds?: readonly { kind: string; label: string }[];
  activeKind: string;
  onSelect: (kind: string) => void;
  filled?: boolean;
  showLabels?: boolean;
  className?: string;
}): ReactElement {
  return (
    <div
      data-studio-shape-strip="true"
      role="listbox"
      aria-label="도형 모양"
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {kinds.map((item) => {
        const active = activeKind === item.kind;
        const glyph = studioDrawShapeToGlyph(item.kind);
        const canFill = item.kind !== "line" && item.kind !== "arrow";
        return (
          <button
            key={item.kind}
            type="button"
            role="option"
            aria-selected={active}
            title={item.label}
            onClick={() => onSelect(item.kind)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-1.5 text-[0.62rem] font-bold transition-[background,border-color,box-shadow,transform] duration-150",
              "hover:-translate-y-px",
              active
                ? "border-accent/55 bg-accent-soft/55 text-fg shadow-sm ring-1 ring-accent/20"
                : "border-line/70 bg-card/90 text-fg-2 hover:border-line hover:bg-raised"
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-md",
                active ? "bg-canvas/40 text-accent" : "text-current"
              )}
            >
              <StudioShapeKindGlyph kind={glyph} active={active} filled={filled && canFill} />
            </span>
            {showLabels ? <span className="pr-0.5">{item.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Concepts/Krita-style live pressure meter for status HUD. */
export function StudioPressureHudMeter({
  ratio,
  className,
}: {
  /** 0–1, or null when no pen sample. */
  ratio: number | null;
  className?: string;
}): ReactElement | null {
  if (ratio === null) return null;
  const pct = Math.round(ratio * 100);
  return (
    <span
      data-studio-pressure-meter="true"
      title={`필압 ${pct}%`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-card/80 px-1.5 py-0.5",
        className
      )}
      aria-label={`필압 ${pct}퍼센트`}
    >
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-raised ring-1 ring-line/50">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular-nums text-[0.58rem] font-bold text-fg-2">{pct}%</span>
    </span>
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
