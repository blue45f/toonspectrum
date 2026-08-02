/// <reference lib="webworker" />

import {
  STUDIO_LIVING_INK_EXECUTION_LIMITS,
  STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
  studioLivingInkWorkerResponseTransfers,
  type StudioLivingInkExecutionApplyOptions,
  type StudioLivingInkExecutionCapabilities,
  type StudioLivingInkExecutionConfig,
  type StudioLivingInkWorkerRequest,
  type StudioLivingInkWorkerResponse,
} from "./studio-living-ink-execution-protocol";
import {
  parseStudioLivingInkExecutionApplyOptions,
  parseStudioLivingInkExecutionConfig,
  parseStudioLivingInkExecutionOperation,
} from "./studio-living-ink-execution-validation";
import { StudioLivingInkWebGl2Runtime } from "./studio-living-ink-webgl2-runtime";

import type { StudioLivingInkOperation } from "./studio-living-ink-field";

interface LivingInkWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: StudioLivingInkWorkerResponse, transfer?: readonly Transferable[]): void;
  close(): void;
}

interface JournalEntry {
  readonly operation: StudioLivingInkOperation;
  readonly options: StudioLivingInkExecutionApplyOptions;
}

type StudioLivingInkWorkerResponsePayload = StudioLivingInkWorkerResponse extends infer Response
  ? Response extends StudioLivingInkWorkerResponse
    ? Omit<Response, "version" | "requestId">
    : never
  : never;

const workerScope = globalThis as unknown as LivingInkWorkerScope;
const cancelledRequests = new Set<number>();
const cancelAcknowledgements = new Map<number, number>();
const queuedApplyRequests = new Set<number>();
let runtime: StudioLivingInkWebGl2Runtime | null = null;
let config: StudioLivingInkExecutionConfig | null = null;
let journal: JournalEntry[] = [];
let queue = Promise.resolve();
let disposed = false;

function post(response: StudioLivingInkWorkerResponse): void {
  workerScope.postMessage(response, studioLivingInkWorkerResponseTransfers(response));
}

function message(requestId: number, response: StudioLivingInkWorkerResponsePayload): void {
  post({
    ...response,
    version: STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
    requestId,
  } as StudioLivingInkWorkerResponse);
}

function safeMessage(error: unknown): string {
  return (error instanceof Error && error.message ? error.message : "Living Ink GPU execution failed.")
    .slice(0, 512);
}

function errorCode(error: unknown): Extract<StudioLivingInkWorkerResponse, { type: "living-ink/error" }>["code"] {
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  const detail = safeMessage(error).toLowerCase();
  if (detail.includes("cancel")) return "cancelled";
  if (detail.includes("budget") || detail.includes("exceed")) return "budget-exceeded";
  if (detail.includes("requires") || detail.includes("unavailable") || detail.includes("context is lost")) {
    return "unavailable";
  }
  return "gpu-failure";
}

function isRequest(value: unknown): value is StudioLivingInkWorkerRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (
    candidate.version !== STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION
    || typeof candidate.requestId !== "number"
    || !Number.isSafeInteger(candidate.requestId)
    || candidate.requestId <= 0
    || typeof candidate.type !== "string"
  ) return false;
  const exact = (keys: readonly string[]): boolean => {
    const actual = Object.keys(candidate);
    return actual.length === keys.length && keys.every((key) => Object.hasOwn(candidate, key));
  };
  if (candidate.type === "living-ink/probe" || candidate.type === "living-ink/dispose") {
    return exact(["type", "version", "requestId"]);
  }
  if (candidate.type === "living-ink/initialize") {
    return exact(["type", "version", "requestId", "config"]);
  }
  if (candidate.type === "living-ink/apply") {
    return exact(["type", "version", "requestId", "operation", "options"]);
  }
  if (candidate.type === "living-ink/render") {
    return exact(["type", "version", "requestId", "displayMode"])
      && typeof candidate.displayMode === "string"
      && ["composite", "mobile-pigment", "fixed-pigment", "water", "flow"].includes(candidate.displayMode);
  }
  if (candidate.type === "living-ink/cancel") {
    return exact(["type", "version", "requestId", "targetRequestId"])
      && typeof candidate.targetRequestId === "number"
      && Number.isSafeInteger(candidate.targetRequestId)
      && candidate.targetRequestId > 0;
  }
  return false;
}

