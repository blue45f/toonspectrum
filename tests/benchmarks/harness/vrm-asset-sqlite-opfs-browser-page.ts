/** Main-page coordinator for normal close/reopen and forced Worker termination phases. */

const RESULT_GLOBAL = "__TOONSPECTRUM_VRM_ASSET_SQLITE_OPFS_RESULT__";
const PHASE_TIMEOUT_MS = 15 * 60 * 1_000;

type Phase = "normal" | "termination-seed" | "termination-verify";
type JsonRecord = Record<string, unknown>;

interface SpecificMemoryResultLike {
  readonly bytes?: number;
  readonly breakdown?: readonly unknown[];
}

interface PerformanceMemoryLike {
  readonly jsHeapSizeLimit?: number;
  readonly totalJSHeapSize?: number;
  readonly usedJSHeapSize?: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: PerformanceMemoryLike;
  measureUserAgentSpecificMemory?: () => Promise<SpecificMemoryResultLike>;
}

function errorShape(error: unknown): JsonRecord {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : { name: "NonError", message: String(error), stack: null };
}

function publish(value: unknown): void {
  (window as unknown as Record<string, unknown>)[RESULT_GLOBAL] = value;
  const output = document.querySelector("[data-benchmark-output]");
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

async function captureMeasuredMemory(label: string): Promise<JsonRecord> {
  const measuredPerformance = performance as PerformanceWithMemory;
  const measured: JsonRecord = {};
  if (measuredPerformance.memory) {
    const source = measuredPerformance.memory;
    if (typeof source.jsHeapSizeLimit === "number" && Number.isFinite(source.jsHeapSizeLimit)) {
      measured.jsHeapSizeLimitBytes = source.jsHeapSizeLimit;
    }
    if (typeof source.totalJSHeapSize === "number" && Number.isFinite(source.totalJSHeapSize)) {
      measured.totalJSHeapSizeBytes = source.totalJSHeapSize;
    }
    if (typeof source.usedJSHeapSize === "number" && Number.isFinite(source.usedJSHeapSize)) {
      measured.usedJSHeapSizeBytes = source.usedJSHeapSize;
    }
  }
  const specific = measuredPerformance.measureUserAgentSpecificMemory;
  if (typeof specific === "function") {
    try {
      const result = await specific.call(measuredPerformance);
      if (typeof result.bytes === "number" && Number.isFinite(result.bytes)) {
        measured.userAgentSpecificMemoryBytes = result.bytes;
      }
      if (Array.isArray(result.breakdown)) {
        measured.userAgentSpecificBreakdownCount = result.breakdown.length;
      }
    } catch (error) {
      return {
        label,
        status: Object.keys(measured).length > 0 ? "partial" : "unavailable",
        measured,
        error: errorShape(error),
      };
    }
  }
  return {
    label,
    status: Object.keys(measured).length > 0 ? "measured" : "unavailable",
    measured,
  };
}

function runWorkerPhase(
  phase: Phase,
  expectedType: "phase-result" | "termination-ready",
): Promise<{ value: JsonRecord; worker: Worker }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./vrm-asset-sqlite-opfs-browser-client.ts", import.meta.url),
      { type: "module", name: `vrm-asset-sqlite-opfs-${phase}` },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`${phase} Worker timed out after ${PHASE_TIMEOUT_MS}ms`));
    }, PHASE_TIMEOUT_MS);
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const envelope = event.data as { type?: unknown; value?: unknown } | null;
      if (
        envelope?.type !== expectedType
        && !(expectedType === "termination-ready" && envelope?.type === "phase-result")
      ) return;
      window.clearTimeout(timeout);
      const value = envelope.value && typeof envelope.value === "object"
        ? envelope.value as JsonRecord
        : { phase, status: "error", pass: false, error: "invalid Worker receipt" };
      resolve({ value, worker });
    });
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(`${phase} Worker error: ${event.message}`));
    });
    worker.postMessage({ phase });
  });
}

async function run(): Promise<void> {
  const pageSecurityPolicyViolations: JsonRecord[] = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    pageSecurityPolicyViolations.push({
      effectiveDirective: event.effectiveDirective,
      blockedUri: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const memorySnapshots: JsonRecord[] = [await captureMeasuredMemory("page-baseline")];

  const normal = await runWorkerPhase("normal", "phase-result");
  memorySnapshots.push(await captureMeasuredMemory("page-normal-worker-finished"));
  normal.worker.terminate();
  if (normal.value.status === "unsupported") {
    publish({
      status: "unsupported",
      pass: false,
      schemaVersion: 1,
      normal: normal.value,
      forcedTermination: null,
      memory: {
        policy: "measured-browser-fields-only-no-estimates",
        snapshots: memorySnapshots,
      },
      pageSecurityPolicyViolations,
    });
    return;
  }

  const seed = await runWorkerPhase("termination-seed", "termination-ready");
  memorySnapshots.push(await captureMeasuredMemory("page-termination-seed-committed"));
  seed.worker.terminate();
  const terminatedAt = performance.now();
  await new Promise((resolve) => window.setTimeout(resolve, 750));
  const verify = await runWorkerPhase("termination-verify", "phase-result");
  memorySnapshots.push(await captureMeasuredMemory("page-termination-verify-finished"));
  verify.worker.terminate();
  const recoveryElapsedMs = performance.now() - terminatedAt;

  const forcedTermination = {
    workerTerminateCalled: true,
    closeCalledBeforeTerminate: seed.value.closeCalled === true,
    seed: seed.value,
    verify: verify.value,
    recoveryElapsedMs: Number(recoveryElapsedMs.toFixed(4)),
    pass:
      seed.value.pass === true
      && seed.value.closeCalled === false
      && verify.value.pass === true
      && verify.value.reopenedExactShaAndBytes === true,
  };
  const quarantined = normal.value.status === "quarantined";
  const pass = normal.value.pass === true && forcedTermination.pass;
  publish({
    status: quarantined ? "quarantined" : pass ? "ok" : "error",
    pass,
    schemaVersion: 1,
    normal: normal.value,
    forcedTermination,
    memory: {
      policy: "measured-browser-fields-only-no-estimates",
      snapshots: memorySnapshots,
    },
    pageSecurityPolicyViolations,
  });
}

run().catch((error) => {
  publish({
    status: "error",
    pass: false,
    schemaVersion: 1,
    error: errorShape(error),
  });
});
