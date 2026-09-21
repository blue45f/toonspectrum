import { DEFAULT_STUDIO_RAIL_VISIBLE_IDS, type StudioAppSettings, type StudioRailToolId } from "./studio-app-settings";
import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import type { StudioUiDensityMode } from "./studio-ui-density";

const TASK_TOOLS: Partial<Record<StudioDocumentWorkspaceId, readonly StudioRailToolId[]>> = {
  draw: ["select", "pen", "eraser", "blend", "fill", "eyedropper", "lasso", "reference", "zoom-fit"],
  comic: ["select", "pen", "eraser", "fill", "shape-rect", "text", "bubble", "image", "zoom-fit"],
  design: ["select", "transform", "shape-rect", "shape-ellipse", "text", "image", "eyedropper", "zoom-fit"],
  slides: ["select", "transform", "shape-rect", "shape-ellipse", "text", "image", "zoom-fit"],
  image: ["select", "crop", "lasso", "eraser", "dodge-burn", "liquify", "image", "eyedropper", "zoom-fit"],
  storyboard: ["select", "pen", "eraser", "text", "bubble", "image", "zoom-fit"],
  "3d": ["select", "transform", "image", "reference", "zoom-fit"],
  animation: ["select", "transform", "image", "reference", "zoom-fit"],
  motion: ["select", "transform", "image", "reference", "zoom-fit"],
  audio: ["select", "zoom-fit"],
};
const QUICK_TOOLS: readonly StudioRailToolId[] = ["select", "pen", "eraser", "fill", "eyedropper", "zoom-fit"];

/** Render projection only; stored preferences and every tool command remain intact. */
export function projectStudioTaskAppSettings(
  settings: StudioAppSettings,
  workspace: StudioDocumentWorkspaceId | null,
  density: StudioUiDensityMode,
): StudioAppSettings {
  const visible = settings.toolbar.visibleIds;
  const isDefault = visible.length === DEFAULT_STUDIO_RAIL_VISIBLE_IDS.length
    && visible.every((id, index) => id === DEFAULT_STUDIO_RAIL_VISIBLE_IDS[index]);
  // An explicitly customized toolbar wins over recommendations, including in focus mode.
  if (settings.toolbar.configured || !isDefault || !workspace || density === "full") return settings;
  const tools = density === "focus" && workspace === "draw" ? QUICK_TOOLS : TASK_TOOLS[workspace];
  if (!tools) return settings;
  return { ...settings, toolbar: { ...settings.toolbar, visibleIds: [...tools] } };
}

/** Unchanged recommendations are presentation, not a user toolbar customization. */
export function preserveStudioTaskToolbarPreference(
  stored: StudioAppSettings,
  presented: StudioAppSettings,
  next: StudioAppSettings,
): StudioAppSettings {
  const toolbar = { ...stored.toolbar, ...next.toolbar };
  const changed = toolbar.visibleIds.length !== presented.toolbar.visibleIds.length
    || toolbar.visibleIds.some((id, index) => id !== presented.toolbar.visibleIds[index])
    || toolbar.view !== presented.toolbar.view
    || toolbar.profiles !== presented.toolbar.profiles;
  if (next.toolbar.configured === true || changed) {
    return { ...next, toolbar: { ...toolbar, configured: true, version: 2 } };
  }
  return presented === stored ? { ...next, toolbar }
    : { ...next, toolbar: { ...toolbar, visibleIds: stored.toolbar.visibleIds } };
}
