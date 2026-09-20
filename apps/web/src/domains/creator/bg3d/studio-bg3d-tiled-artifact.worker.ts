/// <reference lib="webworker" />
import { assertStudioBg3dTiledRequest } from "./studio-bg3d-tiled-artifact-contract";
import { StudioBg3dTiledArtifactProcessor } from "./studio-bg3d-tiled-artifact-processor";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let processor: StudioBg3dTiledArtifactProcessor | undefined;
let jobId = 0;
let busy = false;
let closed = false;
scope.onmessage = (event: MessageEvent<unknown>) => {
  if (closed) return;
  const fail = (error: unknown) => {
    closed = true;
    void processor?.abort();
    scope.postMessage({
      version: 1,
      kind: "error",
      id: jobId,
      code: error instanceof RangeError ? "budget" : "runtime",
      message:
        error instanceof Error ? error.message : "Tiled processing failed.",
    });
  };
  if (busy) {
    fail(new Error("Concurrent tiled Worker messages are not allowed."));
    return;
  }
  busy = true;
  void (async () => {
    assertStudioBg3dTiledRequest(event.data);
    const request = event.data;
    if (request.kind === "init") {
      if (processor || jobId) throw new Error("Worker initialization replay.");
      jobId = request.id;
      processor = new StudioBg3dTiledArtifactProcessor(request.options);
      scope.postMessage({ version: 1, kind: "ready", id: jobId });
    } else {
      if (!processor || request.id !== jobId)
        throw new Error("Tiled Worker job identity mismatch.");
      if (request.kind === "tile") {
        await processor.append(request.index, request.raster);
        if (!closed)
          scope.postMessage({
            version: 1,
            kind: "ack",
            id: jobId,
            index: request.index,
          });
      } else {
        const result = await processor.finish();
        if (!closed) {
          closed = true;
          scope.postMessage({ version: 1, kind: "result", id: jobId, result });
        }
      }
    }
  })()
    .catch(fail)
    .finally(() => {
      busy = false;
    });
};
