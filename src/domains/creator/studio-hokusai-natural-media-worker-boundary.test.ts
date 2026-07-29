import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Studio Hokusai Worker boundary", () => {
  const source = readFileSync(
    new URL("./studio-hokusai-natural-media.worker.ts", import.meta.url),
    "utf8",
  );
  const presetSource = readFileSync(
    new URL("./studio-hokusai-natural-media-presets.ts", import.meta.url),
    "utf8",
  );

  it("loads the pinned local WASM adapter only inside a Dedicated Worker", () => {
    expect(source).toContain(
      "../../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js",
    );
    expect(source).toContain('scopeName !== "DedicatedWorkerGlobalScope"');
    expect(source).toContain("typeof WebAssembly");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("window.");
  });

  it("uses transparent RGBA, dirty bounds, one-shot requests and PNG transfer", () => {
    expect(source).toContain("canvas.dirtyBounds()");
    expect(source).toContain("canvas.fullFrame()");
    expect(source).toContain("requestAccepted");
    expect(source).toContain("studioHokusaiWorkerResultTransfers");
    expect(source).toContain("transparentRgba: true");
    expect(source).toContain("dirtyTiles: true");
    expect(source).toContain("mainThreadFallback: false");
  });

  it("transfers a full-span PNG buffer without another maximum-size copy", () => {
    expect(source).toContain("output.pngBytes.byteOffset === 0");
    expect(source).toContain(
      "output.pngBytes.byteLength === output.pngBytes.buffer.byteLength",
    );
    expect(source).toContain("? output.pngBytes.buffer");
    expect(source).toContain(": output.pngBytes.slice().buffer as ArrayBuffer");
    expect(source).not.toContain(
      "new ArrayBuffer(output.pngBytes.byteLength)",
    );
  });

  it("uses the canonical libmypaint spectral-pigment setting for oil", () => {
    expect(presetSource).toContain("paint_mode: setting(0.82)");
    expect(presetSource).not.toMatch(/\bpaint:\s*setting\(/u);
  });

  it("keeps the marker responsive to pressure for both coverage and width", () => {
    expect(presetSource).toContain(
      "pressure: [[0, -0.24], [0.25, -0.1], [0.65, 0.02], [1, 0.08]]",
    );
    expect(presetSource).toContain(
      "pressure: [[0, -0.22], [0.45, -0.04], [1, 0.18]]",
    );
  });
});
