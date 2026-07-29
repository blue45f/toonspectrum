import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Studio Hokusai product boundary", () => {
  const source = readFileSync(
    new URL("./studio-hokusai-natural-media-product.ts", import.meta.url),
    "utf8",
  );

  it("keeps the Hokusai runtime behind a literal module Worker boundary", () => {
    expect(source).toContain(
      'new URL("./studio-hokusai-natural-media.worker.ts", import.meta.url)',
    );
    expect(source).toContain('{ type: "module", name: "studio-hokusai-natural-media" }');
    expect(source).not.toContain("studio_hokusai_wasm.js");
    expect(source).not.toContain("new OffscreenCanvas");
  });

  it("verifies PNG SHA-256 before producing a canonical insertion source", () => {
    expect(source).toContain("hashPng(result.pngBytes");
    expect(source).toContain("pngHash !== result.receipt.pngHash");
    expect(source).toContain('startsWith("data:image/png;base64,")');
  });
});
