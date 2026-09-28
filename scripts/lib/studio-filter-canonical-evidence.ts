import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** 실제 저장 요청의 ACK와 독립 GET 결과를 함께 검사한다. 문서는 절대 수정하지 않는다. */
export function assertStudioFilterCanonicalEvidence(input: {
  phase: string;
  request: unknown;
  source: unknown;
  previousRevision: number;
  expectedPages: readonly unknown[];
}): { phase: string; revision: number; crdtServerSequence: string; pageSha256: string } {
  const sequence = record(input.request)?.crdtServerSequence;
  if (typeof sequence !== "string" || !/^\d+$/u.test(sequence) || BigInt(sequence) <= BigInt(0)) {
    throw new Error(`${input.phase}: 실제 gateway ACK가 없는 저장입니다`);
  }
  const source = record(input.source);
  if (source?.crdtServerSequence !== sequence) {
    throw new Error(`${input.phase}: 독립 정본 조회가 저장한 gateway ACK와 다릅니다`);
  }
  const revision = source?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision <= input.previousRevision) {
    throw new Error(`${input.phase}: 실제 정본 revision이 증가하지 않았습니다`);
  }
  const pages = record(record(source?.document)?.doc)?.pagesList;
  if (!isDeepStrictEqual(pages, input.expectedPages)) {
    throw new Error(`${input.phase}: 서버 정본이 실제 편집 결과와 다릅니다`);
  }
  return { phase: input.phase, revision, crdtServerSequence: sequence,
    pageSha256: createHash("sha256").update(JSON.stringify(pages)).digest("hex") };
}

/** 거절된 변경이 실제 저장된 원고·revision·ACK를 건드리지 않았음을 독립 조회로 검증한다. */
export function assertStudioFilterCanonicalUnchanged(before: unknown, after: unknown): void {
  const snapshot = (input: unknown) => {
    const source = record(input);
    const pages = record(record(source?.document)?.doc)?.pagesList;
    if (!source || !Array.isArray(pages) || pages.length === 0
      || typeof source.revision !== "number" || !Number.isSafeInteger(source.revision) || source.revision < 1
      || typeof source.crdtServerSequence !== "string" || !/^\d+$/u.test(source.crdtServerSequence)
      || BigInt(source.crdtServerSequence) <= BigInt(0)) {
      throw new Error("연결 단절 검증에 실제 원고·revision·서버 ACK가 필요합니다.");
    }
    return { document: source.document, revision: source.revision, sequence: source.crdtServerSequence };
  };
  if (!isDeepStrictEqual(snapshot(before), snapshot(after))) {
    throw new Error("거절된 필터 작업이 서버 정본을 변경했습니다.");
  }
}


/** 성공한 서버 저장은 로컬 복구 슬롯을 비운다. 비어 있던 슬롯의 오염도 거부한다. */
export function assertStudioFilterRecoveryUnchanged(before: unknown, after: unknown, expectedPages: readonly unknown[]): void {
  const pages = (value: unknown) => {
    if (value === null) return null;
    const snapshot = record(value)?.pagesList;
    if (!Array.isArray(snapshot) || snapshot.length === 0 || !isDeepStrictEqual(snapshot, expectedPages)) {
      throw new Error("로컬 복구 원고가 검증한 서버 원본과 다릅니다.");
    }
    return snapshot;
  };
  if (!Array.isArray(expectedPages) || expectedPages.length === 0) {
    throw new Error("검증한 서버 원본이 없는 복구 비교는 허용하지 않습니다.");
  }
  if (!isDeepStrictEqual(pages(before), pages(after))) {
    throw new Error("거절된 필터가 로컬 복구 슬롯을 변경했습니다.");
  }
}
