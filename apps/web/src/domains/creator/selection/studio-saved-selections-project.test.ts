import { describe, expect, it } from "vitest";
import { buildStudioProjectArchive, importStudioProjectArchive } from "../studio-project-archive";
import { parseStudioProjectFile } from "../studio-project-file";
import { EMPTY_STUDIO_SAVED_SELECTION_LIBRARY, upsertStudioSavedSelection } from "../studio-saved-selections";
import { exactSelectionFromMask } from "./studio-selection-exact-mask";

function project() {
  const mask = { width: 2560, height: 1280, alpha: new Uint8ClampedArray(2560 * 1280) };
  mask.alpha[500 * 2560 + 1500] = 255;
  const selection = exactSelectionFromMask(mask);
  if (!selection) throw new Error("선택 fixture 생성 실패");
  let savedSelections = EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  for (let index = 0; index < 17; index += 1) savedSelections = upsertStudioSavedSelection(savedSelections,
    { id: `saved-${index}`, name: "선택", selection, now: index });
  return { version: 2, pagesList: [{ id: "page-1", bg: "#fff", bgGrad: null, canvasH: 1280,
    elements: [{ id: "image-1", type: "image", src: "", x: 0, y: 0, width: 2560, height: 1280, rotation: 0, savedSelections }] }] };
}

describe("작품에 포함되는 저장 선택", () => {
  it("다른 기기 저장소 없이 프로젝트 아카이브에서 17개 이름과 원본 1px 선택을 복원한다", async () => {
    const original = project();
    const archive = await buildStudioProjectArchive({ project: original }, { crc32ExecutionMode: "direct-headless" });
    const reopened = await importStudioProjectArchive(archive.blob);
    expect(reopened.project.pagesList[0]?.elements).toEqual(original.pagesList[0]?.elements);
    expect(original.pagesList[0]?.elements[0]?.savedSelections.items).toHaveLength(17);
  });
  it("손상된 저장 선택은 가져오기 중에 조용히 삭제하지 않는다", () => {
    const invalid = project();
    Object.assign(invalid.pagesList[0]!.elements[0]!.savedSelections, { items: [{ id: "bad", name: "손상", selection: null }] });
    expect(() => parseStudioProjectFile(invalid)).toThrow("저장 선택");
  });
});
