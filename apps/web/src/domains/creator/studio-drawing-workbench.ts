import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  normalizeStudioWorkspaceLayout,
  saveStudioWorkspace,
  switchStudioWorkspace,
  type StudioWorkspaceState,
  type StudioWorkspaceLayout,
} from "./studio-workspaces";

/** Reset presentation only. Brush presets, documents and history are not inputs. */
export function restoreStudioDrawingWorkbenchLayout(
  previous: StudioWorkspaceLayout,
): StudioWorkspaceLayout {
  return normalizeStudioWorkspaceLayout({
    ...previous,
    inspector: { primary: "layers", image: "transform", document: "canvas" },
    desktop: {
      leftPanelOpen: false,
      rightPanelOpen: true,
      leftPanelWidth: 176,
      rightPanelWidth: 304,
    },
    drawingPalettes: {
      ...DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
      libraryDockOpen: true,
    },
    // The old per-device geometry is retained in the caller's reversible restore point.
    deviceOverrides: {},
  }, previous);
}

/** Keep a recoverable pre-reset snapshot in the existing owner-scoped workspace store. */
export function backupStudioDrawingWorkbenchLayout(
  state: StudioWorkspaceState, layout: StudioWorkspaceLayout, name: string,
): StudioWorkspaceState {
  return switchStudioWorkspace(saveStudioWorkspace(state, name, layout), state.activeWorkspaceId);
}
