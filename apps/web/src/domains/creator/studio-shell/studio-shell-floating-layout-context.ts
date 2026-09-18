import { createContext, useContext } from "react";

import {
  DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
  STUDIO_SHELL_FLOATING_SURFACE_IDS,
  type StudioShellFloatingPresetId,
  type StudioShellFloatingSurfaceId,
  type StudioShellFloatingVisibilityId,
  type StudioShellFloatingVisibilityState,
} from "./studio-shell-floating-layout";

import type {
  StudioShellFloatingVisibilityPersistenceFailure,
} from "./studio-shell-floating-visibility-sqlite";

export type StudioShellFloatingVisibilityAuthority =
  | "checking"
  | "sqlite-opfs"
  | "session-only";

export interface StudioShellFloatingLayoutRuntime {
  readonly visibility: StudioShellFloatingVisibilityState;
  readonly autoHideWhileDrawing: boolean;
  readonly drawingAutoHideActive: boolean;
  readonly focusModeActive: boolean;
  readonly mountedSurfaceIds: readonly StudioShellFloatingSurfaceId[];
  readonly authority: StudioShellFloatingVisibilityAuthority;
  readonly failure:
    | StudioShellFloatingVisibilityPersistenceFailure
    | "storage-unavailable"
    | null;
  readonly resetRevisions: Readonly<Record<StudioShellFloatingSurfaceId, number>>;
  readonly isVisible: (id: StudioShellFloatingVisibilityId) => boolean;
  readonly isConfiguredVisible: (id: StudioShellFloatingVisibilityId) => boolean;
  readonly isSurfaceMounted: (id: StudioShellFloatingSurfaceId) => boolean;
  readonly setSurfaceMounted: (id: StudioShellFloatingSurfaceId, mounted: boolean) => void;
  readonly setVisible: (id: StudioShellFloatingVisibilityId, visible: boolean) => void;
  readonly toggleVisible: (id: StudioShellFloatingVisibilityId) => void;
  readonly setAutoHideWhileDrawing: (enabled: boolean) => void;
  readonly enterFocusMode: () => void;
  readonly exitFocusMode: () => void;
  readonly applyPreset: (preset: StudioShellFloatingPresetId) => void;
  readonly showAll: () => void;
  readonly hideAll: () => void;
  readonly resetSurface: (id: StudioShellFloatingSurfaceId) => void;
  readonly resetAllSurfaces: () => void;
}

export function createStudioShellFloatingResetRevisions(
): Record<StudioShellFloatingSurfaceId, number> {
  return Object.fromEntries(
    STUDIO_SHELL_FLOATING_SURFACE_IDS.map((id) => [id, 0]),
  ) as Record<StudioShellFloatingSurfaceId, number>;
}

const FALLBACK_RUNTIME: StudioShellFloatingLayoutRuntime = Object.freeze({
  visibility: DEFAULT_STUDIO_SHELL_FLOATING_VISIBILITY,
  autoHideWhileDrawing: false,
  drawingAutoHideActive: false,
  focusModeActive: false,
  mountedSurfaceIds: Object.freeze([]),
  authority: "session-only" as const,
  failure: null,
  resetRevisions: Object.freeze(createStudioShellFloatingResetRevisions()),
  isVisible: () => true,
  isConfiguredVisible: () => true,
  isSurfaceMounted: () => false,
  setSurfaceMounted: () => undefined,
  setVisible: () => undefined,
  toggleVisible: () => undefined,
  setAutoHideWhileDrawing: () => undefined,
  enterFocusMode: () => undefined,
  exitFocusMode: () => undefined,
  applyPreset: () => undefined,
  showAll: () => undefined,
  hideAll: () => undefined,
  resetSurface: () => undefined,
  resetAllSurfaces: () => undefined,
});

export const StudioShellFloatingLayoutContext =
  createContext<StudioShellFloatingLayoutRuntime>(FALLBACK_RUNTIME);

export function useStudioShellFloatingLayout(): StudioShellFloatingLayoutRuntime {
  return useContext(StudioShellFloatingLayoutContext);
}
