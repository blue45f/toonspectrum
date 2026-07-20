import {
  STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
  assertStudioImageFilterImageData,
  studioImageFilterSuccessTransfers,
  type StudioImageFilterWorkerFailureMessage,
  type StudioImageFilterWorkerResponseMessage,
  type StudioImageFilterWorkerRunMessage,
  type StudioImageFilterWorkerSuccessMessage,
} from "./studio-image-filter-worker-protocol";
import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";

interface StudioImageFilterWorkerScope {
  onmessage: ((event: MessageEvent<StudioImageFilterWorkerRunMessage>) => void) | null;
  postMessage(message: StudioImageFilterWorkerResponseMessage, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as StudioImageFilterWorkerScope;

// 빈 레지스트리로 등록 — Blur/Brighten/Contrast/HSL/Pixelate는 attrs 기반 순수 포팅
// (studio-konva-native-filters)이 채운다. konva 패키지 자체는 이 워커에서 import하지 않는다.
const workerFilterRegistry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(workerFilterRegistry);

workerScope.postMessage({
  type: "studio-image-filter/ready",
  version: STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
}, []);

function serializeWorkerError(error: unknown): StudioImageFilterWorkerFailureMessage["error"] {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "이미지 필터 Worker 실행에 실패했습니다." };
  }
  return { name: "Error", message: "이미지 필터 Worker 실행에 실패했습니다." };
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (
    !message ||
    typeof message !== "object" ||
    message.type !== "studio-image-filter/run" ||
    message.version !== STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION
  ) {
    return;
  }

  try {
    const { imageData, el } = message.request;
    assertStudioImageFilterImageData(imageData);
    const { filters, attrs } = buildImageFilters(el, workerFilterRegistry);
    applyImageFilters(imageData, filters, attrs);
    const response: StudioImageFilterWorkerSuccessMessage = {
      type: "studio-image-filter/success",
      version: STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
      imageData,
    };
    workerScope.postMessage(response, studioImageFilterSuccessTransfers(response));
  } catch (error) {
    const response: StudioImageFilterWorkerFailureMessage = {
      type: "studio-image-filter/failure",
      version: STUDIO_IMAGE_FILTER_WORKER_PROTOCOL_VERSION,
      error: serializeWorkerError(error),
    };
    workerScope.postMessage(response, []);
  }
};
