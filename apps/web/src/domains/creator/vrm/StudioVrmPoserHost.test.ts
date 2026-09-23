import { describe, expect, it, vi } from "vitest";

import { readStudioVrmPoserShaperSurface, type StudioVrmPoserHost } from "./StudioVrmPoserHost";

describe("readStudioVrmPoserShaperSurface", () => {
  it("exposes typed shaper methods and drops non-functions", () => {
    const applyHandPosePreset = vi.fn();
    const host = {
      applyHandPosePreset,
      handlePoseSelect: "nope",
      setBodyRotation: (n: number) => n,
      unrelated: 1,
    } as unknown as StudioVrmPoserHost;

    const surface = readStudioVrmPoserShaperSurface(host);
    expect(surface.applyHandPosePreset).toBeTypeOf("function");
    expect(surface.handlePoseSelect).toBeUndefined();
    expect(surface.setBodyRotation?.(0.5)).toBe(0.5);
    surface.applyHandPosePreset?.("left", "fist");
    expect(applyHandPosePreset).toHaveBeenCalledWith("left", "fist");
  });
});
