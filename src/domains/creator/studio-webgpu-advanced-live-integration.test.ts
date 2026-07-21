import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("Studio advanced WebGPU live-ink integration", () => {
  it("pins only an exactly prepared advanced stroke and keeps the legacy overlay as fallback", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain('import("./studio-webgpu-live-stroke-plan")');
    expect(page).not.toContain('import { planStudioGpuLiveStroke } from "./studio-webgpu-stroke"');
    expect(page).toContain("preparedStroke: gpuStartPlan?.preparation");
    expect(page).toContain("direct: overlayDirect && gpuStartPlan !== null");
    expect(page).toContain("const direct = pixelDirect || overlayDirect || gpuPin");
    expect(page).toContain("if (overlayDirect && !gpuPin");
    expect(page).toContain('destination: "transparent-overlay"');
  });

  it("submits symmetry suffixes atomically and retains every variation through handoff", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain("handle.appendPinnedStrokeSuffixBatch({");
    expect(page).toContain("...settled.strokes");
    expect(page).toContain("...activeGpuPlan.strokes");
    expect(page).toContain("pendingGpuStrokesRef.current.length - reserved.gpu");
  });

  it("does not let a transparent GPU overlay impersonate retained-layer erasing", () => {
    const policy = source("./studio-live-ink-backend.ts");

    expect(policy).toContain('composite === "erase" && prepared.destination !== "retained-layer"');
    expect(policy).toContain('return { backend: "canvas2d", reason: "eraser" }');
  });
});
