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
const isolatedTerminators = new Set<(error: Error) => void>();

/**
 * opencascade.js@1.1.1 wrappers whose `.delete()` corrupts the Embind table.
 * They are safe only when the entire WASM instance is discarded with its Worker.
 */
const REALM_ISOLATED_OPERATION_KINDS = new Set<StudioOcctWorkerOperation["kind"]>([
  "thick-shell-box",
  "fillet2d-extrude",
  "step-roundtrip-box",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFiniteVec3(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x === "number"
    && Number.isFinite(value.x)
    && typeof value.y === "number"
    && Number.isFinite(value.y)
    && typeof value.z === "number"
    && Number.isFinite(value.z);
}

function isStudioOcctTopologyReceipt(value: unknown): boolean {
  return isRecord(value)
    && value.source === "tessellated-triangle-mesh"
    && isNonNegativeInteger(value.boundaryEdgeCount)
    && isNonNegativeInteger(value.nonManifoldEdgeCount)
    && isNonNegativeInteger(value.orientationConflictEdgeCount)
    && isNonNegativeInteger(value.degenerateTriangleCount)
    && typeof value.consistentOrientation === "boolean"
    && typeof value.watertight === "boolean"
    && typeof value.closedSolid === "boolean"
    && typeof value.signedVolume === "number"
    && Number.isFinite(value.signedVolume);
}

function isStudioOcctMassProperties(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const inertia = value.inertia;
  const validInertia = inertia === null || (
    isRecord(inertia)
    && ["xx", "yy", "zz", "xy", "xz", "yz"].every((key) => (
      typeof inertia[key] === "number" && Number.isFinite(inertia[key])
    ))
  );
  return (value.source === "occt-brep" || value.source === "mixed-fallback")
    && value.density === 1
    && value.densityUnit === "mass/model-unit^3"
    && isFiniteNonNegative(value.mass)
    && isFiniteNonNegative(value.volume)
    && ["occt-brep", "analytic-fallback", "tessellated-mesh"].includes(
      String(value.volumeSource),
    )
    && isFiniteNonNegative(value.surfaceArea)
    && ["occt-brep", "tessellated-mesh"].includes(String(value.surfaceAreaSource))
    && (value.centroid === null || isFiniteVec3(value.centroid))
    && ["occt-brep", "tessellated-mesh", "unavailable"].includes(
      String(value.centroidSource),
    )
    && validInertia
    && ["occt-brep", "unavailable"].includes(String(value.inertiaSource))
    && typeof value.approximate === "boolean";
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
    && isStudioOcctTopologyReceipt(result.topology)
    && isStudioOcctMassProperties(result.massProperties)
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

function runInOneShotBrowserWorker(
  id: number,
  operation: StudioOcctWorkerOperation,
  options: {
    readonly signal?: AbortSignal;
    readonly timeoutMs: number;
  },
): Promise<StudioOcctSolidResult> {
  const isolatedWorker = new Worker(new URL("./studio-occt.worker.ts", import.meta.url), {
    name: `toonspectrum-occt-isolated-${id}`,
    type: "module",
  });
  return new Promise<StudioOcctSolidResult>((resolve, reject) => {
    let settled = false;
    const settle = (
      next: { readonly ok: true; readonly result: StudioOcctSolidResult }
        | { readonly ok: false; readonly error: Error },
    ) => {
      if (settled) return;
      settled = true;
      isolatedTerminators.delete(terminateWithError);
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abort);
      isolatedWorker.terminate();
      if (next.ok) resolve(next.result);
      else reject(next.error);
    };
    const abort = () => settle({
      ok: false,
      error: new DOMException("OCCT operation aborted", "AbortError"),
    });
    const terminateWithError = (error: Error) => settle({ ok: false, error });
    const timeoutId = setTimeout(() => settle({
      ok: false,
      error: new Error(`OCCT Worker timed out after ${options.timeoutMs}ms`),
    }), options.timeoutMs);
    isolatedTerminators.add(terminateWithError);
    options.signal?.addEventListener("abort", abort, { once: true });
    isolatedWorker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isStudioOcctWorkerResponse(event.data) || event.data.id !== id) {
        settle({
          ok: false,
          error: new Error("OCCT Worker returned an invalid response payload"),
        });
        return;
      }
      if (!event.data.result.ok) {
        settle({
          ok: false,
          error: new Error(`${event.data.result.code}: ${event.data.result.detail}`),
        });
        return;
      }
      settle({ ok: true, result: event.data.result });
    });
    isolatedWorker.addEventListener("error", (event) => settle({
      ok: false,
      error: new Error(event.message || "OCCT Worker crashed"),
    }));
    isolatedWorker.addEventListener("messageerror", () => settle({
      ok: false,
      error: new Error("OCCT Worker returned an unreadable result"),
    }));

    try {
      const request: StudioOcctWorkerRequest = { id, operation };
      isolatedWorker.postMessage(request);
    } catch (error) {
      settle({
        ok: false,
        error: workerTransportError("OCCT Worker postMessage failed", error),
      });
    }
  });
}

