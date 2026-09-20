import type { StudioRailToolId } from "./studio-app-settings";

/** Core authoring commands are discoverable regardless of a historical minimal toolbar. */
export const STUDIO_DRAWING_CORE_TOOL_IDS: readonly StudioRailToolId[] = Object.freeze([
  "select", "transform", "pen", "eraser", "fill", "marquee-rect", "lasso",
]);

export function isStudioDrawingCoreTool(id: StudioRailToolId): boolean {
  return STUDIO_DRAWING_CORE_TOOL_IDS.includes(id);
}

/** Projection only: opening settings never overwrites the stored toolbar. */
export function studioDrawingVisibleTools(visible: readonly StudioRailToolId[]): StudioRailToolId[] {
  return [...new Set([...visible, ...STUDIO_DRAWING_CORE_TOOL_IDS])];
}
