/// <reference lib="webworker" />

import {
  occtBooleanCutBoxes,
  occtFilletBox,
  occtLoftedTower,
  occtMakeBoxSolid,
  occtMakeSphereSolid,
  occtMakePipeSolid,
  occtMakeTorusSolid,
  occtMirrorBox,
  occtRevolveCylinderLike,
} from "./studio-occt-wasm-facade";

import type {
  StudioOcctWorkerRequest,
  StudioOcctWorkerResponse,
} from "./studio-occt-worker-protocol";

const workerScope = self as DedicatedWorkerGlobalScope;

async function runOperation(
  operation: StudioOcctWorkerRequest["operation"],
) {
  switch (operation.kind) {
    case "box":
      return occtMakeBoxSolid(...operation.size);
    case "sphere":
      return occtMakeSphereSolid(operation.radius);
    case "torus":
      return occtMakeTorusSolid(operation.majorRadius, operation.minorRadius);
    case "pipe":
      return occtMakePipeSolid(operation.length, operation.radius);
    case "mirror-box":
      return occtMirrorBox(operation.size[0], operation.size[1], operation.size[2]);
    case "revolve":
      return occtRevolveCylinderLike(operation.radius, operation.height);
    case "fillet-box":
      return occtFilletBox(
        operation.size[0],
        operation.size[1],
        operation.size[2],
        operation.radius,
      );
    case "loft":
      return occtLoftedTower(operation.levels);
    case "cut-boxes":
      return occtBooleanCutBoxes(operation.a, operation.b);
    default: {
      const _exhaustive: never = operation;
      return {
        ok: false as const,
        code: "unknown-op",
        detail: String(_exhaustive),
      };
    }
  }
}

workerScope.addEventListener("message", (event: MessageEvent<StudioOcctWorkerRequest>) => {
  const request = event.data;
  void (async () => {
    const result = await runOperation(request.operation);
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
