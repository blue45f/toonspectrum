import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import type { StudioUiDensityMode } from "./studio-ui-density";
import { switchStudioWorkspace, type StudioDefaultWorkspaceId, type StudioWorkspaceState } from "./studio-workspaces";

const TASK_LAYOUTS: Partial<Record<StudioDocumentWorkspaceId, StudioDefaultWorkspaceId>> = {
  draw: "lineart", comic: "pro-comic", image: "photo-edit", design: "vector-design",
  slides: "vector-design", storyboard: "storyboard", whiteboard: "vector-design",
  animation: "animation", motion: "animation", audio: "animation",
  localization: "lettering", review: "review",
};

export function studioTaskWorkspaceId(
  workspace: StudioDocumentWorkspaceId | null,
  density: StudioUiDensityMode,
): StudioDefaultWorkspaceId | null {
  if (!workspace) return null;
  if (density === "focus" && ["draw", "comic", "image", "design"].includes(workspace)) return "quick-sketch";
  return TASK_LAYOUTS[workspace] ?? null;
}

/** Layout only: no pages, strokes, history, dimensions or document mutators. */
export function applyStudioTaskWorkspace(
  state: StudioWorkspaceState,
  workspaceId: StudioDefaultWorkspaceId | null | undefined,
): StudioWorkspaceState {
  const customWorkspaceActive = state.customWorkspaces.some(
    (workspace) => workspace.id === state.activeWorkspaceId,
  );
  return !workspaceId || state.activeWorkspaceId === workspaceId || customWorkspaceActive
    ? state
    : switchStudioWorkspace(state, workspaceId);
}
