/**
 * Web Worker client for asynchronous brush stroke calculation.
 */
import { processFreehandPoints } from "../studio-brush";

import {
  STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
  type StudioBrushWorkerPlanRequest,
  type StudioBrushWorkerPlanResponse,
} from "./studio-brush-worker-protocol";

export const STUDIO_BRUSH_WORKER_REQUEST_TIMEOUT_MS = 10_000;

export interface StudioBrushWorkerRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

interface PendingBrushWorkerRequest {
  readonly worker: Worker;
  readonly resolve: (res: StudioBrushWorkerPlanResponse) => void;
  readonly reject: (err: unknown) => void;
  timeout: ReturnType<typeof setTimeout> | null;
  abortSignal: AbortSignal | null;
  abortListener: (() => void) | null;
}

let globalBrushWorker: Worker | null = null;
const pendingRequests = new Map<string, PendingBrushWorkerRequest>();

function cleanupPendingRequest(id: string, deferred: PendingBrushWorkerRequest): boolean {
  if (pendingRequests.get(id) !== deferred) return false;
  pendingRequests.delete(id);
  if (deferred.timeout !== null) {
    clearTimeout(deferred.timeout);
    deferred.timeout = null;
  }
  if (deferred.abortSignal && deferred.abortListener) {
    deferred.abortSignal.removeEventListener("abort", deferred.abortListener);
  }
  deferred.abortSignal = null;
  deferred.abortListener = null;
  return true;
}

function retireBrushWorker(worker: Worker, reason: unknown): void {
  if (globalBrushWorker === worker) globalBrushWorker = null;

  worker.onmessage = null;
  worker.onerror = null;
  worker.onmessageerror = null;
  try {
    worker.terminate();
  } catch {
    // A crashed or already-terminated Worker is still considered retired.
  }

  for (const [id, deferred] of [...pendingRequests.entries()]) {
    if (deferred.worker !== worker) continue;
    if (!cleanupPendingRequest(id, deferred)) continue;
    deferred.reject(reason);
  }
}

function getOrCreateBrushWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (globalBrushWorker) return globalBrushWorker;

  try {
    const worker = new Worker(
      new URL("./studio-brush-worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<StudioBrushWorkerPlanResponse>) => {
      const data = event.data;
      if (!data || typeof data.id !== "string") return;
      const deferred = pendingRequests.get(data.id);
      // A late response from a retired generation must never settle a request
      // that belongs to a replacement Worker.
      if (!deferred || deferred.worker !== worker) return;
      if (!cleanupPendingRequest(data.id, deferred)) return;
      deferred.resolve(data);
    };

    worker.onerror = (error) => {
      retireBrushWorker(worker, error);
    };
    worker.onmessageerror = (error) => {
      retireBrushWorker(worker, error);
    };

    globalBrushWorker = worker;
    return worker;
  } catch {
    return null;
  }
}

/**
 * Release the process-wide brush Worker and drain its requests through the
 * synchronous planner fallback. This is safe to call more than once.
 */
export function disposeStudioBrushWorkerClient(): void {
  const worker = globalBrushWorker;
  if (!worker) return;
  retireBrushWorker(worker, new Error("Studio brush Worker disposed"));
}

let requestIdCounter = 0;

export async function processFreehandPointsInWorker(
  points: number[],
  minDistance?: number,
  brushId = "pen",
  strokeWidth = 6,
  seed = 42,
  options: StudioBrushWorkerRequestOptions = {},
): Promise<number[]> {
  if (options.signal?.aborted) return processFreehandPoints(points, minDistance);

  const worker = getOrCreateBrushWorker();
  if (!worker) {
    return processFreehandPoints(points, minDistance);
  }

  const id = `brush-work-${++requestIdCounter}-${Date.now()}`;
  const request: StudioBrushWorkerPlanRequest = {
    version: STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
    id,
    brushId,
    points,
    strokeWidth,
    seed,
    sampleSpacing: minDistance,
  };

  return new Promise<number[]>((resolve) => {
    const fallback = () => processFreehandPoints(points, minDistance);
    const deferred: PendingBrushWorkerRequest = {
      worker,
      timeout: null,
      abortSignal: options.signal ?? null,
      abortListener: null,
      resolve: (res) => resolve(res.ok ? res.points : fallback()),
      reject: () => resolve(fallback()),
    };
    pendingRequests.set(id, deferred);

    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, Math.floor(options.timeoutMs ?? STUDIO_BRUSH_WORKER_REQUEST_TIMEOUT_MS))
      : STUDIO_BRUSH_WORKER_REQUEST_TIMEOUT_MS;
    deferred.timeout = setTimeout(() => {
      if (pendingRequests.get(id) !== deferred) return;
      // A request that never replies usually means the Worker generation is
      // wedged. Retire the generation so every retained closure is drained and
      // the next stroke gets a fresh Worker.
      retireBrushWorker(worker, new DOMException("Studio brush Worker request timed out", "TimeoutError"));
    }, timeoutMs);

    if (options.signal) {
      const abort = () => {
        if (!cleanupPendingRequest(id, deferred)) return;
        deferred.reject(new DOMException("Studio brush Worker request aborted", "AbortError"));
      };
      deferred.abortListener = abort;
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.signal.aborted) {
        abort();
        return;
      }
    }

    try {
      worker.postMessage(request);
    } catch (error) {
      // postMessage can synchronously fail for an already-terminated/crashed
      // Worker. Retiring the generation ensures the next stroke gets a fresh
      // Worker instead of accumulating unresolved requests on a dead object.
      retireBrushWorker(worker, error);
    }
  });
}
