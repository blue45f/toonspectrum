import { loadStudioPerfectFreehandStroker } from "./studio-perfect-freehand";
import { exportPageToSvg } from "./studio-svg-export";
import {
  STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
  type StudioSvgExportWorkerFailureMessage,
  type StudioSvgExportWorkerResponseMessage,
  type StudioSvgExportWorkerRunMessage,
  type StudioSvgExportWorkerSuccessMessage,
} from "./studio-svg-export-worker-protocol";

interface StudioSvgExportWorkerScope {
  onmessage: ((event: MessageEvent<StudioSvgExportWorkerRunMessage>) => void) | null;
  postMessage(message: StudioSvgExportWorkerResponseMessage): void;
}

const workerScope = globalThis as unknown as StudioSvgExportWorkerScope;

workerScope.postMessage({
  type: "studio-svg-export/ready",
  version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
});

function serializeWorkerError(error: unknown): StudioSvgExportWorkerFailureMessage["error"] {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "SVG 내보내기 Worker 실행에 실패했습니다." };
  }
  return { name: "Error", message: "SVG 내보내기 Worker 실행에 실패했습니다." };
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  if (
    message.type !== "studio-svg-export/run" ||
    message.version !== STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION
  ) {
    return;
  }

  try {
    // This worker is intentionally short-lived, so its dynamic-module cache starts empty for every
    // export. Wait for the outline stroker before the first serialization; otherwise G-pen and
    // perfect-* strokes would silently fall back to a uniform-width SVG only in exported files.
    await loadStudioPerfectFreehandStroker();
    const result = exportPageToSvg(message.input);
    const response: StudioSvgExportWorkerSuccessMessage = {
      type: "studio-svg-export/success",
      version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
      result,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: StudioSvgExportWorkerFailureMessage = {
      type: "studio-svg-export/failure",
      version: STUDIO_SVG_EXPORT_WORKER_PROTOCOL_VERSION,
      error: serializeWorkerError(error),
    };
    workerScope.postMessage(response);
  }
};
