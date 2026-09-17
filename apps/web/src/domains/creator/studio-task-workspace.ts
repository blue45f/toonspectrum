import type { StudioDocumentWorkspaceId } from "./studio-document-workspace";
import { STUDIO_MODE_PROFILES } from "./studio-mode-profiles";
import type { StudioUiDensityMode } from "./studio-ui-density";
import {
  STUDIO_DEFAULT_WORKSPACE_IDS,
  switchStudioWorkspace,
  type StudioDefaultWorkspaceId,
  type StudioWorkspaceState,
} from "./studio-workspaces";

const TASK_LAYOUTS: Partial<Record<StudioDocumentWorkspaceId, StudioDefaultWorkspaceId>> = {
  draw: STUDIO_MODE_PROFILES.illustration.document.taskWorkspace,
  comic: STUDIO_MODE_PROFILES.webtoon.document.taskWorkspace,
  image: STUDIO_MODE_PROFILES.image.document.taskWorkspace,
  design: STUDIO_MODE_PROFILES.design.document.taskWorkspace,
  slides: STUDIO_MODE_PROFILES.slides.document.taskWorkspace,
  storyboard: STUDIO_MODE_PROFILES.storyboard.document.taskWorkspace,
  whiteboard: "vector-design",
  "3d": STUDIO_MODE_PROFILES["three-d"].document.taskWorkspace,
  animation: STUDIO_MODE_PROFILES.animation.document.taskWorkspace,
  motion: STUDIO_MODE_PROFILES.animation.document.taskWorkspace,
  audio: STUDIO_MODE_PROFILES.animation.document.taskWorkspace,
  localization: "lettering",
  review: "review",
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
