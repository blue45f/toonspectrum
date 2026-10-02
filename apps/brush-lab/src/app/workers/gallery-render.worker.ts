import { handleGalleryRequest } from "./gallery-render-core";

import type { GalleryRenderRequestMessage, GalleryRenderResponseMessage } from "../../platform/worker-client";

/**
 * 갤러리 렌더 ES module Worker. 메시지 1건 = 프리셋 1개 썸네일(cpu-reference 경로).
 * Worker 전역은 lib.webworker를 켜지 않고(DOM lib와 충돌) 필요한 멤버만 구조적으로 선언한다.
 */
interface WorkerScope {
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
  postMessage(message: GalleryRenderResponseMessage, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;

function isRequest(value: unknown): value is GalleryRenderRequestMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<GalleryRenderRequestMessage>;
  return (
    v.type === "render" &&
    typeof v.id === "number" &&
    typeof v.presetId === "string" &&
    typeof v.fixtureId === "string" &&
    typeof v.size === "number"
  );
}

/** 전송(transfer) 가능한 독립 ArrayBuffer 위의 복사본. */
function transferable(data: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const copy = new Uint8ClampedArray(new ArrayBuffer(data.byteLength));
  copy.set(data);
  return copy;
}

scope.addEventListener("message", (ev: MessageEvent) => {
  const data: unknown = ev.data;
  if (!isRequest(data)) return;
  const response = handleGalleryRequest(data, { now: () => performance.now() });
  if (response.type === "result") {
    const pixels = transferable(response.data);
    scope.postMessage({ ...response, data: pixels }, [pixels.buffer]);
    return;
  }
  scope.postMessage(response);
});
