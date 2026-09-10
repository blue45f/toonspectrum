/**
 * Web Worker client for asynchronous brush stroke calculation.
 */
import { processFreehandPoints } from "../studio-brush";

import {
  STUDIO_BRUSH_WORKER_PROTOCOL_VERSION,
  type StudioBrushWorkerPlanRequest,
  type StudioBrushWorkerPlanResponse,
} from "./studio-brush-worker-protocol";

let globalBrushWorker: Worker | null = null;
const pendingRequests = new Map<
  string,
  {
    worker: Worker;
    resolve: (res: StudioBrushWorkerPlanResponse) => void;
    reject: (err: unknown) => void;
  }
>();

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

  for (const [id, deferred] of pendingRequests.entries()) {
    if (deferred.worker !== worker) continue;
    pendingRequests.delete(id);
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
      pendingRequests.delete(data.id);
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
  seed = 42
): Promise<number[]> {
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
    pendingRequests.set(id, {
      worker,
      resolve: (res) => resolve(res.ok ? res.points : processFreehandPoints(points, minDistance)),
      reject: () => resolve(processFreehandPoints(points, minDistance)),
    });
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
