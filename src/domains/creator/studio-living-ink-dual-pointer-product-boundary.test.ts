import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Living Ink dual-pointer + WebGPU product seams", () => {
  it("StudioPage admits strokes through dual-wield input routing", () => {
    const page = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
    expect(page).toContain("resolveLivingInkStrokeRoute");
    expect(page).toContain("withPencilSeen");
    expect(page).toContain("livingInkForceTouchRef");
    expect(page).toContain("webkitmouseforcechanged");
    expect(page).toContain("route.mode");
    expect(page).toContain("dual-wield");
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

  it("controls document dual-pointer / barrel behaviour for authors", () => {
    const controls = readFileSync(new URL("./StudioLivingInkControls.tsx", import.meta.url), "utf8");
    expect(controls).toContain("손가락");
    expect(controls).toContain("배럴");
    expect(controls).toContain("Apple Pencil");
  });
});
