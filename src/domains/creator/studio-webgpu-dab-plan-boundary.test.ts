import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("studio WebGPU dab-plan ownership boundary", () => {
  it("keeps the shared contract type-only and renderer-neutral", () => {
    const contract = source("./studio-webgpu-dab-plan-contract.ts");

    expect(contract).toContain('import type { StudioGpuComposite } from "./studio-webgpu-stroke"');
    expect(contract).not.toMatch(/\b(?:HTMLCanvasElement|CanvasRenderingContext2D|OffscreenCanvas)\b/u);
    expect(contract).not.toMatch(/\b(?:GPUDevice|GPUBuffer|GPUTexture|GPUCanvasContext)\b/u);
    expect(contract).not.toMatch(/\b(?:Konva|React|useEffect|useState)\b/u);
    expect(contract).not.toContain("studio-webgpu-engine");
    expect(contract).not.toContain("studio-webgpu-tile-compositor");
    expect(contract.split("\n").length).toBeLessThanOrEqual(80);
  });

  it("removes the tiled compositor's type back-edge into the engine", () => {
    const engine = source("./studio-webgpu-engine.ts");
    const compositor = source("./studio-webgpu-tile-compositor.ts");

    expect(engine).toContain('from "./studio-webgpu-dab-plan-contract"');
    expect(engine).toMatch(
      /export type \{[\s\S]*PlannedStudioGpuDabs[\s\S]*\} from "\.\/studio-webgpu-dab-plan-contract"/u
    );
    expect(compositor).toContain('from "./studio-webgpu-dab-plan-contract"');
    expect(compositor).not.toContain('from "./studio-webgpu-engine"');
  });
});