async function runOnNode(
  operation: StudioOcctWorkerOperation,
): Promise<StudioOcctSolidResult> {
  const facadeModuleId = "./studio-occt-wasm-facade";
  const facade = await import(
    /* @vite-ignore */ facadeModuleId
  ) as typeof import("./studio-occt-wasm-facade");
  const result = await (async () => {
    switch (operation.kind) {
      case "box":
        return facade.occtMakeBoxSolid(...operation.size);
      case "sphere":
        return facade.occtMakeSphereSolid(operation.radius);
      case "torus":
        return facade.occtMakeTorusSolid(operation.majorRadius, operation.minorRadius);
      case "pipe":
        return facade.occtMakePipeSolid(operation.length, operation.radius);
      case "mirror-box":
        return facade.occtMirrorBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
        );
      case "thick-shell-box":
        return facade.occtMakeThickShellBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.thickness,
        );
      case "wedge":
        return facade.occtMakeWedgeSolid(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.ltx,
        );
      case "offset-shape-box":
        return facade.occtOffsetShapeBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.offset,
        );
      case "fillet2d-extrude":
        return facade.occtFillet2dExtrudeSolid(
          operation.width,
          operation.height,
          operation.depth,
          operation.filletRadius,
        );
      case "pipe-shell":
        return facade.occtMakePipeShellSolid(operation.length, operation.radius);
      case "section-box":
        return facade.occtSectionBoxByPlane(
          operation.size[0],
          operation.size[1],
          operation.size[2],
        );
      case "draft-prism":
        return facade.occtDraftPrismOnBox(
          operation.baseSize,
          operation.profileInset,
          operation.height,
          operation.angle,
        );
      case "linear-pattern-box":
        return facade.occtLinearPatternBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.offsetX,
          operation.count,
        );
      case "circular-pattern-box":
        return facade.occtCircularPatternBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.radius,
          operation.count,
        );
      case "step-roundtrip-box": {
        const step = await facade.occtStepRoundTripBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
        );
        if (!step.ok) {
          return { ok: false as const, code: step.code, detail: step.detail };
        }
        return {
          ok: true as const,
          mesh: step.mesh,
          faceCount: step.faceCount,
          triangleCount: step.triangleCount,
          vertexCount: step.vertexCount,
          volumeApprox: step.volumeApprox,
          topology: step.topology,
          massProperties: step.massProperties,
          backend: "opencascade-wasm" as const,
          operation: step.operation,
          loadPath: step.loadPath,
        };
      }
      case "revolve":
        return facade.occtRevolveCylinderLike(operation.radius, operation.height);
      case "fillet-box":
        return facade.occtFilletBox(
          operation.size[0],
          operation.size[1],
          operation.size[2],
          operation.radius,
        );
      case "loft":
        return facade.occtLoftedTower(operation.levels);
      case "cut-boxes":
        return facade.occtBooleanCutBoxes(operation.a, operation.b);
      default: {
        const _exhaustive: never = operation;
        return {
          ok: false as const,
          code: "unknown-op",
          detail: String(_exhaustive),
        };
      }
    }
  })();
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
  if (REALM_ISOLATED_OPERATION_KINDS.has(operation.kind)) {
    return runInOneShotBrowserWorker(id, operation, {
      signal: options.signal,
      timeoutMs,
    });
  }
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
  for (const terminate of [...isolatedTerminators]) {
    terminate(new Error("OCCT Worker disposed"));
  }
}
