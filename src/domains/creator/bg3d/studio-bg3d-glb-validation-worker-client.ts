import {
  validateStudioBg3dGlb,
  type StudioBg3dGlbValidationOptions,
  type StudioBg3dGlbValidationResult,
} from "./studio-bg3d-glb-validation";
import {
  STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
  isStudioBg3dGlbWorkerResponse,
  type StudioBg3dGlbWorkerRequest,
} from "./studio-bg3d-glb-validation-worker-protocol";

export const STUDIO_BG3D_GLB_WORKER_TIMEOUT_MS = 90_000;

/**
 * Synchronous validation above this ceiling is deliberately unavailable. Eight MiB keeps the
 * compatibility path useful for small files without allowing a missing Worker to move a large
 * digest/container/texture preflight onto the render thread.
 */
export const STUDIO_BG3D_GLB_MAIN_THREAD_FALLBACK_MAX_BYTES = 8 * 1024 * 1024;

/** Whether this byte payload must have a functioning validation Worker. */
export function studioBg3dGlbRequiresValidationWorker(
  input: ArrayBuffer | Uint8Array,
): boolean {
  return input.byteLength > STUDIO_BG3D_GLB_MAIN_THREAD_FALLBACK_MAX_BYTES;
}

export type StudioBg3dGlbValidationExecution = "worker" | "main-thread";

export interface StudioBg3dGlbWorkerValidationOutcome {
  readonly execution: StudioBg3dGlbValidationExecution;
  readonly result: StudioBg3dGlbValidationResult;
}

interface WorkerMessageEventLike {
  readonly data: unknown;
}

interface WorkerErrorEventLike {
  preventDefault?(): void;
}

export interface StudioBg3dValidationWorkerLike {
  postMessage(message: StudioBg3dGlbWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: WorkerErrorEventLike) => void): void;
  terminate(): void;
}

interface PendingValidation {
  readonly resolve: (outcome: StudioBg3dGlbWorkerValidationOutcome) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
}

export interface StudioBg3dValidationWorkerClientOptions {
  readonly workerFactory: () => StudioBg3dValidationWorkerLike;
  readonly timeoutMs?: number;
}

export interface StudioBg3dValidationWorkerLifecycleMetrics {
  readonly workersCreated: number;
  readonly workersTerminated: number;
  readonly workerRecoveries: number;
  readonly abortTerminations: number;
  readonly timeoutTerminations: number;
  readonly failureTerminations: number;
  readonly protocolTerminations: number;
  readonly disposeTerminations: number;
}

type StudioBg3dWorkerTerminationReason =
  | "abort"
  | "dispose"
  | "failure"
  | "protocol"
  | "timeout";

export class StudioBg3dValidationWorkerError extends Error {
  constructor(readonly code:
    | "aborted"
    | "basis-worker-attestation-required"
    | "disposed"
    | "protocol"
    | "timeout"
    | "worker-failed"
  ) {
    super(`studio-bg3d-validation-worker:${code}`);
    this.name = "StudioBg3dValidationWorkerError";
  }
}

function copyToOwnedBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  const source = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return Uint8Array.from(source).buffer;
}

function serializableValidationOptions(
  options: StudioBg3dGlbValidationOptions,
): Omit<
  StudioBg3dGlbValidationOptions,
  "basisPayloadPreflight" | "basisRuntimeProvider" | "basisTranscoderCapability" | "digest"
> {
  const {
    basisPayloadPreflight: _basisPayloadPreflight,
    basisRuntimeProvider: _basisRuntimeProvider,
    basisTranscoderCapability: _basisTranscoderCapability,
    digest: _digest,
    ...serializable
  } = options;
  return serializable;
}

