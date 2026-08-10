import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createStudioVelloCpuReferenceBackend,
  lowerStudioSceneOverlaysToVelloIsland,
  STUDIO_VELLO_CPU_BACKEND_ID,
} from "./studio-vello-hub";

beforeAll(async () => {
  await loadVelloNode();
});

describe("VelloHub real CPU vertical slice", () => {
  it("renders the lowered product selection island deterministically with real vello_cpu wasm", async () => {
    const admission = lowerStudioSceneOverlaysToVelloIsland(
      [
        {
          documentId: "real-selection",
          zIndex: 0,
          fill: { color: 0x2563eb, alpha: 0.2 },
          stroke: { color: 0x2563eb, alpha: 1, width: 2 },
          shape: {
            kind: "rect",
            bounds: { x: 8, y: 8, width: 40, height: 32 },
          },
        },
      ],
      { width: 64, height: 64, dpr: 1 },
    );
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) return;

    const backend = createStudioVelloCpuReferenceBackend();
    const first = await backend.render(admission.island.scene);
    const second = await backend.render(admission.island.scene);
    expect(first.kind).toBe("pixels");
    expect(second.kind).toBe("pixels");
    if (first.kind !== "pixels" || second.kind !== "pixels") return;
    expect(first.backendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    expect(first.pixels).toEqual(second.pixels);
    let nonTransparentPixels = 0;
    for (let index = 3; index < first.pixels.length; index += 4) {
      if ((first.pixels[index] ?? 0) > 0) nonTransparentPixels += 1;
    }
    expect(nonTransparentPixels).toBeGreaterThan(500);
    expect(nonTransparentPixels).toBeLessThan(
      admission.island.scene.width * admission.island.scene.height,
    );
  });
});
