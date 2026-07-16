/**
 * Brush preset → icon key map (PicsArt/Ibis-style recognition).
 * Pure strings only — Lucide resolution lives in StudioBrushPresetIcon.tsx.
 */

export type StudioBrushIconId =
  | "pen"
  | "pen-line"
  | "pencil"
  | "highlighter"
  | "brush"
  | "paintbrush"
  | "spray-can"
  | "droplets"
  | "sparkles"
  | "star"
  | "sun"
  | "circle-dot"
  | "waves"
  | "flame"
  | "wind"
  | "grid-3x3"
  | "gem"
  | "a-large-small"
  | "default";

/** Per-preset icon (commercial brush pickers). Unknown ids → default pen. */
export const STUDIO_BRUSH_ICON_BY_ID: Readonly<Record<string, StudioBrushIconId>> = {
  // Line
  pen: "pen",
  fineliner: "pen-line",
  ballpoint: "pen",
  gpen: "pen-line",
  liner: "pen-line",
  "ink-brush": "paintbrush",
  calligraphy: "a-large-small",
  pencil: "pencil",
  "soft-pencil": "pencil",
  "pencil-grain": "pencil",
  // Marker
  marker: "highlighter",
  "felt-tip": "highlighter",
  "marker-bold": "highlighter",
  highlighter: "highlighter",
  neon: "sun",
  // FX
  glow: "sparkles",
  "soft-glow": "sparkles",
  glitter: "star",
  "star-dust": "star",
  // Paint
  brush: "brush",
  watercolor: "droplets",
  "ink-wash": "droplets",
  oil: "paintbrush",
  airbrush: "wind",
  "airbrush-fine": "wind",
  "wash-brush": "droplets",
  "soft-brush": "brush",
  spray: "spray-can",
  // Texture
  "dry-media": "pencil",
  crayon: "flame",
  chalk: "circle-dot",
  charcoal: "circle-dot",
  pastel: "waves",
  "ink-particle": "gem",
  screentone: "grid-3x3",
};

export function studioBrushIconId(brushId: unknown): StudioBrushIconId {
  if (typeof brushId !== "string" || !brushId) return "default";
  return STUDIO_BRUSH_ICON_BY_ID[brushId] ?? "default";
}
