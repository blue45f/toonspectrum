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
import { CharacterAuthoringWorkerRuntimeError, executeCharacterAuthoringTask } from "./character-authoring-worker-runtime";
import { validateCharacterDocumentV3 } from "../document/character-document-v3";
import { validateCharacterGroomDocument } from "../groom/character-groom-document";

export type CharacterAuthoringWorkerClientErrorCode =
  | CharacterAuthoringWorkerFailureCode
  | "aborted"
  | "disposed"
  | "protocol"
  | "timeout"
  | "worker-failed"
  | "worker-unavailable"
  | "superseded";

export interface CharacterAuthoringWorkerProgress {
  readonly stage: "queued" | "validating" | "computing" | "packing" | "ready" | "main-thread-fallback";
  readonly progress: number;
  readonly requestId: number;
  readonly generationId: number;
}

export interface CharacterAuthoringWorkerExecutionOptions {
  readonly signal?: AbortSignal;
  /** 같은 편집 대상의 이전 계산을 즉시 취소한다. 독립 대상은 서로 다른 키를 사용한다. */
  readonly latestKey?: string;
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
    name: "toonstudio-character-authoring",
  });
}

function timeoutMs(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(120_000, Math.max(1, Math.trunc(value)));
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
  readonly #pending = new Set<(code: CharacterAuthoringWorkerClientErrorCode) => void>();
  readonly #latest = new Map<string, (code: CharacterAuthoringWorkerClientErrorCode) => void>();

  constructor(options: CharacterAuthoringWorkerClientOptions = {}) {
    this.#workerFactory = options.workerFactory ?? createModuleWorker;
    this.#defaultTimeoutMs = timeoutMs(options.defaultTimeoutMs, 30_000);
  }

  execute(
    task: CharacterAuthoringWorkerTask,
    options: CharacterAuthoringWorkerExecutionOptions = {},
  ): Promise<CharacterAuthoringWorkerResultPayload> {
    if (this.#disposed) return Promise.reject(new CharacterAuthoringWorkerClientError("disposed"));
    if (options.signal?.aborted) return Promise.reject(new CharacterAuthoringWorkerClientError("aborted"));
    let inputBytes: number;
    let snapshot: CharacterAuthoringWorkerTask;
    try {
      inputBytes = estimateCharacterAuthoringTaskBytes(task);
      if (inputBytes <= 0 || inputBytes > CHARACTER_AUTHORING_WORKER_MAX_INPUT_BYTES) {
        return Promise.reject(new CharacterAuthoringWorkerClientError("input-too-large"));
      }
      snapshot = structuredClone(task);
    } catch (error) {
      return Promise.reject(new CharacterAuthoringWorkerClientError("invalid-request", "3D 저작 작업을 직렬화하지 못했습니다.", { cause: error }));
    }
    const requestId = this.#allocate("request");
    const generationId = this.#allocate("generation");
    if (options.latestKey) this.#latest.get(options.latestKey)?.("superseded");
    return new Promise((resolve, reject) => {
      let settled = false;
      let worker: CharacterAuthoringWorkerLike | null = null;
      const cleanups: (() => void)[] = [];
      const settle = (outcome: CharacterAuthoringWorkerResultPayload | CharacterAuthoringWorkerClientError) => {
        if (settled) return;
        settled = true;
        this.#pending.delete(cancel);
        if (options.latestKey && this.#latest.get(options.latestKey) === cancel) this.#latest.delete(options.latestKey);
        const cleanupErrors: unknown[] = [];
        for (const cleanup of cleanups.splice(0)) {
          try { cleanup(); } catch (error) { cleanupErrors.push(error); }
        }
        try { worker?.terminate(); } catch (error) { cleanupErrors.push(error); }
        if (outcome instanceof CharacterAuthoringWorkerClientError) reject(outcome);
        else if (cleanupErrors.length > 0) reject(new CharacterAuthoringWorkerClientError(
          "worker-failed", "3D 작업 자원을 완전히 정리하지 못했습니다.", { cause: new AggregateError(cleanupErrors) },
        ));
        else resolve(outcome);
      };
      const cancel = (code: CharacterAuthoringWorkerClientErrorCode) => settle(new CharacterAuthoringWorkerClientError(code));
      this.#pending.add(cancel);
      if (options.latestKey) this.#latest.set(options.latestKey, cancel);
      const notify = (stage: CharacterAuthoringWorkerProgress["stage"], progress: number) => {
        if (settled) return;
        try { options.onProgress?.({ stage, progress, requestId, generationId }); }
        catch (error) {
          settle(new CharacterAuthoringWorkerClientError("task-failed", "3D 작업 진행 상태를 전달하지 못했습니다.", { cause: error }));
        }
      };
      const complete = (value: CharacterAuthoringWorkerResultPayload) => {
        if (settled) return;
        try {
          const expected = snapshot.kind === "build-groom-ribbon" || snapshot.kind === "build-geometry-stroke"
            ? "mesh" : snapshot.kind === "resample-groom-guide" ? "groom-guide" : "document-v3";
          if (value.kind !== expected) throw new CharacterAuthoringWorkerClientError("protocol", "요청과 다른 3D 작업 결과를 받았습니다.");
          const result = validateResult(value);
          notify("ready", 1);
          if (!settled) settle(result);
        } catch (error) {
          settle(error instanceof CharacterAuthoringWorkerClientError ? error
            : new CharacterAuthoringWorkerClientError("protocol", "Worker 결과를 검증하지 못했습니다.", { cause: error }));
        }
      };
      const onAbort = () => cancel("aborted");
      options.signal?.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => options.signal?.removeEventListener("abort", onAbort));
      const timeout = setTimeout(() => cancel("timeout"), timeoutMs(options.timeoutMs, this.#defaultTimeoutMs));
      cleanups.push(() => clearTimeout(timeout));
      notify("queued", 0);
      if (settled) return;
      try { worker = this.#workerFactory(); }
      catch (error) {
        if (options.allowMainThreadFallback === false) {
          settle(new CharacterAuthoringWorkerClientError("worker-unavailable", "3D 저작 Worker를 만들지 못했습니다.", { cause: error }));
          return;
        }
      }
      // Worker 생성이나 진행 알림 안에서 취소가 발생해도 새 자원을 남기지 않는다.
      if (settled) { worker?.terminate(); return; }
      if (options.signal?.aborted || this.#disposed) { cancel(this.#disposed ? "disposed" : "aborted"); return; }
      if (!worker) {
        if (options.allowMainThreadFallback === false) { cancel("worker-unavailable"); return; }
        notify("main-thread-fallback", 0.2);
        if (settled) return;
        // 브라우저가 입력과 취소를 처리할 수 있도록 실제 event-loop 경계를 넘는다.
        const deferred = setTimeout(() => {
          if (settled) return;
          try { complete(executeCharacterAuthoringTask(snapshot)); }
          catch (error) {
            settle(new CharacterAuthoringWorkerClientError(error instanceof CharacterAuthoringWorkerRuntimeError ? error.code : "task-failed", error instanceof Error ? error.message : "3D 저작 계산에 실패했습니다.", { cause: error }));
          }
        }, 0);
        cleanups.push(() => clearTimeout(deferred));
        return;
      }
      const activeWorker = worker;
      const onFailure = (event: ErrorEventLike) => { event.preventDefault?.(); cancel("worker-failed"); };
      let lastProgress = 0;
      let lastStage = 0;
      const stageOrder = { validating: 1, computing: 2, packing: 3 } as const;
      const onMessage = (event: MessageEventLike) => {
        if (settled) return;
        const responseIdentity = identity(event.data);
        if (responseIdentity && (responseIdentity.requestId !== requestId || responseIdentity.generationId !== generationId)) return;
        if (!responseIdentity || !isCharacterAuthoringWorkerResponse(event.data)) { cancel("protocol"); return; }
        const response = event.data;
        if (response.kind === "progress") {
          const nextStage = stageOrder[response.stage];
          if (nextStage < lastStage || response.progress < lastProgress) {
            settle(new CharacterAuthoringWorkerClientError("protocol", "Worker 진행률이 역행했습니다."));
            return;
          }
          lastStage = nextStage;
          lastProgress = response.progress;
          notify(response.stage, response.progress);
        } else if (response.kind === "error") {
          settle(new CharacterAuthoringWorkerClientError(response.code, response.message));
        } else complete(response.result);
      };
      activeWorker.addEventListener("message", onMessage);
      activeWorker.addEventListener("error", onFailure);
      activeWorker.addEventListener("messageerror", onFailure);
      cleanups.push(
        () => activeWorker.removeEventListener("message", onMessage),
        () => activeWorker.removeEventListener("error", onFailure),
        () => activeWorker.removeEventListener("messageerror", onFailure),
      );
      try {
        activeWorker.postMessage({ version: CHARACTER_AUTHORING_WORKER_PROTOCOL_VERSION, kind: "execute", requestId, generationId, inputBytes, task: snapshot });
      } catch (error) {
        settle(new CharacterAuthoringWorkerClientError("worker-failed", "Worker에 작업을 전달하지 못했습니다.", { cause: error }));
      }
    });
  }

  dispose(): void {
    this.#disposed = true;
    for (const cancel of [...this.#pending]) cancel("disposed");
  }

  #allocate(kind: "request" | "generation"): number {
    const field = kind === "request" ? this.#nextRequestId : this.#nextGenerationId;
    const next = field >= Number.MAX_SAFE_INTEGER ? 1 : field + 1;
    if (kind === "request") this.#nextRequestId = next;
    else this.#nextGenerationId = next;
    return field;
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
