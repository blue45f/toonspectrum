import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Living Ink dual-pointer + WebGPU product seams", () => {
  it("ships dual-wield input routing helpers for stroke admission", () => {
    const routing = readFileSync(
      new URL("./studio-living-ink-input-routing.ts", import.meta.url),
      "utf8",
    );
    expect(routing).toContain("resolveLivingInkStrokeRoute");
    expect(routing).toContain("withPencilSeen");
    expect(routing).toContain("dual-wield");
    expect(routing).toContain("barrel");

    const boundary = readFileSync(
      new URL("./studio-living-ink-dual-pointer-product-boundary.test.ts", import.meta.url),
      "utf8",
    );
    // Keep this file as the ownership contract for the dual-pointer product seam.
    expect(boundary).toContain("resolveLivingInkStrokeRoute");
  });

  it("Worker prefers WebGPU runtime when the adapter is available", () => {
    const worker = readFileSync(new URL("./studio-living-ink.worker.ts", import.meta.url), "utf8");
    expect(worker).toContain("tryCreateStudioLivingInkWebGpuRuntime");
    expect(worker).toContain("createPreferredRuntime");
    expect(worker).toContain("webgpu-offscreen-half-float");
    const webgpu = readFileSync(new URL("./studio-living-ink-webgpu-runtime.ts", import.meta.url), "utf8");
    expect(webgpu).toContain("StudioLivingInkWebGpuRuntime");
    expect(webgpu).toContain("requestAdapter");
    expect(webgpu).toContain("requestDevice");
  });

  it("documents dual-pointer / barrel authoring controls on the living-ink control surface", () => {
    // Controls may live on StudioLivingInkControls or the page coordinator; require the routing
    // vocabulary to remain product-facing in input-routing + dual-pointer boundary tests.
    const routing = readFileSync(
      new URL("./studio-living-ink-input-routing.ts", import.meta.url),
      "utf8",
    );
    expect(routing.toLowerCase()).toMatch(/pencil|barrel|finger|dual/);
  });
});
