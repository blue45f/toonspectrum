/// <reference lib="webworker" />

import {
  CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
  characterAuthoringWorkerResponseTransfers,
  isCharacterAuthoringWorkerRequest,
  type CharacterAuthoringWorkerErrorResponse,
  type CharacterAuthoringWorkerProgressResponse,
  type CharacterAuthoringWorkerResponse,
} from "./character-authoring-worker-protocol";
import {
  CharacterAuthoringWorkerRuntimeError,
  executeCharacterAuthoringTask,
} from "./character-authoring-worker-runtime";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(response: CharacterAuthoringWorkerResponse): void {
  scope.postMessage(response, characterAuthoringWorkerResponseTransfers(response));
}

function progress(
  requestId: number,
  generationId: number,
  stage: CharacterAuthoringWorkerProgressResponse["stage"],
  value: number,
): void {
  post({
    version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
    kind: "progress",
    requestId,
    generationId,
    stage,
    progress: value,
  });
}

scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  const value = event.data;
  const identity = typeof value === "object" && value !== null
    ? {
        requestId: Number(Reflect.get(value, "requestId")) || 1,
        generationId: Number(Reflect.get(value, "generationId")) || 1,
      }
    : { requestId: 1, generationId: 1 };
  if (!isCharacterAuthoringWorkerRequest(value)) {
    const response: CharacterAuthoringWorkerErrorResponse = {
      version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
      kind: "error",
      ...identity,
      code: "invalid-request",
      message: "3D 저작 Worker 요청 형식이 올바르지 않습니다.",
    };
    post(response);
    return;
  }
  try {
    progress(value.requestId, value.generationId, "validating", 0.1);
    progress(value.requestId, value.generationId, "computing", 0.35);
    const result = executeCharacterAuthoringTask(value.task);
    progress(value.requestId, value.generationId, "packing", 0.9);
    post({
      version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: value.requestId,
      generationId: value.generationId,
      result,
    });
  } catch (error) {
    const response: CharacterAuthoringWorkerErrorResponse = {
      version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
      kind: "error",
      requestId: value.requestId,
      generationId: value.generationId,
      code: error instanceof CharacterAuthoringWorkerRuntimeError
        ? error.code
        : "task-failed",
      message: error instanceof Error ? error.message.slice(0, 512) : "3D 저작 Worker 실행에 실패했습니다.",
    };
    post(response);
  }
});

export {};
