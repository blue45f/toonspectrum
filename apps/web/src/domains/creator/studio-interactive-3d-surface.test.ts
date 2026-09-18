import { describe, expect, it } from "vitest";

import { resolveStudioInteractiveThreeDSurfaceAdmission } from "./studio-interactive-3d-surface";

describe("Studio interactive 3D surface admission", () => {
  it("rejects every legacy renderer in the same render that a DCC route takes ownership", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      characterShaperOpen: true,
      dccRouteRequested: true,
      mannequinPoserOpen: true,
      poserVrmOpen: true,
      routedSurface: "bg3d",
    })).toEqual({
      bg3dOpen: false,
      characterShaperOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });

  it("preserves legacy surface state while the canvas route owns presentation", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      characterShaperOpen: false,
      dccRouteRequested: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
      routedSurface: "canvas",
    })).toEqual({
      bg3dOpen: true,
      characterShaperOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });

  it("lets the Character Shaper win over the legacy poser before a routed owner commits", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: false,
      characterShaperOpen: true,
      dccRouteRequested: false,
      mannequinPoserOpen: false,
      poserVrmOpen: true,
      routedSurface: "canvas",
    })).toEqual({
      bg3dOpen: false,
      characterShaperOpen: true,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });

  it("lets the poser route take renderer ownership while stale Character Shaper state retires", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: false,
      characterShaperOpen: true,
      dccRouteRequested: false,
      mannequinPoserOpen: true,
      poserVrmOpen: true,
      routedSurface: "poser",
    })).toEqual({
      bg3dOpen: false,
      characterShaperOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: true,
    });
  });

  it("gives the route-less mannequin exclusive ownership while its canvas transition commits", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      characterShaperOpen: true,
      dccRouteRequested: false,
      mannequinPoserOpen: true,
      poserVrmOpen: true,
      routedSurface: "canvas",
    })).toEqual({
      bg3dOpen: false,
      characterShaperOpen: false,
      mannequinPoserOpen: true,
      poserVrmOpen: false,
    });
  });

  it("lets the BG3D route own the only renderer during a 3D-to-3D transition", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      characterShaperOpen: false,
      dccRouteRequested: false,
      mannequinPoserOpen: true,
      poserVrmOpen: true,
      routedSurface: "bg3d",
    })).toEqual({
      bg3dOpen: true,
      characterShaperOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });
});
