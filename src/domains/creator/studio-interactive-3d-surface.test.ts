import { describe, expect, it } from "vitest";

import { resolveStudioInteractiveThreeDSurfaceAdmission } from "./studio-interactive-3d-surface";

describe("Studio interactive 3D surface admission", () => {
  it("rejects every legacy renderer in the same render that a DCC route takes ownership", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      dccRouteRequested: true,
      mannequinPoserOpen: true,
      poserVrmOpen: true,
    })).toEqual({
      bg3dOpen: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });

  it("preserves legacy surface state while the canvas route owns presentation", () => {
    expect(resolveStudioInteractiveThreeDSurfaceAdmission({
      bg3dOpen: true,
      dccRouteRequested: false,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    })).toEqual({
      bg3dOpen: true,
      mannequinPoserOpen: false,
      poserVrmOpen: false,
    });
  });
});
