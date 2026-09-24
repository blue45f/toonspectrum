import {
  CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES,
  CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
  estimateCharacterAuthoringTaskBytes,
  isCharacterAuthoringWorkerMeshPayload,
  isCharacterAuthoringWorkerResponse,
  type CharacterAuthoringWorkerFailureCode,
  type CharacterAuthoringWorkerRequest,
  type CharacterAuthoringWorkerResultPayload,
  type CharacterAuthoringWorkerTask,
} from "./character-authoring-worker-protocol";
import { executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";
import { validateCharacterDocumentV3 } from "../document/character-document-v3";
import { validateCharacterGroomDocument } from "../groom/character-groom-document";

export type CharacterAuthoringWorkerClientErrorCode =
  | CharacterAuthoringWorkerFailureCode
  | "aborted"
  | "disposed"
  | "protocol"
  | "timeout"
  | "worker-failed"
  | "worker-unavailable";

export interface CharacterAuthoringWorkerProgress {
  readonly stage: "queued" | "validating" | "computing" | "packing" | "ready" | "main-thread-fallback";
  readonly progress: number;
  readonly requestId: number;
  readonly generationId: number;
}

export interface CharacterAuthoringWorkerExecutionOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly allowMainThreadFallback?: boolean;
  readonly onProgress?: (progress: CharacterAuthoringWorkerProgress) => void;
}

interface MessageEventLike {
  readonly data: unknown;
}

interface ErrorEventLike {
  preventDefault?(): void;
}

export interface CharacterAuthoringWorkerLike {
  postMessage(message: CharacterAuthoringWorkerRequest): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: ErrorEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: ErrorEventLike) => void): void;
  terminate(): void;
}

export interface CharacterAuthoringWorkerClientOptions {
  readonly workerFactory?: () => CharacterAuthoringWorkerLike | null;
  readonly defaultTimeoutMs?: number;
}

export class CharacterAuthoringWorkerClientError extends Error {
  constructor(readonly code: CharacterAuthoringWorkerClientErrorCode, message: string = code, options?: ErrorOptions) {
    super(message, options);
    this.name = code === "aborted" ? "AbortError" : "CharacterAuthoringWorkerClientError";
  }
}

function createModuleWorker(): CharacterAuthoringWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./character-authoring.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-character-authoring",
  });
}

function timeoutMs(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(120_000, Math.max(1, Math.trunc(value!)));
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function identity(value: unknown): { readonly requestId: number; readonly generationId: number } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const requestId = Reflect.get(value, "requestId");
  const generationId = Reflect.get(value, "generationId");
  return positive(requestId) && positive(generationId) ? { requestId, generationId } : null;
}

function validateResult(result: CharacterAuthoringWorkerResultPayload): CharacterAuthoringWorkerResultPayload {
  if (result.kind === "document-v3") {
    return Object.freeze({ kind: "document-v3" as const, document: validateCharacterDocumentV3(result.document) });
  }
  if (result.kind === "groom-guide") {
    const topologyRevision = result.guide.points.find((point) => point.surfaceAnchor)?.surfaceAnchor?.topologyRevision
      ?? "unbound-topology";
    const document = validateCharacterGroomDocument({
      version: 1,
      topologyRevision,
      groups: [{
        groupId: "worker:validation",
        name: "Worker validation",
        scalpRegionId: "scalp:validation",
        materialId: "material:validation",
        visible: true,
        locked: false,
        profile: {
          baseWidth: 1,
          taper: 0,
          lengthScale: 1,
          curl: 0,
          wave: 0,
          clump: 0,
          noise: 0,
          rootRotation: 0,
          lineOnly: false,
          fill: true,
          segmentsPerSpan: 1,
        },
        guides: [result.guide],
      }],
    });
    return Object.freeze({ kind: "groom-guide" as const, guide: document.groups[0]!.guides[0]! });
  }
  if (!isCharacterAuthoringWorkerMeshPayload(result)) {
    throw new CharacterAuthoringWorkerClientError("protocol", "Worker가 손상된 3D 메시를 반환했습니다.");
  }
  for (const buffer of [result.positions, result.normals, result.uvs]) {
    const values = new Float32Array(buffer);
    for (const value of values) {
      if (!Number.isFinite(value)) {
        throw new CharacterAuthoringWorkerClientError("protocol", "Worker 메시 좌표에 유한하지 않은 값이 있습니다.");
      }
    }
  }
  const indices = new Uint32Array(result.indices);
  for (const index of indices) {
    if (index >= result.vertexCount) {
      throw new CharacterAuthoringWorkerClientError("protocol", "Worker 메시 인덱스가 정점 범위를 벗어났습니다.");
    }
  }
  return result;
}

