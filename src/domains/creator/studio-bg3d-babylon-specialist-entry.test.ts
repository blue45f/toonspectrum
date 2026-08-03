import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME } from
  "./studio-bg3d-babylon-specialist-entry";

describe("Babylon specialist context-loss ownership", () => {
  it("uses the Toon runtime as the single recovery owner", () => {
    expect(STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME).toBe(true);
  });
});
