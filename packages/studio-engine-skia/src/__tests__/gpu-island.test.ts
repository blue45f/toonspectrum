import { describe, expect, it } from "vitest";

import { createSkiaGpuIslandBackend } from "../gpu-island";

describe("Skia GPU island", () => {
  it("refuses interactive CPU readback when WebGL island adoption is missing", async () => {
    const backend = createSkiaGpuIslandBackend();
    const result = await backend.render({
      islandId: "mask-1",
      width: 64,
      height: 64,
      revision: 1,
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).not.toContain("readPixels");
    }
    backend.dispose();
  });
});
