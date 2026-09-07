import type { StudioInspectorContentMode } from "./studio-inspector-interaction-policy";
import type { StudioInspectorLayout } from "./studio-inspector-layout";

export type { StudioInspectorContentMode } from "./studio-inspector-interaction-policy";

export interface StudioInspectorContextSnapshot {
  readonly contentMode: StudioInspectorContentMode;
  readonly selectedType: string | null;
}

const IMAGE_INSPECTOR_SELECTION_TYPES = new Set(["image", "draw"]);

/** True only when the current selection can actually present the five image-tool subtabs. */
export function studioInspectorContextUsesImageTabs(
  context: StudioInspectorContextSnapshot | null,
): boolean {
  return Boolean(
    context
    && context.contentMode === "selection"
    && context.selectedType
    && IMAGE_INSPECTOR_SELECTION_TYPES.has(context.selectedType),
  );
}

/**
 * Image-tool navigation is contextual, not a global workspace preference.
 *
 * Keeping `retouch` or `mask` in the persisted layout is useful while an artist moves between
 * image layers of the same kind. It becomes misleading after text, drawing-tool or empty-canvas
 * work: the next image selection would reopen on an old specialist tab with no explanation.
 * Entering a new image-capable context therefore starts at Quick, while same-type image-to-image
 * selection preserves the artist's local workflow. Merely visiting another inspector primary tab
 * does not reset the subtab while the same image selection remains active.
 */
export function resolveStudioInspectorContextRoute(
  layout: StudioInspectorLayout,
  previous: StudioInspectorContextSnapshot | null,
  next: StudioInspectorContextSnapshot,
  activeImageTool?: StudioInspectorLayout["image"] | null,
): StudioInspectorLayout {
  if (!studioInspectorContextUsesImageTabs(next)) return layout;

  // A tool entry can select its raster target in the same render. Its active panel is an
  // explicit command, so it takes precedence over resetting a stale workspace preference.
  if (activeImageTool) {
    return layout.primary === "properties" && layout.image === activeImageTool
      ? layout
      : { ...layout, primary: "properties", image: activeImageTool };
  }

  const enteringNewImageContext =
    previous === null
    || !studioInspectorContextUsesImageTabs(previous)
    || previous.selectedType !== next.selectedType;

  if (!enteringNewImageContext || layout.image === "quick") return layout;
  return { ...layout, image: "quick" };
}
