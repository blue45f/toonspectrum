export interface StudioInteractiveThreeDSurfaceState {
  readonly bg3dOpen: boolean;
  readonly dccRouteRequested: boolean;
  readonly mannequinPoserOpen: boolean;
  readonly poserVrmOpen: boolean;
}

export interface StudioInteractiveThreeDSurfaceAdmission {
  readonly bg3dOpen: boolean;
  readonly mannequinPoserOpen: boolean;
  readonly poserVrmOpen: boolean;
}

/**
 * Admits legacy modal 3D surfaces before render. A layout-effect cleanup is too late because
 * mounted WebGL children may already acquire a device or register their focus boundary.
 */
export function resolveStudioInteractiveThreeDSurfaceAdmission({
  bg3dOpen,
  dccRouteRequested,
  mannequinPoserOpen,
  poserVrmOpen,
}: StudioInteractiveThreeDSurfaceState): StudioInteractiveThreeDSurfaceAdmission {
  if (dccRouteRequested) {
    return {
      bg3dOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    };
  }
  return { bg3dOpen, mannequinPoserOpen, poserVrmOpen };
}
