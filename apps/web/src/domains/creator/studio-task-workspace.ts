import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import { switchStudioWorkspace, type StudioDefaultWorkspaceId, type StudioWorkspaceState } from "./studio-workspaces";

const TASK_LAYOUTS: Partial<Record<StudioDocumentWorkspaceId, StudioDefaultWorkspaceId>> = {
  draw: "lineart", comic: "pro-comic", image: "photo-edit", design: "vector-design",
  slides: "vector-design", storyboard: "storyboard", whiteboard: "vector-design",
  animation: "animation", motion: "animation", audio: "animation",
  localization: "lettering", review: "review",
};

/** Density is a temporary presentation: changing it must not reset a customized layout. */
export function studioTaskWorkspaceId(
  workspace: StudioDocumentWorkspaceId | null,
): StudioDefaultWorkspaceId | null {
  return workspace ? TASK_LAYOUTS[workspace] ?? null : null;
}

/** UI only. Preserve explicit custom workspaces and edits to the already-selected profile. */
export function applyStudioTaskWorkspace(
  state: StudioWorkspaceState,
  workspaceId: StudioDefaultWorkspaceId | null | undefined,
): StudioWorkspaceState {
  if (!workspaceId || state.activeWorkspaceId === workspaceId
    || state.customWorkspaces.some((workspace) => workspace.id === state.activeWorkspaceId)) return state;
  return switchStudioWorkspace(state, workspaceId);
}
