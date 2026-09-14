import { switchStudioWorkspace } from "./studio-workspaces";
import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import type { StudioWorkspaceId, StudioWorkspaceState } from "./studio-workspaces";

/** URL workspaces select actual tool/inspector/dock profiles, not just a label. */
export function studioDocumentTaskWorkspaceId(
  workspace: StudioDocumentWorkspaceId | null | undefined,
  quick = false,
): StudioWorkspaceId | null {
  switch (workspace) {
    case "draw": return quick ? "quick-sketch" : "lineart";
    case "comic": return "pro-comic";
    case "design": case "slides": case "whiteboard": return "vector-design";
    case "image": return "photo-edit";
    case "storyboard": return "storyboard";
    case "animation": case "motion": case "audio": return "animation";
    case "localization": return "lettering";
    case "review": return "review";
    default: return null;
  }
}

/** Matching profiles retain edits; saved custom profiles and owner provenance remain intact. */
export function applyStudioDocumentTaskWorkspace(
  state: StudioWorkspaceState,
  workspaceId?: StudioWorkspaceId | null,
): StudioWorkspaceState {
  return workspaceId ? switchStudioWorkspace(state, workspaceId) : state;
}

/** Late hydration must not replace a layout already changed by the artist. */
export function hydrateStudioDocumentTaskWorkspace(
  state: StudioWorkspaceState,
  workspaceId: StudioWorkspaceId | null | undefined,
  dirtyRevision: number,
): StudioWorkspaceState {
  return dirtyRevision === 0 ? applyStudioDocumentTaskWorkspace(state, workspaceId) : state;
}
