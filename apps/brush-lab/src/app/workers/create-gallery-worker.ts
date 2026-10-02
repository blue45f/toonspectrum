import { SumiError } from "../../engine/core/errors";
import { GalleryWorkerClient } from "../../platform/worker-client";

/**
 * Vite 규약(`new URL(..., import.meta.url)` + `type: "module"`)으로 갤러리 Worker를 만든다.
 * Worker를 지원하지 않는 환경(jsdom 등)에서는 `SumiError("worker-unavailable")`를 던진다(무음 대체 없음).
 */
export function createGalleryWorkerClient(): GalleryWorkerClient {
  if (typeof Worker !== "function") {
    throw new SumiError("worker-unavailable", "이 환경은 Web Worker를 지원하지 않는다");
  }
  const worker = new Worker(new URL("./gallery-render.worker.ts", import.meta.url), { type: "module" });
  return new GalleryWorkerClient(worker);
}
