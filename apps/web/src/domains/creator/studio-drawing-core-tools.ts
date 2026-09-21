import type { StudioRailToolId } from "./studio-app-settings";

/** Safe first-run recommendations. Explicit user configurations may hide these tools. */
export const STUDIO_DRAWING_CORE_TOOL_IDS: readonly StudioRailToolId[] = Object.freeze([
  "select", "transform", "pen", "eraser", "fill", "marquee-rect", "lasso",
]);

export function isStudioDrawingCoreTool(id: StudioRailToolId): boolean {
  return STUDIO_DRAWING_CORE_TOOL_IDS.includes(id);
}

/** Recommendations never overwrite a saved, explicit configuration. */
export function studioDrawingVisibleTools(
  visible: readonly StudioRailToolId[],
  configured = false,
): StudioRailToolId[] {
  return [...new Set(configured ? visible : [...visible, ...STUDIO_DRAWING_CORE_TOOL_IDS])];
}
