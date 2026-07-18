/// <reference lib="webworker" />

import { validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import {
  STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
  isStudioBg3dGlbWorkerRequest,
  type StudioBg3dGlbWorkerResponse,
} from "./studio-bg3d-glb-validation-worker-protocol";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const activeRequests = new Set<number>();
const cancelledRequests = new Set<number>();

function finishRequest(requestId: number): boolean {
  activeRequests.delete(requestId);
  return cancelledRequests.delete(requestId);
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isStudioBg3dGlbWorkerRequest(request)) return;
  if (request.kind === "cancel") {
    // Messages sent through one Worker are ordered. An unknown ID has therefore either already
    // completed or was never valid; retaining it would leak stale cancellation IDs indefinitely.
    if (activeRequests.has(request.requestId)) cancelledRequests.add(request.requestId);
    return;
  }
  if (activeRequests.has(request.requestId)) return;
  activeRequests.add(request.requestId);

  void validateStudioBg3dGlb(request.bytes, request.options)
    .then((result) => {
      if (finishRequest(request.requestId)) return;
      const response: StudioBg3dGlbWorkerResponse = {
        version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
        kind: "result",
        requestId: request.requestId,
        result,
      };
      if (result.ok) {
        scope.postMessage(response, [result.verifiedBytes.buffer]);
      } else {
        scope.postMessage(response);
      }
    })
    .catch(() => {
      if (finishRequest(request.requestId)) return;
      const response: StudioBg3dGlbWorkerResponse = {
        version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
        kind: "error",
        requestId: request.requestId,
      };
      scope.postMessage(response);
    });
});

export {};
