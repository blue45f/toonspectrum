import {
  CHARACTER_PSD_WORKER_VERSION, isCharacterPsdHeader, isCharacterPsdWorkerRequest,
  isCharacterPsdWorkerResponse, validateCharacterPsdPasses,
} from "./character-shaper-psd-worker-protocol";

import type { CharacterSemanticPass } from "./character-shaper-contract";
import type { CharacterSemanticPsdResult, CharacterSemanticSkip } from "./character-shaper-psd-assembly";
import type { CharacterPsdWorkerRequest } from "./character-shaper-psd-worker-protocol";

interface Message { readonly data: unknown }
interface Failure { preventDefault?(): void }
export interface CharacterPsdWorkerLike {
  postMessage(message: CharacterPsdWorkerRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: Message) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: Failure) => void): void;
  removeEventListener(type: "message", listener: (event: Message) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: Failure) => void): void;
  terminate(): void;
}
export interface CharacterPsdWorkerOptions {
  readonly title: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly startupTimeoutMs?: number;
  /** Default copies caller storage. Transfer consumes every exact, unaliased pass buffer at postMessage. */
  readonly ownership?: "copy" | "transfer";
  readonly workerFactory?: () => CharacterPsdWorkerLike | null;
}

export class CharacterPsdWorkerError extends Error {
  constructor(readonly code: "aborted" | "invalid-request" | "worker-unavailable" | "worker-failed" | "protocol" | "assembly-failed" | "timeout") {
    super(`PSD 파일 생성 실패: ${code}`);
    this.name = code === "aborted" ? "AbortError" : code === "timeout" ? "TimeoutError" : "CharacterPsdWorkerError";
  }
}
export function createCharacterPsdModuleWorker(): CharacterPsdWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-character-shaper-psd.worker.ts", import.meta.url), {
    type: "module", name: "toonspectrum-character-psd",
  });
}
let nextId = 1;
function boundedTimeout(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(100, Math.min(maximum, Math.floor(value!))) : fallback;
}

/** One assembly per Worker. No automatic synchronous fallback; cancellation terminates compression. */
export function assembleCharacterPsdInWorker(
  passes: readonly CharacterSemanticPass[], skipped: readonly CharacterSemanticSkip[], options: CharacterPsdWorkerOptions,
): Promise<CharacterSemanticPsdResult> {
  if (options.signal?.aborted) return Promise.reject(new CharacterPsdWorkerError("aborted"));
  let request: CharacterPsdWorkerRequest;
  try {
    validateCharacterPsdPasses(passes, skipped, options.title);
    if (options.ownership !== undefined && options.ownership !== "copy" && options.ownership !== "transfer") throw new TypeError("ownership");
    const requestId = nextId;
    nextId = nextId === Number.MAX_SAFE_INTEGER ? 1 : nextId + 1;
    request = {
      version: CHARACTER_PSD_WORKER_VERSION, kind: "assemble", requestId, title: options.title,
      skipped: skipped.map(({ pass, reason }) => ({ pass, reason })),
      passes: passes.map(({ id, width, height, rgba }) => ({
        id, width, height,
        rgba: options.ownership === "transfer" ? rgba as Uint8ClampedArray<ArrayBuffer> : new Uint8ClampedArray(rgba),
      })),
    };
    if (!isCharacterPsdWorkerRequest(request)) throw new TypeError("storage");
  } catch { return Promise.reject(new CharacterPsdWorkerError("invalid-request")); }
  const width = request.passes[0]!.width;
  const height = request.passes[0]!.height;
  return new Promise((resolve, reject) => {
    let worker: CharacterPsdWorkerLike | null = null;
    let settled = false;
    let ready = false;
    let verifying = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const signal = options.signal;
    const safely = (run: () => void) => { try { run(); } catch { /* Always finish cleanup. */ } };
    const terminate = () => {
      if (!worker) return;
      const current = worker;
      worker = null;
      safely(() => current.removeEventListener("message", onMessage));
      safely(() => current.removeEventListener("error", onFailure));
      safely(() => current.removeEventListener("messageerror", onFailure));
      safely(() => current.terminate());
    };
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      terminate();
      done();
    };
    const fail = (code: CharacterPsdWorkerError["code"]) => finish(() => reject(new CharacterPsdWorkerError(code)));
    function onAbort() { fail("aborted"); }
    function onFailure(event: Failure) { event.preventDefault?.(); fail("worker-failed"); }
    function onMessage(event: Message) {
      if (settled) return;
      const response = event.data;
      if (!isCharacterPsdWorkerResponse(response)) { fail("protocol"); return; }
      if (response.kind === "ready") {
        if (ready || !worker) { fail("protocol"); return; }
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(() => fail("timeout"), boundedTimeout(options.timeoutMs, 60_000, 120_000));
        try { worker.postMessage(request, request.passes.map((pass) => pass.rgba.buffer)); }
        catch { fail("worker-failed"); }
        return;
      }
      if (!ready || verifying || response.requestId !== request.requestId) { fail("protocol"); return; }
      if (response.kind === "error") { fail(response.code); return; }
      if (response.receipt.width !== width || response.receipt.height !== height) { fail("protocol"); return; }
      verifying = true;
      terminate();
      void response.blob.slice(0, 26).arrayBuffer().then((header) => {
        if (signal?.aborted) fail("aborted");
        else if (!isCharacterPsdHeader(new Uint8Array(header), width, height)) fail("protocol");
        else finish(() => resolve({ blob: response.blob, receipt: response.receipt }));
      }).catch(() => fail("protocol"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try { worker = (options.workerFactory ?? createCharacterPsdModuleWorker)(); }
    catch { fail("worker-unavailable"); return; }
    if (!worker) { fail("worker-unavailable"); return; }
    if (settled) { terminate(); return; }
    try {
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onFailure);
      worker.addEventListener("messageerror", onFailure);
      timer = setTimeout(() => fail("timeout"), boundedTimeout(options.startupTimeoutMs, 10_000, 30_000));
    } catch { fail("worker-failed"); }
  });
}