export class CharacterAuthoringWorkerClient {
  readonly #workerFactory: () => CharacterAuthoringWorkerLike | null;
  readonly #defaultTimeoutMs: number;
  #nextRequestId = 1;
  #nextGenerationId = 1;
  #disposed = false;

  constructor(options: CharacterAuthoringWorkerClientOptions = {}) {
    this.#workerFactory = options.workerFactory ?? createModuleWorker;
    this.#defaultTimeoutMs = timeoutMs(options.defaultTimeoutMs, 30_000);
  }

  execute(
    task: CharacterAuthoringWorkerTask,
    options: CharacterAuthoringWorkerExecutionOptions = {},
  ): Promise<CharacterAuthoringWorkerResultPayload> {
    if (this.#disposed) {
      return Promise.reject(new CharacterAuthoringWorkerClientError("disposed"));
    }
    if (options.signal?.aborted) {
      return Promise.reject(new CharacterAuthoringWorkerClientError("aborted"));
    }
    let inputBytes: number;
    try {
      inputBytes = estimateCharacterAuthoringTaskBytes(task);
    } catch (error) {
      return Promise.reject(new CharacterAuthoringWorkerClientError("invalid-request", "3D 저작 작업을 직렬화하지 못했습니다.", { cause: error }));
    }
    if (inputBytes <= 0 || inputBytes > CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES) {
      return Promise.reject(new CharacterAuthoringWorkerClientError("input-too-large"));
    }
    const requestId = this.#allocate("request");
    const generationId = this.#allocate("generation");
    options.onProgress?.({ stage: "queued", progress: 0, requestId, generationId });

    let worker: CharacterAuthoringWorkerLike | null = null;
    try {
      worker = this.#workerFactory();
    } catch (error) {
      if (options.allowMainThreadFallback === false) {
        return Promise.reject(new CharacterAuthoringWorkerClientError("worker-unavailable", "3D 저작 Worker를 만들지 못했습니다.", { cause: error }));
      }
    }
    if (!worker) {
      if (options.allowMainThreadFallback === false) {
        return Promise.reject(new CharacterAuthoringWorkerClientError("worker-unavailable"));
      }
      return this.#executeFallback(task, requestId, generationId, options);
    }

    const request: CharacterAuthoringWorkerRequest = {
      version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION,
      kind: "execute",
      requestId,
      generationId,
      inputBytes,
      task,
    };
    const maximum = timeoutMs(options.timeoutMs, this.#defaultTimeoutMs);
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanups: (() => void)[] = [];
      const settle = (
        outcome: CharacterAuthoringWorkerResultPayload | CharacterAuthoringWorkerClientError,
      ) => {
        if (settled) return;
        settled = true;
        for (const cleanup of cleanups.splice(0)) {
          try { cleanup(); } catch { /* cleanup cannot reclaim authority */ }
        }
        try { worker?.terminate(); } catch { /* ignore */ }
        if (outcome instanceof CharacterAuthoringWorkerClientError) reject(outcome);
        else resolve(outcome);
      };
      const onFailure = (event: ErrorEventLike) => {
        event.preventDefault?.();
        settle(new CharacterAuthoringWorkerClientError("worker-failed"));
      };
      let lastProgress = 0;
      const stageOrder: Record<string, number> = {
        validating: 1,
        computing: 2,
        packing: 3,
      };
      let lastStage = 0;
      const onMessage = (event: MessageEventLike) => {
        const responseIdentity = identity(event.data);
        if (responseIdentity && (responseIdentity.requestId !== requestId || responseIdentity.generationId !== generationId)) {
          return;
        }
        if (!responseIdentity || !isCharacterAuthoringWorkerResponse(event.data)) {
          settle(new CharacterAuthoringWorkerClientError("protocol"));
          return;
        }
        const response = event.data;
        if (response.kind === "progress") {
          const nextStage = stageOrder[response.stage] ?? 0;
          if (nextStage < lastStage || response.progress < lastProgress) {
            settle(new CharacterAuthoringWorkerClientError("protocol", "Worker 진행률이 역행했습니다."));
            return;
          }
          lastStage = nextStage;
          lastProgress = response.progress;
          options.onProgress?.({
            stage: response.stage,
            progress: response.progress,
            requestId,
            generationId,
          });
          return;
        }
        if (response.kind === "error") {
          settle(new CharacterAuthoringWorkerClientError(response.code, response.message));
          return;
        }
        try {
          const result = validateResult(response.result);
          options.onProgress?.({ stage: "ready", progress: 1, requestId, generationId });
          settle(result);
        } catch (error) {
          settle(error instanceof CharacterAuthoringWorkerClientError
            ? error
            : new CharacterAuthoringWorkerClientError("protocol", "Worker 결과를 검증하지 못했습니다.", { cause: error }));
        }
      };
      const onAbort = () => settle(new CharacterAuthoringWorkerClientError("aborted"));
      worker!.addEventListener("message", onMessage);
      worker!.addEventListener("error", onFailure);
      worker!.addEventListener("messageerror", onFailure);
      cleanups.push(
        () => worker?.removeEventListener("message", onMessage),
        () => worker?.removeEventListener("error", onFailure),
        () => worker?.removeEventListener("messageerror", onFailure),
      );
      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
        cleanups.push(() => options.signal?.removeEventListener("abort", onAbort));
      }
      const timeout = setTimeout(() => settle(new CharacterAuthoringWorkerClientError("timeout")), maximum);
      cleanups.push(() => clearTimeout(timeout));
      try {
        worker!.postMessage(request);
      } catch (error) {
        settle(new CharacterAuthoringWorkerClientError("worker-failed", "Worker에 작업을 전달하지 못했습니다.", { cause: error }));
      }
    });
  }

  dispose(): void {
    this.#disposed = true;
  }

  #allocate(kind: "request" | "generation"): number {
    const field = kind === "request" ? this.#nextRequestId : this.#nextGenerationId;
    const next = field >= Number.MAX_SAFE_INTEGER ? 1 : field + 1;
    if (kind === "request") this.#nextRequestId = next;
    else this.#nextGenerationId = next;
    return field;
  }

  async #executeFallback(
    task: CharacterAuthoringWorkerTask,
    requestId: number,
    generationId: number,
    options: CharacterAuthoringWorkerExecutionOptions,
  ): Promise<CharacterAuthoringWorkerResultPayload> {
    options.onProgress?.({
      stage: "main-thread-fallback",
      progress: 0.2,
      requestId,
      generationId,
    });
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new CharacterAuthoringWorkerClientError("aborted"));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      queueMicrotask(() => {
        options.signal?.removeEventListener("abort", onAbort);
        if (options.signal?.aborted) reject(new CharacterAuthoringWorkerClientError("aborted"));
        else resolve();
      });
    });
    const result = validateResult(executeCharacterAuthoringTask(task));
    options.onProgress?.({ stage: "ready", progress: 1, requestId, generationId });
    return result;
  }
}

let sharedClient: CharacterAuthoringWorkerClient | null = null;

export function executeCharacterAuthoringTaskInBrowser(
  task: CharacterAuthoringWorkerTask,
  options: CharacterAuthoringWorkerExecutionOptions = {},
): Promise<CharacterAuthoringWorkerResultPayload> {
  sharedClient ??= new CharacterAuthoringWorkerClient();
  return sharedClient.execute(task, options);
}

export function disposeSharedCharacterAuthoringWorkerClient(): void {
  sharedClient?.dispose();
  sharedClient = null;
}
