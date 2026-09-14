/// <reference lib="webworker" />

import {
  STUDIO_VRM_PNG_MAX_OUTPUT_BYTES,
  STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
  isStudioVrmPngWorkerRequest,
  type StudioVrmPngWorkerRequest,
  type StudioVrmPngWorkerResponse,
} from "./studio-vrm-png-worker-protocol";

const scope = self as DedicatedWorkerGlobalScope;
let consumed = false;

function post(response: StudioVrmPngWorkerResponse): void {
  scope.postMessage(response);
}

function requestIdFrom(value: unknown): number {
  try {
    if (typeof value !== "object" || value === null) return 1;
    const requestId = Reflect.get(value, "requestId");
    return typeof requestId === "number" && Number.isSafeInteger(requestId) && requestId > 0
      ? requestId
      : 1;
  } catch {
    return 1;
  }
}

function supportsOffscreenCanvas2d(): boolean {
  try {
    if (typeof OffscreenCanvas !== "function") return false;
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("2d");
    const supported = context !== null && typeof canvas.convertToBlob === "function";
    canvas.width = 1;
    canvas.height = 1;
    return supported;
  } catch {
    return false;
  }
}

async function encodePng(request: StudioVrmPngWorkerRequest): Promise<Blob> {
  const canvas = new OffscreenCanvas(request.width, request.height);
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D context unavailable");
    // Protocol admission guarantees exactly one image. ImageData wraps its transferred storage;
    // no second 4K canvas or duplicate ImageData raster is needed for layer compositing.
    const data = new Uint8ClampedArray(request.layers[0]!.dataBuffer);
    context.putImageData(new ImageData(data, request.width, request.height), 0, 0);
    const png = await canvas.convertToBlob({ type: "image/png" });
    if (
      png.type !== "image/png" || png.size < 24 ||
      png.size > STUDIO_VRM_PNG_MAX_OUTPUT_BYTES
    ) throw new Error("invalid PNG result");
    return png;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

if (!supportsOffscreenCanvas2d()) {
  post({
    version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
    kind: "unavailable",
    code: "offscreen-canvas",
  });
} else {
  scope.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (consumed) return;
    consumed = true;
    const requestId = requestIdFrom(event.data);
    if (!isStudioVrmPngWorkerRequest(event.data)) {
      post({
        version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
        kind: "error",
        requestId,
        code: "protocol",
      });
      return;
    }
    const request = event.data;
    void encodePng(request).then((png) => post({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: request.requestId,
      width: request.width,
      height: request.height,
      png,
    })).catch(() => post({
      version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: request.requestId,
      code: "encode-failed",
    }));
  });

  post({
    version: STUDIO_VRM_PNG_WORKER_PROTOCOL_VERSION,
    kind: "ready",
  });
}

export {};
