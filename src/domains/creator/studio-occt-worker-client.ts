import type { StudioOcctSolidResult } from "./studio-occt-wasm-facade";
import type {
  StudioOcctWorkerOperation,
  StudioOcctWorkerRequest,
  StudioOcctWorkerResponse,
} from "./studio-occt-worker-protocol";

type PendingOperation = {
  readonly resolve: (result: StudioOcctSolidResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
  readonly detachAbort: () => void;
};

let nextRequestId = 1;
let worker: Worker | null = null;
const pending = new Map<number, PendingOperation>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isStudioOcctWorkerResponse(value: unknown): value is StudioOcctWorkerResponse {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 1) {
    return false;
  }
  const result = value.result;
  if (!isRecord(result) || typeof result.ok !== "boolean") return false;
  if (!result.ok) {
    return typeof result.code === "string"
      && result.code.length > 0
      && typeof result.detail === "string";
  }
  const mesh = result.mesh;
  return result.backend === "opencascade-wasm"
    && result.loadPath === "browser"
    && typeof result.operation === "string"
    && result.operation.length > 0
    && isNonNegativeInteger(result.faceCount)
    && isNonNegativeInteger(result.triangleCount)
    && isNonNegativeInteger(result.vertexCount)
    && typeof result.volumeApprox === "number"
    && Number.isFinite(result.volumeApprox)
    && isRecord(mesh)
    && mesh.revision === 1
    && Array.isArray(mesh.vertices)
    && Array.isArray(mesh.halfEdges)
    && Array.isArray(mesh.faces)
    && isNonNegativeInteger(mesh.nextVertexId)
    && isNonNegativeInteger(mesh.nextHalfEdgeId)
    && isNonNegativeInteger(mesh.nextFaceId);
}

function isNodeEnvironment(): boolean {
  if (typeof window !== "undefined") return false;
  try {
    const processValue = (globalThis as {
      readonly process?: { readonly versions?: { readonly node?: unknown } };
    }).process;
    return typeof processValue?.versions?.node === "string"
      && processValue.versions.node.length > 0;
  } catch {
    return false;
  }
}

function workerTransportError(prefix: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${detail}`);
}

function rejectAllPending(error: Error): void {
  for (const operation of pending.values()) {
    clearTimeout(operation.timeoutId);
    operation.detachAbort();
    operation.reject(error);
  }
  pending.clear();
}

function terminateWorker(error?: Error): void {
  worker?.terminate();
  worker = null;
  if (error) rejectAllPending(error);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const next = new Worker(new URL("./studio-occt.worker.ts", import.meta.url), {
    name: "toonspectrum-occt",
    type: "module",
  });
  next.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isStudioOcctWorkerResponse(event.data)) {
      terminateWorker(new Error("OCCT Worker returned an invalid response payload"));
      return;
    }
    const response = event.data;
    const operation = pending.get(response.id);
    if (!operation) return;
    pending.delete(response.id);
    clearTimeout(operation.timeoutId);
    operation.detachAbort();
    if (!response.result.ok) {
      operation.reject(new Error(`${response.result.code}: ${response.result.detail}`));
      return;
    }
    operation.resolve(response.result);
  });
  next.addEventListener("error", (event) => {
    terminateWorker(new Error(event.message || "OCCT Worker crashed"));
  });
  next.addEventListener("messageerror", () => {
    terminateWorker(new Error("OCCT Worker returned an unreadable result"));
  });
  worker = next;
  return next;
}

async function runOnNode(
  operation: StudioOcctWorkerOperation,
): Promise<StudioOcctSolidResult> {
  const facadeModuleId = "./studio-occt-wasm-facade";
  const facade = await import(
    /* @vite-ignore */ facadeModuleId
  ) as typeof import("./studio-occt-wasm-facade");
  const result = operation.kind === "box"
    ? await facade.occtMakeBoxSolid(...operation.size)
    : await facade.occtBooleanCutBoxes(operation.a, operation.b);
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result;
}

export async function runStudioOcctOperation(
  operation: StudioOcctWorkerOperation,
  options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  } = {},
): Promise<StudioOcctSolidResult> {
  if (options.signal?.aborted) {
    throw new DOMException("OCCT operation aborted", "AbortError");
  }
  if (isNodeEnvironment()) return runOnNode(operation);
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("OCCT Worker is unavailable in this browser");
  }

  const id = nextRequestId;
  nextRequestId += 1;
  const timeoutMs = Math.max(1_000, Math.min(300_000, options.timeoutMs ?? 120_000));
  const activeWorker = ensureWorker();
  return new Promise<StudioOcctSolidResult>((resolve, reject) => {
    const abort = () => {
      terminateWorker(new DOMException("OCCT operation aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const detachAbort = () => options.signal?.removeEventListener("abort", abort);
    const timeoutId = setTimeout(() => {
      terminateWorker(new Error(`OCCT Worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeoutId, detachAbort });
    const request: StudioOcctWorkerRequest = { id, operation };
    try {
      activeWorker.postMessage(request);
    } catch (error) {
      terminateWorker(workerTransportError("OCCT Worker postMessage failed", error));
    }
  });
}

export function disposeStudioOcctWorker(): void {
  terminateWorker(new Error("OCCT Worker disposed"));
}
