import type { StudioImageDataLike } from "./studio-filters";
import type { LiquifyDisplacementField } from "./studio-liquify";

export const STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION = 1 as const;

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
