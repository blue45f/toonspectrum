/// <reference lib="webworker" />

import {
  occtBooleanCutBoxes,
  occtMakeBoxSolid,
} from "./studio-occt-wasm-facade";

import type {
  StudioOcctWorkerRequest,
  StudioOcctWorkerResponse,
} from "./studio-occt-worker-protocol";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", (event: MessageEvent<StudioOcctWorkerRequest>) => {
  const request = event.data;
  void (async () => {
    const result = request.operation.kind === "box"
      ? await occtMakeBoxSolid(...request.operation.size)
      : await occtBooleanCutBoxes(request.operation.a, request.operation.b);
    const response: StudioOcctWorkerResponse = { id: request.id, result };
    workerScope.postMessage(response);
  })().catch((error: unknown) => {
    const response: StudioOcctWorkerResponse = {
      id: request.id,
      result: {
        ok: false,
        code: "occt-worker-failed",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
    workerScope.postMessage(response);
  });
});

export {};
