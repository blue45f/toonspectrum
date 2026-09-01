/**
 * CSP-style sub tool palette data layer.
 *
 * `StudioSubToolPalette` is a presentational tab/listbox shell; this module is its single
 * source of truth. Every sub tool id maps to a REAL launch-safe core preset
 * (`BRUSH_PRESETS`) — the mapping table resolves fail-closed at module init, so a renamed
 * or removed preset silently drops out of the palette instead of offering a tool the
 * renderer cannot resolve. Quarantined ids (V17.1 ledger) never gain picker exposure here,
 * and a preset whose `operation` disagrees with its category's draw mode is dropped too:
 * category activation routes through the primary canvas tool transition, so a mismatched
 * row would put the canvas in a mode its own brush cannot paint in.
 */
import { BRUSH_PRESETS, type BrushPreset } from "../studio-brush";

import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";

export type StudioSubToolPaletteCategoryId =
  | "pen"
  | "pencil"
  | "brush"
  | "airbrush"
  | "eraser"
  | "manga";

/** The two draw modes the palette can transition to via `activateCanvasTool`. */
export type StudioSubToolPaletteDrawMode = "pen" | "eraser";

export interface StudioSubToolPaletteItem {
  id: string;
  name: string;
  /** Optional real global chord badge; never invent one that no shortcut layer serves. */
  shortcut?: string;
}

export interface StudioSubToolPaletteCategory {
  id: StudioSubToolPaletteCategoryId;
  label: string;
  /** Category tab activation routes through `activateCanvasTool("draw", drawMode)`. */
  drawMode: StudioSubToolPaletteDrawMode;
  tools: readonly StudioSubToolPaletteItem[];
}

interface StudioSubToolPaletteCategorySeed {
  id: StudioSubToolPaletteCategoryId;
  label: string;
  drawMode: StudioSubToolPaletteDrawMode;
  /** Core catalogue preset ids in display order; unknown ids drop fail-closed. */
  presetIds: readonly string[];
}

/**
 * Curated CSP-like grouping over the core catalogue. Ids listed here MUST exist in
 * `BRUSH_PRESETS`; the builder below enforces that instead of trusting this table.
 */
const STUDIO_SUB_TOOL_PALETTE_CATEGORY_SEEDS: readonly StudioSubToolPaletteCategorySeed[] = [
  {
    id: "pen",
    label: "펜",
    drawMode: "pen",
    presetIds: ["gpen", "maru-pen", "kaburapen", "school-pen", "mapping-pen", "calligraphy"],
  },
  {
    id: "pencil",
    label: "연필",
    drawMode: "pen",
    presetIds: ["pencil", "pencil-2b", "pencil-6b", "soft-pencil", "colored-pencil"],
  },
  {
    id: "brush",
    label: "붓",
    drawMode: "pen",
    presetIds: [
      "watercolor",
      "inkwash-pen",
      "inkwash-water-brush",
      "ink-brush",
      "gouache",
      "oil",
      "flat-brush",
    ],
  },
  {
    id: "airbrush",
    label: "에어브러시",
    drawMode: "pen",
    presetIds: ["airbrush", "hard-airbrush", "airbrush-fine", "spray", "splatter"],
  },
  {
    id: "eraser",
    label: "지우개",
    drawMode: "eraser",
    presetIds: ["standard-eraser", "kneaded-eraser"],
  },
  {
    id: "manga",
    label: "만화",
    drawMode: "pen",
    presetIds: [
      "web-radial-burst",
      "screentone",
      "web-dot-tone",
      "crosshatch",
      "web-cross-hatch-pen",
    ],
  },
];

const CORE_PRESET_BY_ID: ReadonlyMap<string, BrushPreset> = new Map(
  BRUSH_PRESETS.map((preset) => [preset.id, preset]),
);

function presetDrawMode(preset: BrushPreset): StudioSubToolPaletteDrawMode {
  return preset.operation === "erase" ? "eraser" : "pen";
}

export const STUDIO_SUB_TOOL_PALETTE_CATEGORIES: readonly StudioSubToolPaletteCategory[] =
  Object.freeze(
    STUDIO_SUB_TOOL_PALETTE_CATEGORY_SEEDS.map((seed) =>
      Object.freeze({
        id: seed.id,
        label: seed.label,
        drawMode: seed.drawMode,
        tools: Object.freeze(
          seed.presetIds.flatMap((presetId): StudioSubToolPaletteItem[] => {
            const preset = CORE_PRESET_BY_ID.get(presetId);
            if (!preset) return [];
            if (isStudioBrushQuarantinedPresetId(preset.id)) return [];
            if (presetDrawMode(preset) !== seed.drawMode) return [];
            return [Object.freeze({ id: preset.id, name: preset.name })];
          }),
        ),
      }),
    ),
  );

export const STUDIO_SUB_TOOL_PALETTE_DEFAULT_CATEGORY_ID: StudioSubToolPaletteCategoryId =
  "pen";

const CATEGORY_BY_ID: ReadonlyMap<string, StudioSubToolPaletteCategory> = new Map(
  STUDIO_SUB_TOOL_PALETTE_CATEGORIES.map((category) => [category.id, category]),
);

const CATEGORY_ID_BY_PRESET_ID: ReadonlyMap<string, StudioSubToolPaletteCategoryId> =
  new Map(
    STUDIO_SUB_TOOL_PALETTE_CATEGORIES.flatMap((category) =>
      category.tools.map(
        (tool) => [tool.id, category.id] as [string, StudioSubToolPaletteCategoryId],
      ),
    ),
  );

export function studioSubToolPaletteCategoryById(
  categoryId: unknown,
): StudioSubToolPaletteCategory | null {
  return typeof categoryId === "string"
    ? CATEGORY_BY_ID.get(categoryId) ?? null
    : null;
}

/** The category tab that owns the given brush id, or null for brushes outside the palette. */
export function studioSubToolPaletteCategoryIdForBrushId(
  brushId: unknown,
): StudioSubToolPaletteCategoryId | null {
  return typeof brushId === "string"
    ? CATEGORY_ID_BY_PRESET_ID.get(brushId) ?? null
    : null;
}

/**
 * Resolves a palette row back to its core preset. Fail-closed: ids the palette does not
 * list return null even when they exist in the wider catalogue, so palette selection can
 * only ever apply what the palette actually showed.
 */
export function studioSubToolPalettePresetById(subToolId: unknown): BrushPreset | null {
  if (typeof subToolId !== "string") return null;
  if (!CATEGORY_ID_BY_PRESET_ID.has(subToolId)) return null;
  return CORE_PRESET_BY_ID.get(subToolId) ?? null;
}
