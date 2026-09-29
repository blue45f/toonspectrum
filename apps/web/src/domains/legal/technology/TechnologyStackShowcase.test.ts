import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SHOWCASE_SOURCE =
  "apps/web/src/domains/legal/technology/TechnologyStackShowcase.tsx";
const PAGE_SOURCE = "apps/web/src/domains/legal/TechnologyPage.tsx";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("technology stack showcase", () => {
  it("is embedded in the technology page", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("TechnologyStackShowcase");
  });

  it("offers four accessible tabs for renderer, 3D, VRM and AI", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("ArrowRight");
    for (const label of ["렌더러", "캐릭터(VRM)", "AI"]) {
      expect(source).toContain(label);
    }
  });

  it("explains the renderer registry with a pipeline diagram and comparison table", () => {
    const source = readSource(SHOWCASE_SOURCE);
    for (const name of ["CanvasKit (Skia)", "Vello", "ThorVG", "Canvas2D"]) {
      expect(source).toContain(name);
    }
    expect(source).toContain("렌더러 비교표");
    expect(source).toContain("빠른 미리보기");
    expect(source).toContain("타일 커밋");
  });

  it("covers 3D, VRM and AI with non-expert explanations", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain("Three.js");
    expect(source).toContain("React Three Fiber");
    expect(source).toContain("신체 설계도");
    expect(source).toContain("Studio Credit");
    expect(source).toContain("BYOK");
  });

  it("respects reduced motion and links to the evidence-heavy story", () => {
    const source = readSource(SHOWCASE_SOURCE);
    expect(source).toContain("motion-reduce");
    expect(source).toContain('href="/about/technology/story"');
  });
});
