/// <reference lib="webworker" />
// The studio-*.worker stem is also the deployed COEP/SW response-header contract.

import { buildCharacterSemanticPsd } from "./character-shaper-psd-assembly";
import { CHARACTER_PSD_WORKER_VERSION, isCharacterPsdWorkerRequest } from "./character-shaper-psd-worker-protocol";

import type { CharacterPsdWorkerResponse } from "./character-shaper-psd-worker-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let consumed = false;
const post = (response: CharacterPsdWorkerResponse) => scope.postMessage(response);
scope.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (consumed) return;
  consumed = true;
  if (!isCharacterPsdWorkerRequest(event.data)) {
    post({ version: CHARACTER_PSD_WORKER_VERSION, kind: "error", requestId: 1, code: "protocol" });
    return;
  }
  const request = event.data;
  try {
    const { blob, receipt } = buildCharacterSemanticPsd(request.passes, request.skipped, { title: request.title });
    post({ version: CHARACTER_PSD_WORKER_VERSION, kind: "result", requestId: request.requestId, blob, receipt });
  } catch {
    post({ version: CHARACTER_PSD_WORKER_VERSION, kind: "error", requestId: request.requestId, code: "assembly-failed" });
  }
});
post({ version: CHARACTER_PSD_WORKER_VERSION, kind: "ready" });

export {};
