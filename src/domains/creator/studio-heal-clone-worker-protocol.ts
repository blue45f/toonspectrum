import type { StudioImageDataLike } from "./studio-filters";
import type { HealCloneDab, HealCloneMode } from "./studio-heal-clone";

export const STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioHealCloneWorkerRunRequest {
  /** 도장의 유일한 색 소스(frozen) — 워커에서 읽기만 한다. */
  readonly src: StudioImageDataLike;
  /** src와 동일 픽셀로 미리 채워진 작업 버퍼(work) — 워커가 도장 적용 결과로 덮어써 돌려준다. */
  readonly dst: StudioImageDataLike;
  readonly dabs: readonly HealCloneDab[];
  readonly radiusPx: number;
  readonly hardness: number;
  readonly opacity: number;
  readonly mode: HealCloneMode;
}

export interface StudioHealCloneWorkerRunMessage {
  type: "studio-heal-clone/run";
  version: typeof STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION;
  request: StudioHealCloneWorkerRunRequest;
}

export interface StudioHealCloneWorkerSuccessMessage {
  type: "studio-heal-clone/success";
  version: typeof STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION;
  dst: StudioImageDataLike;
}

export interface StudioHealCloneWorkerReadyMessage {
  type: "studio-heal-clone/ready";
  version: typeof STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION;
}

export interface StudioHealCloneWorkerFailureMessage {
  type: "studio-heal-clone/failure";
  version: typeof STUDIO_HEAL_CLONE_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioHealCloneWorkerResponseMessage =
  | StudioHealCloneWorkerReadyMessage
  | StudioHealCloneWorkerSuccessMessage
  | StudioHealCloneWorkerFailureMessage;

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
export function studioHealCloneRequestTransfers(message: StudioHealCloneWorkerRunMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.request.src.data.buffer, message.request.dst.data.buffer]);
}

export function studioHealCloneSuccessTransfers(message: StudioHealCloneWorkerSuccessMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.dst.data.buffer]);
}
