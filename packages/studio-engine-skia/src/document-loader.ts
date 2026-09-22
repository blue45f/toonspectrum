import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";

import type { CanvasKit } from "canvaskit-wasm";

let modulePromise: Promise<CanvasKit> | null = null;
export function loadCanvasKitDocumentRuntime(): Promise<CanvasKit> {
  if (!modulePromise) {
    const loading = import("canvaskit-wasm")
      .then((module) => module.default({ locateFile: (file: string) => file.endsWith(".wasm") ? wasmUrl : file }));
    modulePromise = loading;
    void loading.catch(() => { if (modulePromise === loading) modulePromise = null; });
  }
  return modulePromise;
}
