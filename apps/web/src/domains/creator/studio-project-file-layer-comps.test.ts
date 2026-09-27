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

const pageWireBudgetMessage = "페이지 정보가 실시간 동기화 8KiB 한도를 초과했습니다.";
// 프로젝트 경계는 페이지 메타데이터 검증 오류를 감싸되 원래 크기 제한 오류를 보존한다.
const pageViewBudgetError = expect.objectContaining({
  message: "페이지 보기와 따라 그리기 설정이 저장 가능한 범위를 벗어났습니다.",
  cause: expect.objectContaining({ message: pageWireBudgetMessage }),
});

describe("project layer comp wire admission", () => {
  it.each([parseStudioProjectFile, serializeStudioProjectFile])(
    "rejects a shape-valid oversized preset before accepting or exporting the project (%#)",
    (accept) => {
      const page = pageWithComp(96);
      const input = project(page);
      const original = structuredClone(input);
      expect(parseStudioLayerComps(page.layerComps)).not.toBeNull();
      expect(() => studioPageToCrdtPage(page)).toThrow(new Error(pageWireBudgetMessage));
      expect(() => accept(input)).toThrow(pageViewBudgetError);
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
    expect(() => studioPageToCrdtPage(overBudget)).toThrow(new Error(pageWireBudgetMessage));
    expect(() => parseStudioProjectFile(project(overBudget))).toThrow(pageViewBudgetError);
    expect(() => serializeStudioProjectFile(project(overBudget))).toThrow(pageViewBudgetError);
  });

  it("preserves the existing import scope for legacy pages without presets", () => {
    const { layerComps: _unused, ...page } = pageWithComp(0);
    page.note = "x".repeat(9000);
    expect(parseStudioProjectFile(project(page)).pagesList[0].note).toBe(page.note);
  });
});
