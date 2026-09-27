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
