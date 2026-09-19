/// <reference lib="webworker" />
import { runScene3dSpecialist } from "./specialist-runtime";
import { SpecialistError, parseSpecialistRequest } from "./specialist-contract";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let busy = false;
scope.onmessage = (event: MessageEvent<unknown>) => {
  if (busy) return;
  busy = true;
  let id = 0;
  void Promise.resolve()
    .then(() => {
      const request = parseSpecialistRequest(event.data);
      id = request.id;
      return runScene3dSpecialist(request);
    })
    .then((result) => {
      const transfers = result.artifacts.map(
        (artifact) => artifact.bytes.buffer,
      );
      scope.postMessage({ ok: true, id, result }, [...new Set(transfers)]);
    })
    .catch((error: unknown) => {
      scope.postMessage({
        ok: false,
        id,
        code: error instanceof SpecialistError ? error.code : "runtime",
        message:
          error instanceof SpecialistError
            ? error.message
            : "The input could not be processed safely.",
      });
    });
};
