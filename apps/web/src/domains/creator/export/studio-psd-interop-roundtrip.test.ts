import { describe, expect, it } from "vitest";
import { importPsdFile } from "../studio-psd-import";
import { groupPsdExportLayers, psdExportFolderPath } from "./studio-psd-folder-structure";
import { prepareStudioDocumentInterchangeCommit } from "../studio-document-interchange-commit";
import type { Layer, Psd } from "ag-psd";
import type { PageState } from "../studio-page-state";

const canvas = { width: 4, height: 4, toDataURL: () => "data:image/png;base64,AAAA" } as unknown as HTMLCanvasElement;
function leaf(name: string, extra: Partial<Layer> = {}): Layer {
  return { name, left: 0, top: 0, right: 4, bottom: 4, canvas, ...extra };
}
async function imported(children: Layer[], extra: Partial<Psd> = {}) {
  return importPsdFile(new File([], "original.psd"), 100, {
    readPsdImpl: () => ({ width: 100, height: 100, children, ...extra }),
  });
}
const page: PageState = { id: "page", elements: [], bg: "#fff", bgGrad: null, canvasH: 100 };

describe("PSD 편집·외관·원본 교환 계약", () => {
  it("중첩 폴더 경로와 클리핑을 보존하고 편집 후에도 z-order를 바꾸지 않는다", async () => {
    const result = await imported([{ name: "외부", children: [
      leaf("위"), { name: "내부", children: [leaf("클리핑", { clipping: true }), leaf("기준")] }, leaf("아래"),
    ] }]);
    expect(result.elements.map((element) => element.name)).toEqual(["아래", "기준", "클리핑", "위"]);
    expect(result.elements[2]?.clipBelow).toBe(true);
    expect(result.groups?.map((group) => group.name)).toEqual(["외부", "외부 / 내부", "외부"]);
    expect(result.elements[0]?.groupId).not.toBe(result.elements[3]?.groupId);
    const layers = groupPsdExportLayers(
      [...result.elements].reverse().map((element) => ({ name: element.name })), [...result.elements].reverse(),
    );
    expect(layers).toMatchObject([{ name: "외부", children: [
      { name: "위" }, { name: "내부", children: [{ name: "클리핑" }, { name: "기준" }] }, { name: "아래" },
    ] }]);
    expect(psdExportFolderPath({ ...result.elements[1], groupId: undefined })).toEqual([]);
  });

  it("그룹 혼합·효과·마스크를 구체적으로 알리고 저장된 합성본을 별도로 제공한다", async () => {
    const result = await imported([{ name: "효과", blendMode: "multiply", opacity: 0.5, effects: {}, mask: {}, children: [leaf("색")] }], { canvas });
    expect(result.skipped.join(" ")).toContain("multiply 격리 합성·그룹 불투명도·그룹 마스크·그룹 효과");
    expect(result.compositeElement).toMatchObject({ name: "PSD 원본 합성본", width: 100, height: 100, src: "data:image/png;base64,AAAA" });
    expect(result.lossManifest?.decisions).toContainEqual(expect.objectContaining({ feature: "blend-mode", disposition: "dropped", count: 1 }));
  });

  it("단일 서식 텍스트는 숨겨진 편집본으로 준비하고 원본 픽셀을 바꾸지 않는다", async () => {
    const result = await imported([leaf("대사", { text: {
      text: "안녕\r세계", transform: [1, 0, 0, 1, 0, 0],
      style: { fontSize: 18, fillColor: { r: 12, g: 34, b: 56 }, font: { name: "Arial" } },
    } })]);
    expect(result.elements).toHaveLength(1);
    expect(result.editableTextElements).toMatchObject([{ type: "text", text: "안녕\n세계", hidden: true, fontSize: 18, fill: "#0c2238", psdRasterSourceId: result.elements[0]?.id }]);
    const complex = await imported([leaf("곡선", { text: { text: "곡선", orientation: "vertical", style: { fontSize: 18, fillColor: { r: 0, g: 0, b: 0 } } } })]);
    expect(complex.editableTextElements).toEqual([]);
  });

  it("원본 보관 실패·취소 시 문서 초안을 돌려주지 않고 합성본 선택을 정확히 적용한다", async () => {
    const result = await imported([leaf("레이어")], { canvas });
    const pending = { kind: "psd" as const, fileName: "original.psd", result, preview: { format: "psd" as const, source: {}, result: {} } };
    const options = { pages: [page], anchorPageId: page.id, choice: "new-page" as const, canvasWidth: 100, createId: () => "new", createBlankPage: () => ({ ...page, id: "new" }), maxEmbeddedBytes: 100_000 };
    await expect(prepareStudioDocumentInterchangeCommit(pending, { ...options, preservePsdSource: async () => { throw new Error("원본 보관 실패"); } })).rejects.toThrow("원본 보관 실패");
    const source = { version: 1 as const, hash: `sha256:${"a".repeat(64)}` as const, name: "original.psd", bytes: 26 };
    const committed = await prepareStudioDocumentInterchangeCommit(pending, { ...options, psdRepresentation: "composite", preservePsdSource: async () => source });
    expect(committed.pages[1]?.elements).toEqual([{ ...result.compositeElement, psdSource: source }]);
    expect(committed.pages[1]?.groups).toEqual([]);
    const controller = new AbortController();
    await expect(prepareStudioDocumentInterchangeCommit(pending, { ...options, signal: controller.signal, preservePsdSource: async () => { controller.abort(); return source; } })).rejects.toMatchObject({ name: "AbortError" });
    expect(page.elements).toEqual([]);
  });
});
