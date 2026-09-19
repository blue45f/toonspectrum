import {
  scene3dSpecialistJobQueue,
  type SpecialistJobQueue,
} from "./specialist-job-queue";
import {
  notifySpecialistProgress,
  readSpecialistWorkerProgress,
  specialistFailurePhase,
} from "./specialist-job-progress";
import type { SpecialistProgressListener } from "./specialist-job-progress";
import {
  SPECIALIST_LIMITS,
  SpecialistError,
  parseSpecialistRequest,
  parseSpecialistResult,
} from "./specialist-contract";
import type {
  SpecialistRequest,
  SpecialistResult,
} from "./specialist-contract";

/** One worker per explicit job bounds WASM lifetime. Cancellation terminates synchronous kernels. */
function executeSpecialistWorker(
  request: SpecialistRequest,
  signal?: AbortSignal,
  onProgress?: SpecialistProgressListener,
): Promise<SpecialistResult> {
  if (signal?.aborted)
    return Promise.reject(new SpecialistError("cancelled", "Cancelled."));
  try {
    request = parseSpecialistRequest(request);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./specialist.worker.ts", import.meta.url),
      { type: "module" },
    );
    let settled = false;
    let progressSequence = 0;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cancel = () => fail(new SpecialistError("cancelled", "Cancelled."));
    const timer = setTimeout(
      () =>
        fail(
          new SpecialistError(
            "timeout",
            "Processing timed out; the worker was terminated.",
          ),
        ),
      SPECIALIST_LIMITS.timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onerror = () =>
      fail(
        new SpecialistError(
          "runtime",
          "The processing worker failed to start or execute.",
        ),
      );
    worker.onmessageerror = () =>
      fail(
        new SpecialistError(
          "runtime",
          "The worker returned an unreadable result.",
        ),
      );
    worker.onmessage = (
      event: MessageEvent<{
        ok: boolean;
        id: number;
        result?: unknown;
        message?: string;
        code?: unknown;
      }>,
    ) => {
      if (settled) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        fail(new SpecialistError("runtime", "Invalid worker response."));
        return;
      }
      const response = data as Record<string, unknown>;
      if (response.kind === "progress") {
        try {
          const phase = readSpecialistWorkerProgress(
            response,
            request.id,
            progressSequence,
          );
          progressSequence++;
          notifySpecialistProgress(onProgress, { phase });
        } catch {
          fail(
            new SpecialistError(
              "runtime",
              "Invalid or out-of-order worker progress.",
            ),
          );
        }
        return;
      }
      if (response.id !== request.id || typeof response.ok !== "boolean") {
        fail(
          new SpecialistError(
            "runtime",
            "Invalid or mismatched worker response.",
          ),
        );
        return;
      }
      if (response.ok === false) {
        const code = response.code;
        const supported =
          code === "invalid-input" ||
          code === "unsupported" ||
          code === "budget" ||
          code === "cancelled" ||
          code === "timeout" ||
          code === "runtime";
        if (
          !supported ||
          typeof response.message !== "string" ||
          !response.message.length ||
          response.message.length > 2048
        ) {
          fail(
            new SpecialistError(
              "runtime",
              "Malformed worker failure response.",
            ),
          );
          return;
        }
        fail(new SpecialistError(code, response.message));
        return;
      }
      try {
        const result = parseSpecialistResult(
          event.data.result,
          request.options.kind,
        );
        settled = true;
        cleanup();
        resolve(result);
      } catch {
        fail(
          new SpecialistError(
            "runtime",
            "Invalid or mismatched worker result.",
          ),
        );
      }
    };
    try {
      // These are private snapshots reserved before queueing, never the caller's originals.
      const source = request.source;
      const secondary = request.secondary;
      worker.postMessage(
        { ...request, source, secondary },
        secondary ? [source, secondary] : [source],
      );
    } catch {
      fail(
        new SpecialistError("runtime", "Could not send the processing job."),
      );
    }
    if (signal?.aborted) cancel();
  });
}

/** Shared tab-scoped queue; the caller retains canonical input buffers. No automatic retry. */
export function runScene3dSpecialistInWorker(
  request: SpecialistRequest,
  signal?: AbortSignal,
  options: {
    readonly onProgress?: SpecialistProgressListener;
    readonly queue?: SpecialistJobQueue;
  } = {},
): Promise<SpecialistResult> {
  const report = options.onProgress;
  const rejected = (error: unknown): Promise<SpecialistResult> => {
    notifySpecialistProgress(report, { phase: specialistFailurePhase(error) });
    return Promise.reject(error);
  };
  if (signal?.aborted)
    return rejected(new SpecialistError("cancelled", "Cancelled."));
  let parsed: SpecialistRequest;
  try {
    parsed = parseSpecialistRequest(request);
  } catch (error) {
    return rejected(
      error instanceof SpecialistError
        ? error
        : new SpecialistError("invalid-input", "Invalid specialist request."),
    );
  }
  const queued = (options.queue ?? scene3dSpecialistJobQueue).run({
    bytes: parsed.source.byteLength + (parsed.secondary?.byteLength ?? 0),
    signal,
    onPosition: (position) =>
      notifySpecialistProgress(
        report,
        position === 0
          ? { phase: "starting" }
          : { phase: "queued", queuePosition: position },
      ),
    prepare: () => {
      // Snapshot before the call returns so a queued caller cannot change future input/parameters.
      const owned: SpecialistRequest = {
        ...parsed,
        source: parsed.source.slice(0),
        secondary: parsed.secondary?.slice(0),
      };
      return () => executeSpecialistWorker(owned, signal, report);
    },
  });
  return queued.then((result) => {
    notifySpecialistProgress(report, { phase: "ready" });
    return result;
  }, rejected);
}
