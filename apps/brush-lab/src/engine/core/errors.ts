/**
 * 엔진 오류 계층. 모든 오류는 `code`를 가지며, 레인은 capability 불일치·초기화 실패·
 * device loss를 `LaneUnavailableError`로 던지고 다른 레인으로 자동 전환하지 않는다(ADR-0018).
 */

export type LaneReasonCode =
  | "webgpu-api-unavailable"
  | "adapter-unavailable"
  | "device-request-failed"
  | "feature-missing"
  | "limit-exceeded"
  | "dom-unavailable"
  | "webgl2-unavailable"
  | "wasm-artifact-missing"
  | "wasm-integrity-mismatch"
  | "wgsl-compile-error"
  | "device-lost"
  | "not-implemented";

export class SumiError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SumiError";
    this.code = code;
    if (details) this.details = details;
  }
}

/** 레인을 쓸 수 없는 이유를 구조화한 오류. */
export class LaneUnavailableError extends SumiError {
  declare readonly code: LaneReasonCode;

  constructor(code: LaneReasonCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "LaneUnavailableError";
  }
}

/** 획 예산(타일 풀·dab 용량) 초과. 무음 폐기 대신 던진다. */
export class StrokeBudgetExceededError extends SumiError {
  declare readonly code: "stroke-budget-exceeded";
  readonly requested: number;
  readonly capacity: number;

  constructor(requested: number, capacity: number, details?: Record<string, unknown>) {
    super(
      "stroke-budget-exceeded",
      `stroke budget exceeded: requested ${requested}, capacity ${capacity}`,
      details,
    );
    this.name = "StrokeBudgetExceededError";
    this.requested = requested;
    this.capacity = capacity;
  }
}

export interface WgslCompileMessage {
  message: string;
  lineNum?: number;
  linePos?: number;
}

/** WGSL 컴파일 오류(`getCompilationInfo`의 error 메시지 표면화). */
export class WgslCompileError extends SumiError {
  declare readonly code: "wgsl-compile-error";
  readonly shaderId: string;
  readonly messages: readonly WgslCompileMessage[];

  constructor(shaderId: string, messages: readonly WgslCompileMessage[]) {
    super(
      "wgsl-compile-error",
      `WGSL compile error in ${shaderId}: ${messages.map((m) => m.message).join("; ")}`,
      { shaderId, messages },
    );
    this.name = "WgslCompileError";
    this.shaderId = shaderId;
    this.messages = messages;
  }
}

/** 사용 순서 위반(beginStroke 전 addSamples, dispose 후 호출 등). */
export class InvalidStateError extends SumiError {
  declare readonly code: "invalid-state";

  constructor(message: string, details?: Record<string, unknown>) {
    super("invalid-state", message, details);
    this.name = "InvalidStateError";
  }
}
