import { createRequire } from "node:module";

import type { CanvasKit, CanvasKitInitOptions } from "canvaskit-wasm";

/**
 * Node-only CanvasKit loader ("@toonspectrum/studio-engine-skia/node").
 *
 * canvaskit-wasm ships a CommonJS emscripten loader, so it is loaded through
 * createRequire; the .wasm blob is resolved next to it via the package export
 * map. The initialized module is cached as a module-scope singleton — loading
 * the WASM twice would double the ~30MB heap for no benefit.
 */

const nodeRequire = createRequire(import.meta.url);

type CanvasKitInitFn = (options?: CanvasKitInitOptions) => Promise<CanvasKit>;

let canvasKitSingleton: Promise<CanvasKit> | null = null;

export async function loadCanvasKitNode(): Promise<CanvasKit> {
  if (canvasKitSingleton === null) {
    const init = nodeRequire("canvaskit-wasm/bin/canvaskit.js") as CanvasKitInitFn;
    canvasKitSingleton = init({
      locateFile: (file: string) => nodeRequire.resolve(`canvaskit-wasm/bin/${file}`),
    });
  }
  return canvasKitSingleton;
}