export class StudioBg3dValidationWorkerClient {
  readonly #workerFactory: () => StudioBg3dValidationWorkerLike;
  readonly #timeoutMs: number;
  readonly #pending = new Map<number, PendingValidation>();
  #worker: StudioBg3dValidationWorkerLike | null = null;
  #nextRequestId = 1;
  #disposed = false;
  readonly #lifecycle = {
    workersCreated: 0,
    workersTerminated: 0,
    workerRecoveries: 0,
    abortTerminations: 0,
    timeoutTerminations: 0,
    failureTerminations: 0,
    protocolTerminations: 0,
    disposeTerminations: 0,
  };

  constructor(options: StudioBg3dValidationWorkerClientOptions) {
    this.#workerFactory = options.workerFactory;
    this.#timeoutMs = Math.max(1_000, Math.min(300_000, options.timeoutMs ?? STUDIO_BG3D_GLB_WORKER_TIMEOUT_MS));
    this.#worker = this.#createWorker();
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  get lifecycleMetrics(): StudioBg3dValidationWorkerLifecycleMetrics {
    return Object.freeze({ ...this.#lifecycle });
  }

  validate(
    input: ArrayBuffer | Uint8Array,
    options: StudioBg3dGlbValidationOptions,
    signal?: AbortSignal,
  ): Promise<StudioBg3dGlbWorkerValidationOutcome> {
    if (this.#disposed) return Promise.reject(new StudioBg3dValidationWorkerError("disposed"));
    if (signal?.aborted) return Promise.reject(new StudioBg3dValidationWorkerError("aborted"));

    let worker: StudioBg3dValidationWorkerLike;
    try {
      worker = this.#worker ?? this.#createWorker();
      this.#worker = worker;
    } catch {
      return Promise.reject(new StudioBg3dValidationWorkerError("worker-failed"));
    }
    const requestId = this.#allocateRequestId();
    const bytes = copyToOwnedBuffer(input);
    return new Promise((resolve, reject) => {
      let requestPosted = false;
      const timeout = setTimeout(() => {
        const pending = this.#finish(requestId);
        if (!pending) return;
        pending.reject(new StudioBg3dValidationWorkerError("timeout"));
        this.#discardWorker(new StudioBg3dValidationWorkerError("worker-failed"), "timeout");
      }, this.#timeoutMs);
      const abortListener = signal
        ? () => {
            const pending = this.#finish(requestId);
            if (!pending) return;
            pending.reject(new StudioBg3dValidationWorkerError("aborted"));
            if (requestPosted) {
              // Basis `transcodeImage` is synchronous WASM. A queued cancel message cannot run
              // until that call returns, so termination is the only hard cancellation boundary.
              this.#discardWorker(new StudioBg3dValidationWorkerError("worker-failed"), "abort");
            }
          }
        : undefined;
      this.#pending.set(requestId, { resolve, reject, timeout, signal, abortListener });
      signal?.addEventListener("abort", abortListener!, { once: true });
      if (signal?.aborted) {
        abortListener?.();
        return;
      }

      const request: StudioBg3dGlbWorkerRequest = {
        version: STUDIO_BG3D_GLB_VALIDATION_WORKER_PROTOCOL_VERSION,
        kind: "validate",
        requestId,
        bytes,
        options: serializableValidationOptions(options),
      };
      try {
        requestPosted = true;
        worker.postMessage(request, [bytes]);
      } catch {
        this.#discardWorker(new StudioBg3dValidationWorkerError("worker-failed"), "failure");
      }
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#discardWorker(new StudioBg3dValidationWorkerError("disposed"), "dispose");
  }

  #createWorker(): StudioBg3dValidationWorkerLike {
    const worker = this.#workerFactory();
    this.#lifecycle.workersCreated += 1;
    if (this.#lifecycle.workersCreated > 1) this.#lifecycle.workerRecoveries += 1;
    try {
      worker.addEventListener("message", this.#handleMessage);
      worker.addEventListener("error", this.#handleWorkerFailure);
      worker.addEventListener("messageerror", this.#handleWorkerFailure);
      return worker;
    } catch (error) {
      worker.terminate();
      this.#recordTermination("failure");
      throw error;
    }
  }

  #allocateRequestId(): number {
    while (this.#pending.has(this.#nextRequestId)) {
      this.#nextRequestId = this.#nextRequestId >= Number.MAX_SAFE_INTEGER ? 1 : this.#nextRequestId + 1;
    }
    const result = this.#nextRequestId;
    this.#nextRequestId = result >= Number.MAX_SAFE_INTEGER ? 1 : result + 1;
    return result;
  }

  #finish(requestId: number): PendingValidation | undefined {
    const pending = this.#pending.get(requestId);
    if (!pending) return undefined;
    this.#pending.delete(requestId);
    clearTimeout(pending.timeout);
    if (pending.abortListener) pending.signal?.removeEventListener("abort", pending.abortListener);
    return pending;
  }

  readonly #handleMessage = (event: WorkerMessageEventLike): void => {
    const response = event.data;
    if (!isStudioBg3dGlbWorkerResponse(response)) {
      this.#discardWorker(new StudioBg3dValidationWorkerError("protocol"), "protocol");
      return;
    }
    const pending = this.#finish(response.requestId);
    if (!pending) return;
    if (response.kind === "error") {
      const error = new StudioBg3dValidationWorkerError("worker-failed");
      pending.reject(error);
      this.#discardWorker(error, "failure");
      return;
    }
    pending.resolve({ execution: "worker", result: response.result });
  };

  readonly #handleWorkerFailure = (event: WorkerErrorEventLike): void => {
    event.preventDefault?.();
    this.#discardWorker(new StudioBg3dValidationWorkerError("worker-failed"), "failure");
  };

  #recordTermination(reason: StudioBg3dWorkerTerminationReason): void {
    this.#lifecycle.workersTerminated += 1;
    if (reason === "abort") this.#lifecycle.abortTerminations += 1;
    if (reason === "timeout") this.#lifecycle.timeoutTerminations += 1;
    if (reason === "failure") this.#lifecycle.failureTerminations += 1;
    if (reason === "protocol") this.#lifecycle.protocolTerminations += 1;
    if (reason === "dispose") this.#lifecycle.disposeTerminations += 1;
  }

  #discardWorker(
    error: StudioBg3dValidationWorkerError,
    reason: StudioBg3dWorkerTerminationReason,
  ): void {
    const worker = this.#worker;
    this.#worker = null;
    if (worker) {
      worker.removeEventListener("message", this.#handleMessage);
      worker.removeEventListener("error", this.#handleWorkerFailure);
      worker.removeEventListener("messageerror", this.#handleWorkerFailure);
      worker.terminate();
      this.#recordTermination(reason);
    }
    for (const requestId of [...this.#pending.keys()]) this.#finish(requestId)?.reject(error);
  }
}

export interface StudioBg3dValidationWorkerPoolOptions
  extends StudioBg3dValidationWorkerClientOptions {
  readonly maximumWorkers?: number;
}

/**
 * Lazily expands validation to a tiny worker pool. A second worker is created only while every
 * existing worker is busy, preventing a single-file import from paying extra startup/heap cost.
 */
export class StudioBg3dValidationWorkerPool {
  readonly #clientOptions: StudioBg3dValidationWorkerClientOptions;
  readonly #maximumWorkers: number;
  readonly #clients: StudioBg3dValidationWorkerClient[] = [];
  #disposed = false;

  constructor(options: StudioBg3dValidationWorkerPoolOptions) {
    this.#clientOptions = options;
    this.#maximumWorkers = Number.isFinite(options.maximumWorkers)
      ? Math.max(1, Math.min(2, Math.floor(options.maximumWorkers ?? 1)))
      : 1;
  }

  validate(
    input: ArrayBuffer | Uint8Array,
    options: StudioBg3dGlbValidationOptions,
    signal?: AbortSignal,
  ): Promise<StudioBg3dGlbWorkerValidationOutcome> {
    if (this.#disposed) return Promise.reject(new StudioBg3dValidationWorkerError("disposed"));
    let client = this.#clients.reduce<StudioBg3dValidationWorkerClient | null>(
      (best, candidate) => !best || candidate.pendingCount < best.pendingCount ? candidate : best,
      null,
    );
    if (
      (!client || client.pendingCount > 0) &&
      this.#clients.length < this.#maximumWorkers
    ) {
      client = new StudioBg3dValidationWorkerClient(this.#clientOptions);
      this.#clients.push(client);
    }
    client ??= this.#clients[0] ?? null;
    if (!client) return Promise.reject(new StudioBg3dValidationWorkerError("worker-failed"));
    return client.validate(input, options, signal);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const client of this.#clients) client.dispose();
    this.#clients.length = 0;
  }
}

let sharedPool: StudioBg3dValidationWorkerPool | null = null;

function browserWorkerFactory(): StudioBg3dValidationWorkerLike {
  return new Worker(
    new URL("./studio-bg3d-glb-validation.worker.ts", import.meta.url),
    { name: "toonspectrum-bg3d-glb-validator", type: "module" },
  );
}

function maximumBrowserValidationWorkers(): number {
  if (typeof navigator !== "object" || !navigator) return 1;
  const hardwareConcurrency = Number(navigator.hardwareConcurrency);
  const deviceMemory = Number((navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory);
  if (!Number.isFinite(hardwareConcurrency) || hardwareConcurrency <= 4) return 1;
  if (Number.isFinite(deviceMemory) && deviceMemory <= 4) return 1;
  return 2;
}

function canUseBrowserWorker(options: StudioBg3dGlbValidationOptions): boolean {
  // A same-realm runtime attestation is deliberately not structured-cloneable proof.
  return options.digest === undefined &&
    options.basisPayloadPreflight === undefined &&
    options.basisRuntimeProvider === undefined &&
    options.basisTranscoderCapability === undefined &&
    typeof Worker === "function";
}

function abortedValidationError(): StudioBg3dValidationWorkerError {
  return new StudioBg3dValidationWorkerError("aborted");
}

function unavailableValidationWorkerError(): StudioBg3dValidationWorkerError {
  // Keep the established public worker error contract while making the large-job branch explicit.
  return new StudioBg3dValidationWorkerError("worker-failed");
}

function validateStudioBg3dGlbWithBoundedMainThreadFallback(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dGlbValidationOptions,
  signal?: AbortSignal,
): Promise<StudioBg3dGlbWorkerValidationOutcome> {
  if (signal?.aborted) return Promise.reject(abortedValidationError());
  if (studioBg3dGlbRequiresValidationWorker(input)) {
    return Promise.reject(unavailableValidationWorkerError());
  }
  return validateStudioBg3dGlbOnMainThread(input, options, signal);
}

async function validateStudioBg3dGlbOnMainThread(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dGlbValidationOptions,
  signal?: AbortSignal,
): Promise<StudioBg3dGlbWorkerValidationOutcome> {
  if (signal?.aborted) throw abortedValidationError();
  if (!signal) {
    return { execution: "main-thread", result: await validateStudioBg3dGlb(input, options) };
  }

  let abortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(abortedValidationError());
    signal.addEventListener("abort", abortListener, { once: true });
    if (signal.aborted) abortListener();
  });
  try {
    const result = await Promise.race([
      validateStudioBg3dGlb(input, options),
      abortPromise,
    ]);
    if (signal.aborted) throw abortedValidationError();
    return { execution: "main-thread", result };
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

/**
 * Runs the engine-neutral GLB trust boundary outside the render/UI thread when workers are
 * available. Injected digest adapters deliberately stay in-process so deterministic tests and
 * restricted runtimes preserve their exact semantics.
 */
export async function validateStudioBg3dGlbOffMainThread(
  input: ArrayBuffer | Uint8Array,
  options: StudioBg3dGlbValidationOptions,
  signal?: AbortSignal,
): Promise<StudioBg3dGlbWorkerValidationOutcome> {
  // Never move a potentially 100 MiB required-Basis validation job onto the UI thread merely to
  // preserve a main-realm capability. The dedicated Worker must fetch and attest its own runtime
  // before this path can be enabled.
  if (
    options.basisTranscoderCapability !== undefined ||
    options.basisPayloadPreflight !== undefined ||
    options.basisRuntimeProvider !== undefined
  ) {
    throw new StudioBg3dValidationWorkerError("basis-worker-attestation-required");
  }
  if (!canUseBrowserWorker(options)) {
    return validateStudioBg3dGlbWithBoundedMainThreadFallback(input, options, signal);
  }
  try {
    sharedPool ??= new StudioBg3dValidationWorkerPool({
      workerFactory: browserWorkerFactory,
      maximumWorkers: maximumBrowserValidationWorkers(),
    });
  } catch {
    return validateStudioBg3dGlbWithBoundedMainThreadFallback(input, options, signal);
  }
  const pool = sharedPool;
  try {
    return await pool.validate(input, options, signal);
  } catch (error) {
    const workerStarted = error instanceof StudioBg3dValidationWorkerError;
    if (
      workerStarted
      && error.code !== "aborted"
      && sharedPool === pool
    ) {
      pool.dispose();
      sharedPool = null;
    }
    if (workerStarted) throw error;

    // Browser Worker construction can throw before the client establishes its typed lifecycle.
    // Small inputs retain the compatibility path; large inputs fail closed with the existing code.
    if (sharedPool === pool) {
      pool.dispose();
      sharedPool = null;
    }
    return validateStudioBg3dGlbWithBoundedMainThreadFallback(input, options, signal);
  }
}

export function disposeSharedStudioBg3dValidationWorker(): void {
  sharedPool?.dispose();
  sharedPool = null;
}
