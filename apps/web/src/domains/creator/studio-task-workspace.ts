import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import type { StudioUiDensityMode } from "./studio-ui-density";
import {
  STUDIO_DEFAULT_WORKSPACE_IDS,
  switchStudioWorkspace,
  type StudioDefaultWorkspaceId,
  type StudioWorkspaceState,
} from "./studio-workspaces";

const TASK_LAYOUTS: Partial<Record<StudioDocumentWorkspaceId, StudioDefaultWorkspaceId>> = {
  draw: "lineart", comic: "pro-comic", image: "photo-edit", design: "vector-design",
  slides: "vector-design", storyboard: "storyboard", whiteboard: "vector-design",
  animation: "animation", motion: "animation", audio: "animation",
  localization: "lettering", review: "review",
};
const DEFAULT_WORKSPACE_IDS = new Set<string>(STUDIO_DEFAULT_WORKSPACE_IDS);

export function studioRoleWorkspaceId(
  search?: string | URLSearchParams | null,
): StudioDefaultWorkspaceId | null {
  const source = search ?? (
    typeof globalThis.location === "object"
      ? globalThis.location.search
      : ""
  );
  const params = source instanceof URLSearchParams
    ? source
    : new URLSearchParams(source);
  const values = params.getAll("roleWorkspace");
  if (values.length !== 1 || !DEFAULT_WORKSPACE_IDS.has(values[0] ?? "")) return null;
  return values[0] as StudioDefaultWorkspaceId;
}

export function studioTaskWorkspaceId(
  workspace: StudioDocumentWorkspaceId | null,
  density: StudioUiDensityMode,
  search?: string | URLSearchParams | null,
): StudioDefaultWorkspaceId | null {
  const roleWorkspace = studioRoleWorkspaceId(search);
  if (roleWorkspace) return roleWorkspace;
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
