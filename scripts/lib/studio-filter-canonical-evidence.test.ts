import { describe, expect, it } from "vitest";

import { assertStudioFilterCanonicalEvidence } from "./studio-filter-canonical-evidence";

const original = [{ id: "page", elements: [{ id: "stroke", type: "draw", points: [10, 20, 30, 40] }] }];
const filtered = [{ id: "page", elements: [{ id: "filtered", type: "image", src: "data:image/png;base64,fixture" }] }];
function evidence(pages: readonly unknown[], revision = 2, sequence: unknown = "9") {
  return { phase: "필터 적용", request: { crdtServerSequence: sequence }, previousRevision: 1,
    source: { revision, crdtServerSequence: sequence, document: { doc: { pagesList: structuredClone(pages) } } }, expectedPages: pages };
}

describe("필터 실제 정본 검증 근거", () => {
  it("실제 ACK·revision 증가·필터 결과와 실행 취소 원본을 각각 확인한다", () => {
    const applied = assertStudioFilterCanonicalEvidence(evidence(filtered));
    const undone = assertStudioFilterCanonicalEvidence({ ...evidence(original, 3, "10"), previousRevision: applied.revision });
    expect(applied.crdtServerSequence).toBe("9");
    expect(undone.revision).toBe(3);
    expect(undone.pageSha256).not.toBe(applied.pageSha256);
    expect(original[0]?.elements[0]?.points).toEqual([10, 20, 30, 40]);
  });

  it.each([undefined, null, 9, "0", "-1", "9.5", "peer-receipt"])("서버 ACK가 아닌 %j는 성공으로 인정하지 않는다", (sequence) => {
    expect(() => assertStudioFilterCanonicalEvidence({ ...evidence(filtered), request: { crdtServerSequence: sequence } }))
      .toThrow("gateway ACK");
  });

  it.each([0, 1, 1.5, NaN, Infinity])("증가하지 않은 정본 revision %j를 거절한다", (revision) => {
    expect(() => assertStudioFilterCanonicalEvidence(evidence(filtered, revision))).toThrow("revision");
  });

  it("서버에 적용 전 원본이 남거나 실행 취소 뒤 필터 결과가 남으면 실패한다", () => {
    expect(() => assertStudioFilterCanonicalEvidence({ ...evidence(filtered), source: evidence(original).source })).toThrow("편집 결과");
    expect(() => assertStudioFilterCanonicalEvidence({ ...evidence(original), source: evidence(filtered).source })).toThrow("편집 결과");
  });

  it("독립 정본 조회가 다른 ACK에 고정됐으면 실패한다", () => {
    expect(() => assertStudioFilterCanonicalEvidence({ ...evidence(filtered), source: evidence(filtered, 2, "8").source }))
      .toThrow("gateway ACK와 다릅니다");
  });

  it("키 삽입 순서는 무시하되 좌표·요소 순서와 모든 필드를 보존한다", () => {
    const reordered = [{ elements: [{ points: [10, 20, 30, 40], type: "draw", id: "stroke" }], id: "page" }];
    expect(assertStudioFilterCanonicalEvidence({ ...evidence(original), source: evidence(reordered).source }).revision).toBe(2);
    const changed = [{ id: "page", elements: [{ id: "stroke", type: "draw", points: [10, 20, 40, 30] }] }];
    expect(() => assertStudioFilterCanonicalEvidence({ ...evidence(original), source: evidence(changed).source })).toThrow("편집 결과");
  });
});