function probeCapabilities(): StudioLivingInkExecutionCapabilities {
  if (typeof OffscreenCanvas !== "function") throw new Error("OffscreenCanvas is unavailable.");
  const canvas = new OffscreenCanvas(8, 8);
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("Worker WebGL2 half-float rendering is unavailable.");
  }
  return Object.freeze({
    backend: "webgl2-offscreen-half-float",
    worker: true,
    offscreenCanvas: true,
    webgl2: true,
    halfFloatRenderable: true,
    rgba16Float: true,
    rg16Float: true,
    r16Float: true,
    maximumTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    pressureIterations: Object.freeze({ interactive: 10, settle: 22 }),
  });
}

async function yieldControl(): Promise<void> {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

async function rebuildAcceptedJournal(): Promise<void> {
  if (!config) throw new Error("Living Ink cannot rebuild before initialization.");
  runtime?.dispose();
  runtime = null;
  const replacement = new StudioLivingInkWebGl2Runtime(config);
  try {
    for (let index = 0; index < journal.length; index += 1) {
      const entry = journal[index]!;
      const applied = await replacement.apply(
        index + 1,
        entry.operation,
        { ...entry.options, present: false },
        () => false,
        yieldControl,
      );
      if (applied.kind !== "living-ink/applied") {
        throw new Error("Living Ink journal replay unexpectedly produced a presentation frame.");
      }
    }
  } catch (error) {
    replacement.dispose();
    throw error;
  }
  runtime = replacement;
}

async function applyRequest(request: Extract<StudioLivingInkWorkerRequest, { type: "living-ink/apply" }>): Promise<void> {
  if (!runtime || !config) {
    message(request.requestId, { type: "living-ink/error", code: "not-ready", message: "Living Ink is not initialized." });
    queuedApplyRequests.delete(request.requestId);
    return;
  }
  const parsedOperation = parseStudioLivingInkExecutionOperation(request.operation, config);
  if (!parsedOperation.ok) {
    message(request.requestId, {
      type: "living-ink/error",
      code: "invalid-message",
      message: `${parsedOperation.message} (${parsedOperation.path})`,
    });
    queuedApplyRequests.delete(request.requestId);
    return;
  }
  const parsedOptions = parseStudioLivingInkExecutionApplyOptions(request.options);
  if (!parsedOptions.ok) {
    message(request.requestId, {
      type: "living-ink/error",
      code: "invalid-message",
      message: `${parsedOptions.message} (${parsedOptions.path})`,
    });
    queuedApplyRequests.delete(request.requestId);
    return;
  }
  const operation = parsedOperation.value;
  const options = parsedOptions.value;
  if (journal.length >= STUDIO_LIVING_INK_EXECUTION_LIMITS.maximumJournalOperations) {
    message(request.requestId, { type: "living-ink/error", code: "budget-exceeded", message: "Living Ink replay journal budget exceeded." });
    queuedApplyRequests.delete(request.requestId);
    return;
  }
  const cancelled = () => cancelledRequests.has(request.requestId) || disposed;
  try {
    let result;
    try {
      result = await runtime.apply(request.requestId, operation, options, cancelled, yieldControl);
    } catch (error) {
      // A cancelled 72-tick fixation or a context loss may have partially mutated half-float
      // surfaces. Rebuild the last accepted state before any acknowledgement or retry.
      await rebuildAcceptedJournal();
      if (cancelled()) throw new DOMException("Living Ink request cancelled.", "AbortError");
      if (errorCode(error) !== "unavailable" && errorCode(error) !== "gpu-failure") throw error;
      result = await runtime!.apply(request.requestId, operation, options, cancelled, yieldControl);
    }
    if (cancelled()) {
      if ("image" in result) result.image.close();
      await rebuildAcceptedJournal();
      throw new DOMException("Living Ink request cancelled.", "AbortError");
    }
    journal.push(Object.freeze({ operation, options }));
    if (operation.kind === "clear" && operation.scope === "all") {
      journal = [journal[journal.length - 1]!];
    }
    if ("image" in result) {
      message(request.requestId, { type: "living-ink/frame", frame: result });
    } else {
      message(request.requestId, { type: "living-ink/applied", applied: result });
    }
  } catch (error) {
    let reportedError = error;
    try {
      await rebuildAcceptedJournal();
    } catch (rollbackError) {
      runtime?.dispose();
      runtime = null;
      config = null;
      journal = [];
      reportedError = new Error(
        `Living Ink rollback failed and the runtime was sealed unavailable: ${safeMessage(rollbackError)}`,
      );
    }
    message(request.requestId, {
      type: "living-ink/error",
      code: errorCode(reportedError),
      message: safeMessage(reportedError),
    });
  } finally {
    const cancelRequestId = cancelAcknowledgements.get(request.requestId);
    if (cancelRequestId !== undefined) {
      message(cancelRequestId, { type: "living-ink/cancelled", targetRequestId: request.requestId });
      cancelAcknowledgements.delete(request.requestId);
    }
    cancelledRequests.delete(request.requestId);
    queuedApplyRequests.delete(request.requestId);
  }
}

async function handle(request: StudioLivingInkWorkerRequest): Promise<void> {
  if (request.type === "living-ink/probe") {
    try {
      message(request.requestId, { type: "living-ink/capabilities", capabilities: probeCapabilities() });
    } catch (error) {
      message(request.requestId, { type: "living-ink/error", code: "unavailable", message: safeMessage(error) });
    }
    return;
  }
  if (request.type === "living-ink/initialize") {
    try {
      const parsed = parseStudioLivingInkExecutionConfig(request.config);
      if (!parsed.ok) {
        message(request.requestId, {
          type: "living-ink/error",
          code: "invalid-message",
          message: `${parsed.message} (${parsed.path})`,
        });
        return;
      }
      runtime?.dispose();
      config = parsed.value;
      runtime = new StudioLivingInkWebGl2Runtime(config);
      journal = [];
      disposed = false;
      message(request.requestId, { type: "living-ink/ready", capabilities: runtime.capabilities });
    } catch (error) {
      runtime = null;
      config = null;
      message(request.requestId, { type: "living-ink/error", code: "unavailable", message: safeMessage(error) });
    }
    return;
  }
  if (request.type === "living-ink/apply") {
    await applyRequest(request);
    return;
  }
  if (request.type === "living-ink/render") {
    if (!runtime) {
      message(request.requestId, { type: "living-ink/error", code: "not-ready", message: "Living Ink is not initialized." });
      return;
    }
    try {
      const frame = await runtime.renderFrame(request.requestId, request.displayMode);
      message(request.requestId, { type: "living-ink/frame", frame });
    } catch (error) {
      try {
        await rebuildAcceptedJournal();
      } catch {
        // The original failure remains the useful diagnostic.
      }
      message(request.requestId, { type: "living-ink/error", code: errorCode(error), message: safeMessage(error) });
    }
    return;
  }
  if (request.type === "living-ink/dispose") {
    disposed = true;
    runtime?.dispose();
    runtime = null;
    config = null;
    journal = [];
    message(request.requestId, { type: "living-ink/disposed" });
    workerScope.close();
  }
}

workerScope.onmessage = (event): void => {
  if (!isRequest(event.data)) {
    message(1, { type: "living-ink/error", code: "invalid-message", message: "Invalid Living Ink Worker message." });
    return;
  }
  const request = event.data;
  if (request.type === "living-ink/cancel") {
    if (queuedApplyRequests.has(request.targetRequestId)) {
      cancelledRequests.add(request.targetRequestId);
      // The acknowledgement is emitted only after the target operation has rolled back through a
      // fresh-runtime journal replay. An immediate ACK could expose a partially fixed surface.
      cancelAcknowledgements.set(request.targetRequestId, request.requestId);
    } else {
      message(request.requestId, { type: "living-ink/cancelled", targetRequestId: request.targetRequestId });
    }
    return;
  }
  if (request.type === "living-ink/apply") queuedApplyRequests.add(request.requestId);
  if (request.type === "living-ink/dispose") {
    disposed = true;
    for (const requestId of queuedApplyRequests) cancelledRequests.add(requestId);
  }
  queue = queue.then(() => handle(request), () => handle(request));
};

workerScope.onmessageerror = (): void => {
  // Structured-clone failure is epoch-wide: no trustworthy request id survived. A fatal response
  // makes the provider reject every pending owner immediately instead of waiting on an unrelated
  // fixed request id until timeout.
  message(1, {
    type: "living-ink/fatal",
    code: "invalid-message",
    message: "Living Ink Worker message clone failed; the execution epoch was sealed.",
  });
  disposed = true;
  runtime?.dispose();
  runtime = null;
  config = null;
  journal = [];
  workerScope.close();
};
