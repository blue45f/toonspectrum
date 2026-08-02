import type {
  StudioP5BrushRealBrowserResult,
  StudioP5BrushRealWorkerResult,
  StudioP5BrushSecurityPolicyViolation,
} from "./studio-p5-brush-real-runtime-protocol";

const RESULT_TIMEOUT_MS = 90_000;

declare global {
  interface Window {
    __studioP5BrushRealRuntimeResult?: StudioP5BrushRealBrowserResult;
  }
}

const securityPolicyViolations: StudioP5BrushSecurityPolicyViolation[] = [];
window.addEventListener("securitypolicyviolation", (event) => {
  securityPolicyViolations.push(Object.freeze({
    blockedUri: event.blockedURI,
    effectiveDirective: event.effectiveDirective,
    violatedDirective: event.violatedDirective,
    disposition: event.disposition,
  }));
});

function publish(
  workerResult: StudioP5BrushRealWorkerResult,
  freshWorkerReplay: StudioP5BrushRealWorkerResult,
): void {
  window.__studioP5BrushRealRuntimeResult = Object.freeze({
    workerResult,
    freshWorkerReplay,
    mainThread: Object.freeze({
      worker: typeof Worker === "function",
      userAgent: navigator.userAgent,
    }),
    securityPolicyViolations: Object.freeze([...securityPolicyViolations]),
  });
}

function errorResult(
  message: string,
  stack: string | null,
): StudioP5BrushRealWorkerResult {
  return Object.freeze({
    status: "error",
    message,
    stack,
    probe: Object.freeze({
      dedicatedWorkerScope: false,
      offscreenCanvas: typeof OffscreenCanvas === "function",
      webgl2ContextAttempted: false,
    }),
  });
}

function runWorker(name: string): Promise<StudioP5BrushRealWorkerResult> {
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL("./studio-p5-brush-real-runtime-worker.ts", import.meta.url),
      {
        name,
        type: "module",
      },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();
      resolve(errorResult(
        `The p5.brush real-runtime Worker exceeded ${RESULT_TIMEOUT_MS}ms.`,
        null,
      ));
    }, RESULT_TIMEOUT_MS);
    worker.addEventListener("message", (
      event: MessageEvent<StudioP5BrushRealWorkerResult>,
    ) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(event.data);
    }, { once: true });
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(errorResult(
        event.message || "The p5.brush real-runtime Worker emitted an error.",
        null,
      ));
    }, { once: true });
    worker.postMessage({ type: "studio-p5-brush-real-runtime/start" });
  });
}

async function runSequentialWorkerReplay(): Promise<void> {
  // Each verifier Worker intentionally creates several private WebGL2 surfaces.
  // Running both Workers together can exceed Chromium's active Worker-context
  // budget and force an older context to be lost, especially under SwiftShader.
  // Keep both exact-byte Worker/WebGL2 executions, but isolate their lifetimes
  // so this gate measures renderer determinism rather than harness interference.
  const workerResult = await runWorker(
    "studio-p5-brush-real-runtime-primary",
  );
  const freshWorkerReplay = await runWorker(
    "studio-p5-brush-real-runtime-fresh-replay",
  );
  publish(workerResult, freshWorkerReplay);
}

if (typeof Worker !== "function") {
  const error = errorResult(
    "Chromium does not expose the Worker constructor.",
    null,
  );
  publish(error, error);
} else {
  void runSequentialWorkerReplay();
}
