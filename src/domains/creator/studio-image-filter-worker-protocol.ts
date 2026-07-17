import type { StudioImageDataLike } from "./studio-filters";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

export const STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION = 1 as const;

export interface StudioImageFilterWorkerRunRequest {
  readonly imageData: StudioImageDataLike;
  readonly el: ImageFilterFields;
}

export interface StudioImageFilterWorkerRunMessage {
  type: "studio-image-filter/run";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  request: StudioImageFilterWorkerRunRequest;
}

export interface StudioImageFilterWorkerSuccessMessage {
  type: "studio-image-filter/success";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  imageData: StudioImageDataLike;
}

export interface StudioImageFilterWorkerReadyMessage {
  type: "studio-image-filter/ready";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
}

export interface StudioImageFilterWorkerFailureMessage {
  type: "studio-image-filter/failure";
  version: typeof STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION;
  error: {
    name: string;
    message: string;
  };
}

export type StudioImageFilterWorkerResponseMessage =
  | StudioImageFilterWorkerReadyMessage
  | StudioImageFilterWorkerSuccessMessage
  | StudioImageFilterWorkerFailureMessage;

function uniqueArrayBufferTransfers(views: readonly { readonly buffer: ArrayBufferLike }[]): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  const transfers: Transferable[] = [];
  for (const view of views) {
    const buffer = view.buffer;
    if (!(buffer instanceof ArrayBuffer) || seen.has(buffer)) continue;
    seen.add(buffer);
    transfers.push(buffer);
  }
  return transfers;
}

export function studioImageFilterRequestTransfers(message: StudioImageFilterWorkerRunMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.request.imageData.data]);
}

export function studioImageFilterSuccessTransfers(message: StudioImageFilterWorkerSuccessMessage): Transferable[] {
  return uniqueArrayBufferTransfers([message.imageData.data]);
}
