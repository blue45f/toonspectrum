import { describe, expect, it } from "vitest";

import { assertStudioFilterCanonicalEvidence, assertStudioFilterCanonicalUnchanged, assertStudioFilterRecoveryUnchanged } from "./studio-filter-canonical-evidence";

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


describe("연결 단절 뒤 서버 원본 보존", () => {
  it("서로 독립적으로 읽은 원고·revision·ACK가 모두 같으면 통과한다", () => {
    const before = evidence(original).source;
    const after = structuredClone(before);
    expect(() => assertStudioFilterCanonicalUnchanged(before, after)).not.toThrow();
  });

  it.each([
    { label: "문서 내용", after: evidence(filtered).source },
    { label: "revision", after: evidence(original, 3).source },
    { label: "서버 ACK", after: evidence(original, 2, "10").source },
  ])("$label가 바뀌면 거절된 작업의 저장을 검출한다", ({ after }) => {
    expect(() => assertStudioFilterCanonicalUnchanged(evidence(original).source, after)).toThrow("서버 정본을 변경");
  });

  it.each([null, {}, { revision: 1 }, evidence([], 2).source,
    evidence(original, 0).source, evidence(original, 2, "0").source,
    evidence(original, 2, 9).source, evidence(original, 2, "peer-receipt").source])(
    "불완전한 원본 %j는 양쪽이 같아도 성공 근거가 아니다",
    (invalid) => {
      expect(() => assertStudioFilterCanonicalUnchanged(invalid, invalid)).toThrow("실제 원고");
      expect(() => assertStudioFilterCanonicalUnchanged(evidence(original).source, invalid)).toThrow("실제 원고");
    },
  );
});


describe("공동 저장 이후 로컬 복구 슬롯의 보존", () => {
  it("실제 서버에 저장한 뒤 비워진 슬롯은 거절 후에도 비어 있어야 한다", () => {
    expect(() => assertStudioFilterRecoveryUnchanged(null, null, original)).not.toThrow();
  });
  it("원본 복구 슬롯이 남아 있다면 원본 내용과 존재 여부를 모두 유지한다", () => {
    expect(() => assertStudioFilterRecoveryUnchanged({ pagesList: original }, { pagesList: structuredClone(original) }, original)).not.toThrow();
  });
  it.each([
    [null, { pagesList: original }], [{ pagesList: original }, null],
    [null, { pagesList: filtered }], [{ pagesList: original }, { pagesList: filtered }],
    [{ pagesList: filtered }, { pagesList: filtered }], [undefined, undefined], [{}, {}],
  ])("오염·삭제·잘못된 원본은 두 값이 같아도 거부한다", (before, after) => {
    expect(() => assertStudioFilterRecoveryUnchanged(before, after, original)).toThrow();
  });
  it("실제 원본이 없는 null 비교만으로는 통과하지 않는다", () => {
    expect(() => assertStudioFilterRecoveryUnchanged(null, null, [])).toThrow();
  });
});
