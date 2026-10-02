/**
 * fail-visible 실패 계약.
 *
 * 엔진·물리 provider·비전 모델·슬롯 미지원 등 모든 실패는 무음 대체 없이
 * 이 구조로 노출한다(ADR-0018). `reasonKo`는 사용자에게 그대로 보여주는 한글 사유다.
 */
export interface LabFailure {
  /** 기계 판별용 코드(kebab-case). 예: "webgpu-no-adapter" */
  readonly code: string;
  /** 사용자에게 표시하는 한글 사유 */
  readonly reasonKo: string;
  /** 디버깅용 원문(오류 메시지·스택 등). UI에는 접힌 상태로만 노출한다. */
  readonly detail?: string;
  /** 발생 시각(epoch ms) */
  readonly at: number;
}

/** 알 수 없는 값을 사람이 읽을 수 있는 detail 문자열로 바꾼다. */
export function describeDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  if (detail instanceof Error) {
    return detail.stack ?? `${detail.name}: ${detail.message}`;
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/**
 * LabFailure를 만든다. `at`은 호출 시각으로 채운다(테스트에서는 `now`를 주입).
 */
export function failVisible(code: string, reasonKo: string, detail?: unknown, now: number = Date.now()): LabFailure {
  const described = describeDetail(detail);
  return described === undefined ? { code, reasonKo, at: now } : { code, reasonKo, detail: described, at: now };
}

/** 값이 LabFailure 구조인지 판별하는 타입 가드 */
export function isLabFailure(value: unknown): value is LabFailure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.reasonKo === "string" && typeof candidate.at === "number";
}
