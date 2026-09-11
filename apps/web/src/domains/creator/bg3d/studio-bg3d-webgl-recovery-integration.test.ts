import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridgeSource = readFileSync(
  new URL("./StudioBg3dCaptureBridge.tsx", import.meta.url),
  "utf8",
);

describe("BG3D primary WebGL recovery wiring", () => {
  it("owns unplanned context loss from the R3F capture bridge", () => {
    expect(bridgeSource).toContain(
      "installStudioBg3dWebglContextRecovery(canvas",
    );
    expect(bridgeSource).toContain("renderer.isWebGPURenderer === true");
    expect(bridgeSource).toContain(
      "resetRendererAfterContextRestore(renderer)",
    );
    expect(bridgeSource).toContain("currentDpr * 0.75");
    expect(bridgeSource).toContain(
      "STUDIO_BG3D_WEBGL_RECOVERY_EVENT",
    );
  });
});
