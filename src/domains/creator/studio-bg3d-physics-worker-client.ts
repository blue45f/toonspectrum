import {
  STUDIO_BG3D_PHYSICS_TIMELINE_PROTOCOL_VERSION,
  createStudioBg3dPhysicsTimelineResult,
  isStudioBg3dPhysicsTimelineWorkerResponseMessage,
  normalizeStudioBg3dPhysicsTimelineInput,
  type NormalizedStudioBg3dPhysicsTimelineInput,
  type StudioBg3dPhysicsTimelineInput,
  type StudioBg3dPhysicsTimelineResult,
  type StudioBg3dPhysicsTimelineWorkerResponseMessage,
  type StudioBg3dPhysicsTimelineWorkerRunMessage,
} from "./studio-bg3d-physics-timeline";

export const STUDIO_BG3D_PHYSICS_TIMELINE_WORKER_TIMEOUT_MS = 60_000;

interface WorkerMessageEventLike {
  readonly data: unknown;
}

interface WorkerErrorEventLike {
  preventDefault?(): void;
}

export interface StudioBg3dPhysicsTimelineWorkerLike {
  postMessage(message: StudioBg3dPhysicsTimelineWorkerRunMessage): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(
    type: "error" | "messageerror",
    listener: (event: WorkerErrorEventLike) => void,
  ): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener(
    type: "error" | "messageerror",
    listener: (event: WorkerErrorEventLike) => void,
  ): void;
  terminate(): void;
}

export type StudioBg3dPhysicsTimelineWorkerFactory =
  () => StudioBg3dPhysicsTimelineWorkerLike | null;

export interface StudioBg3dPhysicsTimelineWorkerOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Omitted creates a lazy Vite module Worker; injection keeps tests and non-browser hosts isolated. */
  readonly workerFactory?: StudioBg3dPhysicsTimelineWorkerFactory;
}

export type StudioBg3dPhysicsTimelineWorkerErrorCode =
  | "aborted"
  | "invalid-request"
  | "protocol"
  | "simulation-failed"
  | "timeout"
  | "worker-failed";

export class StudioBg3dPhysicsTimelineWorkerError extends Error {
  constructor(readonly code: StudioBg3dPhysicsTimelineWorkerErrorCode) {
    super(`studio-bg3d-physics-timeline-worker:${code}`);
    this.name = code === "aborted" ? "AbortError" : "StudioBg3dPhysicsTimelineWorkerError";
  }
}

/** Vite discovers this exact URL expression and emits the physics engine only in a Worker graph. */
export function createStudioBg3dPhysicsTimelineModuleWorker():
  StudioBg3dPhysicsTimelineWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(
    new URL("./studio-bg3d-physics.worker.ts", import.meta.url),
    { name: "toonspectrum-bg3d-physics-timeline", type: "module" },
  );
}

let nextRequestId = 1;

function allocateRequestId(): number {
  const requestId = nextRequestId;
  nextRequestId = requestId >= Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
  return requestId;
}

function isResponseForRequest(value: unknown, requestId: number): boolean {
  try {
    return typeof value === "object" && value !== null &&
      Reflect.get(value, "requestId") === requestId;
  } catch {
    return false;
  }
}

function matchingNodeIds(
  response: StudioBg3dPhysicsTimelineWorkerResponseMessage & { readonly kind: "result" },
  input: NormalizedStudioBg3dPhysicsTimelineInput,
): boolean {
  return response.nodeIds.length === input.dynamicNodeIds.length &&
    response.nodeIds.every((nodeId, index) => nodeId === input.dynamicNodeIds[index]);
}

