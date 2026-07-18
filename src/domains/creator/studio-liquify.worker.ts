import { applyLiquifyDisplacement } from "./studio-liquify";
import {
  STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
  studioLiquifySuccessTransfers,
  type StudioLiquifyWorkerFailureMessage,
  type StudioLiquifyWorkerResponseMessage,
  type StudioLiquifyWorkerRunMessage,
  type StudioLiquifyWorkerSuccessMessage,
} from "./studio-liquify-worker-protocol";

interface StudioLiquifyWorkerScope {
  onmessage: ((event: MessageEvent<StudioLiquifyWorkerRunMessage>) => void) | null;
  postMessage(message: StudioLiquifyWorkerResponseMessage, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as StudioLiquifyWorkerScope;

workerScope.postMessage({
  type: "studio-liquify/ready",
  version: STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
}, []);

function serializeWorkerError(error: unknown): StudioLiquifyWorkerFailureMessage["error"] {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message || "리퀴파이 Worker 실행에 실패했습니다." };
  }
  return { name: "Error", message: "리퀴파이 Worker 실행에 실패했습니다." };
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (
    message.type !== "studio-liquify/run" ||
    message.version !== STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION
  ) {
    return;
  }

  try {
    const { src, dst, field } = message.request;
    applyLiquifyDisplacement(src, dst, field);
    const response: StudioLiquifyWorkerSuccessMessage = {
      type: "studio-liquify/success",
      version: STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
      dst,
    };
    workerScope.postMessage(response, studioLiquifySuccessTransfers(response));
  } catch (error) {
    const response: StudioLiquifyWorkerFailureMessage = {
      type: "studio-liquify/failure",
      version: STUDIO_LIQUIFY_WORKER_PROTOCOL_VERSION,
      error: serializeWorkerError(error),
    };
    workerScope.postMessage(response, []);
  }
};
