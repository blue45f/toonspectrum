/**
 * Drawing HUD / status label builders — Concepts / Krita / CSP status bar cues.
 * Pure strings for StudioStatusBar; no React.
 */

export type StudioDrawHudTool =
  | { mode: "pen"; brushName: string; widthPx: number; opacity01: number }
  | { mode: "eraser"; widthPx: number }
  | { mode: "shape"; shapeLabel: string }
  | { mode: "select"; selectionLabel: string | null }
  | { mode: "other"; label: string };

export function studioDrawHudToolLabel(tool: StudioDrawHudTool): string {
  switch (tool.mode) {
    case "pen":
      return `${tool.brushName} · ${Math.round(tool.widthPx)}px · ${Math.round(tool.opacity01 * 100)}%`;
    case "eraser":
      return `지우개 ${Math.round(tool.widthPx)}px`;
    case "shape":
      return `도형 · ${tool.shapeLabel}`;
    case "select":
      return tool.selectionLabel ? `선택 · ${tool.selectionLabel}` : "선택";
    case "other":
      return tool.label;
  }
}

export type StudioSymmetryHud =
  | "none"
  | "vertical"
  | "horizontal"
  | "radial"
  | "kaleidoscope";

export function studioSymmetryHudLabel(type: StudioSymmetryHud): string | null {
  switch (type) {
    case "none":
      return null;
    case "vertical":
      return "대칭 세로";
    case "horizontal":
      return "대칭 가로";
    case "radial":
      return "대칭 방사";
    case "kaleidoscope":
      return "대칭 만화경";
  }
}

export function studioStabilizerHudLabel(
  strength: number,
  mode: "standard" | "adaptive" | "precision" = "adaptive"
): string {
  const modeKo =
    mode === "standard" ? "표준" : mode === "precision" ? "정밀" : "적응";
  return `보정 ${Math.round(strength)} · ${modeKo}`;
}

/** Clamp displayed pressure 0–1 for HUD meter width. */
export function studioPressureHudRatio(pressure: number | null | undefined): number | null {
  if (pressure === null || pressure === undefined) return null;
  if (!Number.isFinite(pressure)) return null;
  return Math.min(1, Math.max(0, pressure));
}

export function studioShapeKindLabel(kind: string): string {
  const map: Record<string, string> = {
    line: "선",
    rect: "사각형",
    ellipse: "타원",
    star: "별",
    arrow: "화살표",
    triangle: "삼각형",
    polygon: "다각형",
  };
  return map[kind] ?? kind;
}

export function studioPressureCurveHudLabel(
  curve: "soft" | "linear" | "firm" | number
): string {
  if (curve === "soft" || curve === 0.6 || curve === 0.5) return "필압 민감";
  if (curve === "firm" || curve === 1.6 || curve === 1.5) return "필압 단단";
  if (typeof curve === "number") {
    if (curve < 0.85) return "필압 민감";
    if (curve > 1.25) return "필압 단단";
  }
  return "필압 기본";
}

/** Short status chip when shape fill is enabled. */
export function studioShapeFillHudLabel(filled: boolean, kind: string): string | null {
  if (!filled) return null;
  if (kind === "line" || kind === "arrow") return null;
  return "채우기";
}
