import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("StudioPage R8 grain hydration boundary", () => {
  it("owns, observes, subscribes, projects, and disposes the verified grain lifecycle", () => {
    expect(source).toContain("new StudioBrushR8GrainHydrator()");
    expect(source).toContain("studioBrushR8GrainHydrator.subscribe");
    expect(source).toContain("studioBrushR8GrainHydrator.getVersion");
    expect(source).toContain("studioBrushR8GrainHydrator.observe(");
    expect(source).toContain("authorizedWorkAssetScopeId,");
    expect(source).toContain("collectStudioBrushR8GrainSources({");
    expect(source).toContain("currentPages: pages");
    expect(source).toContain("history: pagesHistory");
    expect(source).toContain("extraElements: master.elements");
    expect(source).toContain(
      "projectStudioBrushR8GrainRenderElements(\n      elements,\n      studioBrushR8GrainHydrationRevision"
    );
    expect(source).toContain(
      "elements={studioBrushR8GrainRenderElements}"
    );
    expect(source).toContain("studioBrushR8GrainHydrator.dispose()");
  });
});
