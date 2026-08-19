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
  | "glow"
  | "glitter"
  | "oil"
  | "texture"
  | "tone";

export type StudioBrushMediaGroupVisual = "line" | "marker" | "paint" | "fx" | "texture";

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
    case "fx":
      return {
        tile: "oklch(0.2 0.05 320 / 0.32)",
        ink: "oklch(0.78 0.16 330)",
        paper: "oklch(0.28 0.04 300 / 0.28)",
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

/**
 * Catalogue previews use the same outer opacity that a newly-authored stroke stores. Avoid a
 * decorative minimum: that made transparent markers and airbrushes look opaque in the picker even
 * though the canvas correctly rendered a light first mark.
 */
export function studioBrushPreviewOpacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 1;
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
  if (style === "soft" || style === "neon" || style === "glow" || style === "oil") {
    return `M2 ${mid} C${width * 0.28} ${mid - 4}, ${width * 0.48} ${mid + 4}, ${width - 2} ${mid - 1}`;
  }
  // solid / dashed / texture fallbacks share a clean arc
  return `M2 ${mid} C${width * 0.32} ${mid - 3.5}, ${width * 0.55} ${mid + 3.5}, ${width - 2} ${mid}`;
}

export function studioBrushPreviewStrokeWidth(weight: number, style: StudioBrushPreviewStyle): number {
  const base = Math.max(1.15, Math.min(5.5, weight * 4.2));
  if (style === "soft" || style === "neon" || style === "glow") return base * 1.15;
  if (style === "oil") return base * 1.4;
  if (style === "calligraphy") return base * 1.35;
  if (style === "dots" || style === "tone" || style === "glitter") return base * 0.85;
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
  if (style === "glitter") {
    return [
      { x: 4, y: mid - 3, r: 0.9 },
      { x: 9, y: mid + 2, r: 1.4 },
      { x: 14, y: mid - 1.5, r: 0.7 },
      { x: 19, y: mid + 1, r: 1.6 },
      { x: 24, y: mid - 2.5, r: 1.1 },
      { x: 29, y: mid + 0.5, r: 1.3 },
      { x: 33, y: mid - 1, r: 0.8 },
    ];
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

function studioBrushPreviewCubics(
  style: StudioBrushPreviewStyle,
  width: number,
  height: number
): ReadonlyArray<readonly [number, number, number, number, number, number, number, number]> {
  const mid = height / 2;
  if (style === "wavy" || style === "calligraphy") {
    // pathD 의 C…S… 두 세그먼트와 동일 기하(S 는 직전 제어점의 반사).
    const p3x = width * 0.52;
    const p3y = mid - 2;
    const c2x = width * 0.38;
    const c2y = mid + 5;
    return [
      [2, mid + 2, width * 0.22, mid - 5, c2x, c2y, p3x, p3y],
      [p3x, p3y, 2 * p3x - c2x, 2 * p3y - c2y, width * 0.78, mid + 4, width - 2, mid],
    ];
  }
  if (style === "oil") {
    return [[2, mid, width * 0.28, mid - 4, width * 0.48, mid + 4, width - 2, mid - 1]];
  }
  return [[2, mid, width * 0.32, mid - 3.5, width * 0.55, mid + 3.5, width - 2, mid]];
}

/**
 * 필압 테이퍼 리본(닫힌 fill path) — 균일 굵기 선 아이콘 대신 얇게 시작해 배로 부풀었다
 * 가늘게 빠지는 실제 획감을 타일에서 보여준다(Procreate/CSP 트레이 관례). solid/wavy 는
 * 사인 이징 테이퍼, calligraphy 는 고정 45° 납작 촉, oil 은 두터운 테이퍼. 그 외 스타일은
 * null — 기존 스트로크/도트 프리뷰를 유지한다.
 */
export function studioBrushPreviewRibbonD(
  style: StudioBrushPreviewStyle,
  width = 36,
  height = 16,
  weight = 1
): string | null {
  if (style !== "solid" && style !== "wavy" && style !== "calligraphy" && style !== "oil") {
    return null;
  }
  const base = studioBrushPreviewStrokeWidth(weight, style) / 2;
  const segments = studioBrushPreviewCubics(style, width, height);
  const samplesPerSegment = 9;
  const points: { x: number; y: number; nx: number; ny: number; t: number }[] = [];
  const total = segments.length;
  segments.forEach((seg, segmentIndex) => {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = seg;
    for (let i = segmentIndex === 0 ? 0 : 1; i <= samplesPerSegment; i += 1) {
      const t = i / samplesPerSegment;
      const u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
      const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
      const len = Math.hypot(dx, dy) || 1;
      points.push({
        x,
        y,
        nx: -dy / len,
        ny: dx / len,
        t: (segmentIndex + t) / total,
      });
    }
  });
  const halfAt = (t: number): number => {
    if (style === "calligraphy") return base * 0.9;
    const taper = 0.28 + 0.72 * Math.sin(Math.PI * (0.06 + 0.9 * t));
    return base * Math.max(0.22, taper) * (style === "oil" ? 1.25 : 1);
  };
  // calligraphy 는 진행 방향과 무관한 고정 촉 각도(45°)로 납작한 리본을 만든다.
  const nib = { nx: Math.SQRT1_2, ny: -Math.SQRT1_2 };
  const upper: string[] = [];
  const lower: string[] = [];
  for (const point of points) {
    const half = halfAt(point.t);
    const ox = (style === "calligraphy" ? nib.nx : point.nx) * half;
    const oy = (style === "calligraphy" ? nib.ny : point.ny) * half;
    upper.push(`${(point.x + ox).toFixed(2)} ${(point.y + oy).toFixed(2)}`);
    lower.unshift(`${(point.x - ox).toFixed(2)} ${(point.y - oy).toFixed(2)}`);
  }
  return `M${upper[0]} L${upper.slice(1).join(" L")} L${lower.join(" L")} Z`;
}
