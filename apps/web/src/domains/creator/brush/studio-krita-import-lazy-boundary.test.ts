import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importStudioKritaBundleBytes } from "./studio-brush-pack-import";

describe("optional Krita bundle parser admission", () => {
  it("does not eagerly import the archive parser through the editor's brush metadata", () => {
    const source = readFileSync(new URL("./studio-brush-pack-import.ts", import.meta.url), "utf8");
    expect(source).toContain('await import("../../../../../../packages/studio-format-gateway/src/krita-bundle")');
    const imports = [...source.matchAll(/import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gu)];
    expect(imports.filter((item) => item[1]?.endsWith("/krita-bundle"))).toEqual([]);
  });
  it("imports project-graph compatibility data through the focused gateway contract", () => {
    const source = readFileSync(new URL("../project-graph/studio-project-graph-contract.ts", import.meta.url), "utf8");
    expect(source).toContain('from "@toonspectrum/studio-format-gateway/compatibility-report"');
    expect(source).not.toContain('from "@toonspectrum/studio-format-gateway"');
  });
  it("rejects an already cancelled direct bundle request without reading corrupt bytes", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(importStudioKritaBundleBytes(new Uint8Array([0, 1]), { signal: controller.signal }))
      .rejects.toMatchObject({ name: "StudioBrushProgramImportError", format: "bundle" });
  });
});