function resultFromResponse(
  response: StudioBg3dPhysicsTimelineWorkerResponseMessage & { readonly kind: "result" },
  input: NormalizedStudioBg3dPhysicsTimelineInput,
): StudioBg3dPhysicsTimelineResult | null {
  if (
    !matchingNodeIds(response, input) ||
    response.frameCount !== input.frameCount ||
    response.durationSeconds !== input.durationSeconds
  ) return null;
  return createStudioBg3dPhysicsTimelineResult(
    response.nodeIds,
    response.frameCount,
    response.durationSeconds,
    response.stepSeconds,
    response.transformsBuffer,
  );
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return STUDIO_BG3D_PHYSICS_TIMELINE_WORKER_TIMEOUT_MS;
  return Math.max(100, Math.min(120_000, Math.floor(value ?? 0)));
}

function runNormalizedTimeline(
  input: NormalizedStudioBg3dPhysicsTimelineInput,
  options: StudioBg3dPhysicsTimelineWorkerOptions,
): Promise<StudioBg3dPhysicsTimelineResult> {
  const signal = options.signal;
  if (signal?.aborted) {
    return Promise.reject(new StudioBg3dPhysicsTimelineWorkerError("aborted"));
  }

  const factory = options.workerFactory ?? createStudioBg3dPhysicsTimelineModuleWorker;
  let worker: StudioBg3dPhysicsTimelineWorkerLike | null;
  try {
    worker = factory();
  } catch {
    return Promise.reject(new StudioBg3dPhysicsTimelineWorkerError("worker-failed"));
  }
  if (!worker) return Promise.reject(new StudioBg3dPhysicsTimelineWorkerError("worker-failed"));

  const requestId = allocateRequestId();
  const request: StudioBg3dPhysicsTimelineWorkerRunMessage = {
    version: STUDIO_BG3D_PHYSICS_TIMELINE_PROTOCOL_VERSION,
    kind: "run",
    requestId,
    input,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout);
      signal?.removeEventListener("abort", handleAbort);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerFailure);
      worker.removeEventListener("messageerror", handleWorkerFailure);
      worker.terminate();
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const fail = (code: StudioBg3dPhysicsTimelineWorkerErrorCode) => {
      finish(() => reject(new StudioBg3dPhysicsTimelineWorkerError(code)));
    };
    const handleAbort = () => fail("aborted");
    function handleWorkerFailure(event: WorkerErrorEventLike): void {
      event.preventDefault?.();
      fail("worker-failed");
    }
    function handleMessage(event: WorkerMessageEventLike): void {
      // A terminated/replaced Worker's late result must never settle a newer logical request.
      if (!isResponseForRequest(event.data, requestId)) return;
      if (!isStudioBg3dPhysicsTimelineWorkerResponseMessage(event.data)) {
        fail("protocol");
        return;
      }
      if (event.data.kind === "failure") {
        fail(event.data.code);
        return;
      }
      const result = resultFromResponse(event.data, input);
      if (!result) {
        fail("protocol");
        return;
      }
      finish(() => resolve(result));
    }

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerFailure);
    worker.addEventListener("messageerror", handleWorkerFailure);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    timeout = setTimeout(() => fail("timeout"), boundedTimeout(options.timeoutMs));
    try {
      worker.postMessage(request);
    } catch {
      fail("worker-failed");
    }
  });
}

/**
 * Runs a bounded deterministic physics bake off the main thread. A Worker is created lazily for
 * this job and always terminated on success, failure, timeout, or abort so stale WASM state cannot
 * cross timeline requests.
 */
export function runStudioBg3dPhysicsTimeline(
  inputValue: StudioBg3dPhysicsTimelineInput | unknown,
  options: StudioBg3dPhysicsTimelineWorkerOptions = {},
): Promise<StudioBg3dPhysicsTimelineResult> {
  if (options.signal?.aborted) {
    return Promise.reject(new StudioBg3dPhysicsTimelineWorkerError("aborted"));
  }
  const input = normalizeStudioBg3dPhysicsTimelineInput(inputValue);
  if (!input) {
    return Promise.reject(new StudioBg3dPhysicsTimelineWorkerError("invalid-request"));
  }
  return runNormalizedTimeline(input, options);
}
