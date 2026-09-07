import { describe, expect, it } from "vitest";

import { captureLayerComp } from "./layer/studio-layer-comps";
import { parseStudioLayerComps } from "./layer/studio-layer-comps-document";
import { studioPageToCrdtPage } from "./live/studio-crdt-page-payload";
import { STUDIO_CRDT_PAGE_MAX_BYTES } from "./live/studio-crdt-scene-schema";
import { parseStudioProjectFile, serializeStudioProjectFile } from "./studio-project-file";

function pageWithComp(layerCount: number) {
  return {
    id: "page-1", bg: "#fff", bgGrad: null, canvasH: 1080, elements: [],
    note: "한글 페이지 메모: \"인용\" \\ 줄바꿈\n",
    layerComps: [captureLayerComp("표시 상태", Array.from({ length: layerCount }, (_, index) => ({
      id: `layer-${index}`, visible: true, opacity: 0.8, blendMode: "multiply",
    })), "comp-1", 1000)],
  };
}

function project(page: object) {
  return { version: 2, pagesList: [page] };
}

describe("project layer comp wire admission", () => {
  it.each([parseStudioProjectFile, serializeStudioProjectFile])(
    "rejects a shape-valid oversized preset before accepting or exporting the project (%#)",
    (accept) => {
      const page = pageWithComp(96);
      const input = project(page);
      const original = structuredClone(input);
      expect(parseStudioLayerComps(page.layerComps)).not.toBeNull();
      expect(() => studioPageToCrdtPage(page)).toThrow();
      expect(() => accept(input)).toThrow(/콤프.*범위/);
      expect(input).toEqual(original);
    },
  );

  it("round-trips the exact aggregate UTF-8 limit and rejects one extra byte", () => {
    const page = pageWithComp(20);
    const bytes = new TextEncoder().encode(JSON.stringify(studioPageToCrdtPage(page).payload)).byteLength;
    page.note += "x".repeat(STUDIO_CRDT_PAGE_MAX_BYTES - bytes);
    expect(new TextEncoder().encode(JSON.stringify(studioPageToCrdtPage(page).payload)).byteLength)
      .toBe(STUDIO_CRDT_PAGE_MAX_BYTES);
    const restored = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(project(page))));
    expect(restored.pagesList[0]).toMatchObject(page);
    const overBudget = { ...page, note: `${page.note}x` };
    expect(() => studioPageToCrdtPage(overBudget)).toThrow();
    expect(() => parseStudioProjectFile(project(overBudget))).toThrow(/콤프.*범위/);
  });

  it("preserves the existing import scope for legacy pages without presets", () => {
    const { layerComps: _unused, ...page } = pageWithComp(0);
    page.note = "x".repeat(9000);
    expect(parseStudioProjectFile(project(page)).pagesList[0].note).toBe(page.note);
  });
});
