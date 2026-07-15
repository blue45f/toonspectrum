/**
 * Commercial brush-chip visuals (Picsart / Express / Ibis / CSP tray tiles).
 * Pure SVG path + surface tokens — no React. Used by StudioBrushTray and tests.
 */

export type StudioBrushPreviewStyle =
  | "solid"
  | "soft"
  | "dashed"
  | "dots"
  | "wavy"
  | "calligraphy"
  | "neon"
  | "texture"
  | "tone";

export type StudioBrushMediaGroupVisual = "line" | "marker" | "paint" | "texture";

export interface StudioBrushChipSurface {
  /** Tile rest background */
  tile: string;
  /** Accent ink for inactive stroke glyph */
  ink: string;
  /** Soft paper grain under the stroke */
  paper: string;
}

/** Warm-ink chip surfaces per media family (DESIGN.md hue ~64–70). */
export function studioBrushChipSurface(media: StudioBrushMediaGroupVisual): StudioBrushChipSurface {
  switch (media) {
    case "line":
      return {
        tile: "oklch(0.2 0.01 66 / 0.75)",
        ink: "oklch(0.78 0.02 70)",
        paper: "oklch(0.28 0.012 64 / 0.35)",
      };
    case "marker":
      return {
        tile: "oklch(0.22 0.035 42 / 0.35)",
        ink: "oklch(0.72 0.14 42)",
        paper: "oklch(0.3 0.04 42 / 0.25)",
      };
    case "paint":
      return {
        tile: "oklch(0.21 0.03 150 / 0.28)",
        ink: "oklch(0.72 0.1 150)",
        paper: "oklch(0.28 0.03 150 / 0.22)",
      };
    case "texture":
      return {
        tile: "oklch(0.21 0.02 80 / 0.4)",
        ink: "oklch(0.7 0.06 80)",
        paper: "oklch(0.32 0.02 70 / 0.3)",
      };
    default:
      return {
        tile: "oklch(0.2 0.01 66 / 0.75)",
        ink: "oklch(0.78 0.02 70)",
        paper: "oklch(0.28 0.012 64 / 0.35)",
      };
  }
}

export interface StudioBrushPreviewModel {
  style: StudioBrushPreviewStyle;
  /** 0–1 → stroke width in viewBox units */
  weight: number;
  /** viewBox width × height */
  width: number;
  height: number;
}

/** Deterministic path d for solid/wavy/calligraphy-like strokes (viewBox 0..w × 0..h). */
export function studioBrushPreviewPathD(
  style: StudioBrushPreviewStyle,
  width = 36,
  height = 16
): string {
  const mid = height / 2;
  if (style === "wavy" || style === "calligraphy") {
    return `M2 ${mid + 2} C${width * 0.22} ${mid - 5}, ${width * 0.38} ${mid + 5}, ${width * 0.52} ${mid - 2} S${width * 0.78} ${mid + 4}, ${width - 2} ${mid}`;
  }
  if (style === "soft" || style === "neon") {
    return `M2 ${mid} C${width * 0.28} ${mid - 4}, ${width * 0.48} ${mid + 4}, ${width - 2} ${mid - 1}`;
  }
  // solid / dashed / texture fallbacks share a clean arc
  return `M2 ${mid} C${width * 0.32} ${mid - 3.5}, ${width * 0.55} ${mid + 3.5}, ${width - 2} ${mid}`;
}

export function studioBrushPreviewStrokeWidth(weight: number, style: StudioBrushPreviewStyle): number {
  const base = Math.max(1.15, Math.min(5.5, weight * 4.2));
  if (style === "soft" || style === "neon") return base * 1.15;
  if (style === "calligraphy") return base * 1.35;
  if (style === "dots" || style === "tone") return base * 0.85;
  if (style === "dashed") return base * 0.9;
  return base;
}

/** Dot centers for spray / chalk / screentone previews. */
export function studioBrushPreviewDotCenters(
  style: StudioBrushPreviewStyle,
  width = 36,
  height = 16
): readonly { x: number; y: number; r: number }[] {
  const mid = height / 2;
  if (style === "tone") {
    const dots: { x: number; y: number; r: number }[] = [];
    for (let x = 4; x <= width - 4; x += 4) {
      for (let y = 4; y <= height - 4; y += 4) {
        dots.push({ x: x + ((y / 4) % 2) * 1.5, y, r: 0.85 });
      }
    }
    return dots;
  }
  if (style === "dots" || style === "texture") {
    return [
      { x: 5, y: mid - 2, r: 1.2 },
      { x: 10, y: mid + 1.5, r: 1.6 },
      { x: 16, y: mid - 1, r: 1.1 },
      { x: 21, y: mid + 2, r: 1.8 },
      { x: 27, y: mid, r: 1.3 },
      { x: 32, y: mid - 1.5, r: 1.5 },
    ];
  }
  return [];
}

export function studioBrushPreviewDashArray(style: StudioBrushPreviewStyle): string | undefined {
  if (style === "dashed" || style === "texture") return "2.4 2.6";
  return undefined;
}
