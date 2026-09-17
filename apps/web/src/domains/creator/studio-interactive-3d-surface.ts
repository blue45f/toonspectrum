export interface StudioInteractiveThreeDSurfaceState {
  readonly bg3dOpen: boolean;
  readonly characterShaperOpen: boolean;
  readonly dccRouteRequested: boolean;
  readonly mannequinPoserOpen: boolean;
  readonly poserVrmOpen: boolean;
  /** Current URL-owned Studio surface. Routed 3D surfaces are exclusive renderer owners. */
  readonly routedSurface?: string | null;
}

export interface StudioInteractiveThreeDSurfaceAdmission {
  readonly bg3dOpen: boolean;
  readonly characterShaperOpen: boolean;
  readonly mannequinPoserOpen: boolean;
  readonly poserVrmOpen: boolean;
}

const CLOSED_INTERACTIVE_3D_SURFACES: StudioInteractiveThreeDSurfaceAdmission = Object.freeze({
  bg3dOpen: false,
  characterShaperOpen: false,
  mannequinPoserOpen: false,
  poserVrmOpen: false,
});

function admitOnly(
  target: "bg3d" | "character" | "poser",
  state: Pick<
    StudioInteractiveThreeDSurfaceState,
    "bg3dOpen" | "characterShaperOpen" | "poserVrmOpen"
  >,
): StudioInteractiveThreeDSurfaceAdmission {
  return {
    bg3dOpen: target === "bg3d" && state.bg3dOpen,
    characterShaperOpen: target === "character" && state.characterShaperOpen,
    mannequinPoserOpen: false,
    poserVrmOpen: target === "poser" && state.poserVrmOpen,
  };
}

/**
 * Admits interactive 3D surfaces before render. A layout-effect cleanup is too late because
 * mounted WebGL children may already acquire a device or register their focus boundary.
 *
 * URL-owned BG3D/poser/character surfaces are mutually exclusive. During 3D→3D navigation React
 * can briefly carry both the old and new open state; routing decides which renderer is allowed
 * until the route-sync effect retires the stale state.
 */
export function resolveStudioInteractiveThreeDSurfaceAdmission({
  bg3dOpen,
  characterShaperOpen,
  dccRouteRequested,
  mannequinPoserOpen,
  poserVrmOpen,
  routedSurface,
}: StudioInteractiveThreeDSurfaceState): StudioInteractiveThreeDSurfaceAdmission {
  if (dccRouteRequested) return CLOSED_INTERACTIVE_3D_SURFACES;

  if (routedSurface === "bg3d" || routedSurface === "character" || routedSurface === "poser") {
    return admitOnly(routedSurface, {
      bg3dOpen,
      characterShaperOpen,
      poserVrmOpen,
    });
  }

  // Canvas and non-3D routes retain the legacy modal behavior while a route upgrade is pending.
  // Character Shaper and the legacy poser share the same VRM runtime, so Shaper remains the
  // deterministic winner if stale state exists outside a routed 3D surface.
  return {
    bg3dOpen,
    characterShaperOpen,
    mannequinPoserOpen,
    poserVrmOpen: poserVrmOpen && !characterShaperOpen,
  };
}
