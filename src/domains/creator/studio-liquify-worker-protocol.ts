import { LIQUIFY_MAX_FIELD_CELLS, type LiquifyDisplacementField } from "./studio-liquify";

import type { StudioImageDataLike } from "./studio-filters";

export const STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION = 1 as const;
export const STUDIO_LIQUIFY_MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

export interface StudioLiquifyWorkerRunRequest {
  /** 변위 계산의 색 소스(frozen) — 워커에서 읽기만 한다. */
  readonly src: StudioImageDataLike;
  /** src와 동일 픽셀로 미리 채워진 작업 버퍼(work) — 워커가 변위 적용 결과로 덮어써 돌려준다. */
  readonly dst: StudioImageDataLike;
  readonly field: LiquifyDisplacementField;
}

export interface StudioLiquifyWorkerRunMessage {
  type: "studio-liquify/run";
  version: typeof STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION;
  request: StudioLiquifyWorkerRunRequest;
}

export interface StudioLiquifyWorkerSuccessMessage {
  type: "studio-liquify/success";
  version: typeof STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION;
  dst: StudioImageDataLike;
}

export interface StudioLiquifyWorkerReadyMessage {
  type: "studio-liquify/ready";
  version: typeof STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION;
}

export interface StudioLiquifyWorkerFailureMessage {
  type: "studio-liquify/failure";
  version: typeof STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioLiquifyWorkerResponseMessage =
  | StudioLiquifyWorkerReadyMessage
  | StudioLiquifyWorkerSuccessMessage
  | StudioLiquifyWorkerFailureMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertStudioLiquifyImageData(
  value: unknown,
  label: string,
): asserts value is StudioImageDataLike {
  if (!isRecord(value)) throw new TypeError(`${label} 형식이 올바르지 않습니다.`);
  const { data, width, height } = value;
  if (!(data instanceof Uint8ClampedArray)) {
    throw new TypeError(`${label} 픽셀 버퍼는 Uint8ClampedArray여야 합니다.`);
  }
  if (
    typeof width !== "number"
    || typeof height !== "number"
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new RangeError(`${label} 크기는 1 이상의 정수여야 합니다.`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > STUDIO_LIQUIFY_MAX_IMAGE_PIXELS) {
    throw new RangeError(`${label} 크기가 안전 한도를 초과했습니다.`);
  }
  if (data.byteLength !== pixels * 4) {
    throw new RangeError(`${label} 픽셀 버퍼 길이가 가로·세로 크기와 일치하지 않습니다.`);
  }
}

export function assertStudioLiquifyField(
  value: unknown,
  label = "리퀴파이 변위 필드",
): asserts value is LiquifyDisplacementField {
  if (!isRecord(value)) throw new TypeError(`${label} 형식이 올바르지 않습니다.`);
  const { originX, originY, width, height, dx, dy } = value;
  if (
    typeof originX !== "number"
    || typeof originY !== "number"
    || !Number.isSafeInteger(originX)
    || !Number.isSafeInteger(originY)
    || typeof width !== "number"
    || typeof height !== "number"
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
  ) {
    throw new RangeError(`${label} 좌표와 크기가 올바르지 않습니다.`);
  }
  const cells = width * height;
  if (!Number.isSafeInteger(cells) || cells > LIQUIFY_MAX_FIELD_CELLS) {
    throw new RangeError(`${label} 크기가 안전 한도를 초과했습니다.`);
  }
  if (!(dx instanceof Float32Array) || !(dy instanceof Float32Array)) {
    throw new TypeError(`${label} 버퍼는 Float32Array여야 합니다.`);
  }
  if (dx.length !== cells || dy.length !== cells) {
    throw new RangeError(`${label} 버퍼 길이가 필드 크기와 일치하지 않습니다.`);
  }
}

export function assertStudioLiquifyRequest(
  value: unknown,
): asserts value is StudioLiquifyWorkerRunRequest {
  if (!isRecord(value)) throw new TypeError("리퀴파이 요청 형식이 올바르지 않습니다.");
  assertStudioLiquifyImageData(value.src, "리퀴파이 원본");
  assertStudioLiquifyImageData(value.dst, "리퀴파이 결과");
  if (value.src.width !== value.dst.width || value.src.height !== value.dst.height) {
    throw new RangeError("리퀴파이 원본과 결과 크기가 일치하지 않습니다.");
  }
  assertStudioLiquifyField(value.field);
}

function uniqueArrayBufferTransfers(buffers: readonly ArrayBufferLike[]): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  const transfers: Transferable[] = [];
  for (const buffer of buffers) {
    if (!(buffer instanceof ArrayBuffer) || seen.has(buffer)) continue;
    seen.add(buffer);
    transfers.push(buffer);
  }
  return transfers;
}

/** src는 다시 쓰지 않으므로(putImageData는 dst만 소비) 두 버퍼 모두 편도 전송한다. */
export function studioLiquifyRequestTransfers(message: StudioLiquifyWorkerRunMessage): Transferable[] {
  return uniqueArrayBufferTransfers([
    message.request.src.data.buffer,
    message.request.dst.data.buffer,
    message.request.field.dx.buffer,
    message.request.field.dy.buffer,
  ]);
}

export function studioLiquifySuccessTransfers(message: StudioLiquifyWorkerSuccessMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.dst.data.buffer]);
}
