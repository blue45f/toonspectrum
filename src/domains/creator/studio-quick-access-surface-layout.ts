import {
  loadStudioFloatingSurfaceLayout,
  saveStudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceStorage,
} from "./studio-floating-surface";

/**
 * Phase-one floating placement is tab-scoped. It survives palette close/reopen and reload without
 * changing the existing owner-scoped Quick Access command model. Workspace-wide durable placement
 * can later consume the same normalized layout shape during the workspace schema migration.
 */
export const STUDIO_QUICK_ACCESS_FLOATING_LAYOUT_SESSION_KEY =
  "toonspectrum:studio:quick-access-floating:v1";

export const DEFAULT_STUDIO_QUICK_ACCESS_FLOATING_LAYOUT: StudioFloatingSurfaceLayout =
  Object.freeze({
    version: 1,
    xRatio: 1,
    yRatio: 0,
    width: 336,
    height: 720,
  });

function browserSessionStorage(): StudioFloatingSurfaceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadStudioQuickAccessFloatingLayout(
  storage: StudioFloatingSurfaceStorage | null = browserSessionStorage(),
): StudioFloatingSurfaceLayout {
  return loadStudioFloatingSurfaceLayout(
    storage,
    STUDIO_QUICK_ACCESS_FLOATING_LAYOUT_SESSION_KEY,
    DEFAULT_STUDIO_QUICK_ACCESS_FLOATING_LAYOUT,
  );
}

export function saveStudioQuickAccessFloatingLayout(
  layout: StudioFloatingSurfaceLayout,
  storage: StudioFloatingSurfaceStorage | null = browserSessionStorage(),
): boolean {
  return saveStudioFloatingSurfaceLayout(
    storage,
    STUDIO_QUICK_ACCESS_FLOATING_LAYOUT_SESSION_KEY,
    layout,
  );
}
