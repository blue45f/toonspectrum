/** Main-page orchestration for the BG3D Dedicated Worker promotion benchmark. */

const RESULT_GLOBAL = "__TOONSPECTRUM_BG3D_LIBRARIES_SQLITE_OPFS_BROWSER_RESULT__";
const PRIMARY_TIMEOUT_MS = 15 * 60 * 1_000;
const SECONDARY_TIMEOUT_MS = 3 * 60 * 1_000;

type JsonRecord = Record<string, unknown>;

interface BrowserMemoryPerformance extends Performance {
  readonly memory?: {
    readonly jsHeapSizeLimit: number;
    readonly totalJSHeapSize: number;
    readonly usedJSHeapSize: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<{
    bytes: number;
    breakdown?: readonly unknown[];
  }>;
}

interface WorkerEnvelope {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly progress?: unknown;
  readonly value?: unknown;
}

function errorShape(error: unknown): JsonRecord {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : { name: "NonError", message: String(error), stack: null };
}

async function memorySnapshot(): Promise<JsonRecord> {
  const measuredPerformance = performance as BrowserMemoryPerformance;
  let userAgentSpecific: JsonRecord | null = null;
  if (typeof measuredPerformance.measureUserAgentSpecificMemory === "function") {
    try {
      const measured = await measuredPerformance.measureUserAgentSpecificMemory();
      userAgentSpecific = {
        bytes: measured.bytes,
        breakdownEntryCount: measured.breakdown?.length ?? null,
      };
    } catch {
      userAgentSpecific = null;
    }
  }
  return {
    performanceMemory: measuredPerformance.memory
      ? {
          usedJSHeapSizeBytes: measuredPerformance.memory.usedJSHeapSize,
          totalJSHeapSizeBytes: measuredPerformance.memory.totalJSHeapSize,
          jsHeapSizeLimitBytes: measuredPerformance.memory.jsHeapSizeLimit,
        }
      : null,
    userAgentSpecific,
  };
}

function publish(value: unknown): void {
  (window as unknown as Record<string, unknown>)[RESULT_GLOBAL] = value;
  const output = document.querySelector("[data-benchmark-output]");
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

function worker(name: string): Worker {
  return new Worker(
    new URL("./bg3d-libraries-sqlite-opfs-browser-worker.ts", import.meta.url),
    { type: "module", name },
  );
}

function waitForReady(candidate: Worker, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("BG3D benchmark Worker did not become ready"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent<unknown>) => {
      const envelope = event.data as WorkerEnvelope | null;
      if (envelope?.type !== "ready") return;
      cleanup();
      resolve();
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(`BG3D benchmark Worker failed during startup: ${event.message}`));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      candidate.removeEventListener("message", onMessage);
      candidate.removeEventListener("error", onError);
    };
    candidate.addEventListener("message", onMessage);
    candidate.addEventListener("error", onError);
  });
}

function runCommand(
  candidate: Worker,
  command: string,
  payload: JsonRecord = {},
  options: {
    readonly timeoutMs?: number;
    readonly onProgress?: (envelope: WorkerEnvelope) => void;
  } = {},
): Promise<JsonRecord> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`BG3D benchmark Worker command timed out: ${command}`));
    }, options.timeoutMs ?? SECONDARY_TIMEOUT_MS);
    const onMessage = (event: MessageEvent<unknown>) => {
      const envelope = event.data as WorkerEnvelope | null;
      if (envelope?.type === "progress") {
        options.onProgress?.(envelope);
        return;
      }
      if (envelope?.type !== "result" || envelope.id !== id) return;
      cleanup();
      resolve(
        envelope.value && typeof envelope.value === "object"
          ? envelope.value as JsonRecord
          : { status: "error", pass: false, error: { message: "invalid Worker result" } },
      );
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(`BG3D benchmark Worker failed: ${event.message}`));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      candidate.removeEventListener("message", onMessage);
      candidate.removeEventListener("error", onError);
    };
    candidate.addEventListener("message", onMessage);
    candidate.addEventListener("error", onError);
    candidate.postMessage({ id, command, payload });
  });
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nested(value: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of keys) current = record(current)?.[key];
  return current;
}

function aggregateFallback(...receipts: readonly unknown[]): JsonRecord {
  const numeric = (receipt: unknown, key: string): number => {
    const value = record(receipt)?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const indexedDbAccessCount = receipts.reduce(
    (sum, receipt) => sum + numeric(receipt, "indexedDbAccessCount"),
    0,
  );
  const localStorageAccessCount = receipts.reduce(
    (sum, receipt) => sum + numeric(receipt, "localStorageAccessCount"),
    0,
  );
  const memoryDatabaseOpenCount = receipts.reduce(
    (sum, receipt) => sum + numeric(receipt, "memoryDatabaseOpenCount"),
    0,
  );
  const memoryAssetStoreCount = receipts.reduce(
    (sum, receipt) => sum + numeric(receipt, "memoryAssetStoreCount"),
    0,
  );
  return {
    indexedDbAccessCount,
    localStorageAccessCount,
    memoryDatabaseOpenCount,
    memoryAssetStoreCount,
    totalFallbackCount: indexedDbAccessCount
      + localStorageAccessCount
      + memoryDatabaseOpenCount
      + memoryAssetStoreCount,
    probesInstalledInEveryWorker: receipts.every((receipt) =>
      record(receipt)?.indexedDbProbeInstalled === true
      && record(receipt)?.localStorageProbeInstalled === true),
  };
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
  const pageMemoryBefore = await memorySnapshot();

  const primaryWorker = worker("bg3d-sqlite-opfs-primary");
  await waitForReady(primaryWorker);
  const primary = await runCommand(primaryWorker, "primary", {}, {
    timeoutMs: PRIMARY_TIMEOUT_MS,
  });
  primaryWorker.terminate();
  if (primary.status === "unsupported") {
    publish({
      status: "unsupported",
      pass: false,
      schemaVersion: 1,
      execution: "vite-production-build-chromium-dedicated-workers",
      primary,
      pageMemory: { before: pageMemoryBefore, after: await memorySnapshot() },
      pageSecurityPolicyViolations,
    });
    return;
  }
  if (primary.pass !== true) {
    publish({
      status: "error",
      pass: false,
      schemaVersion: 1,
      execution: "vite-production-build-chromium-dedicated-workers",
      primary,
      pageMemory: { before: pageMemoryBefore, after: await memorySnapshot() },
      pageSecurityPolicyViolations,
    });
    return;
  }

  const crashWorker = worker("bg3d-sqlite-opfs-forced-terminate");
  await waitForReady(crashWorker);
  const crash = await runCommand(crashWorker, "crash-commit");
  if (crash.pass !== true || crash.databaseIntentionallyLeftOpen !== true) {
    crashWorker.terminate();
    throw new Error("forced-termination setup did not commit with an open SQLite handle");
  }
  const terminatedAt = performance.now();
  crashWorker.terminate();
  await new Promise((resolve) => window.setTimeout(resolve, 250));

  const recoveryWorker = worker("bg3d-sqlite-opfs-post-terminate-recovery");
  await waitForReady(recoveryWorker);
  const recovery = await runCommand(recoveryWorker, "recover-after-terminate", {
    hash: crash.hash,
    bytes: crash.bytes,
  });
  recoveryWorker.terminate();

  const contenderA = worker("bg3d-sqlite-opfs-contender-a");
  const contenderB = worker("bg3d-sqlite-opfs-contender-b");
  await Promise.all([waitForReady(contenderA), waitForReady(contenderB)]);
  let resolveFirstLock!: () => void;
  const firstLock = new Promise<void>((resolve) => {
    resolveFirstLock = resolve;
  });
  const contentionA = runCommand(
    contenderA,
    "contention-hold",
    { holdMs: 250 },
    {
      onProgress(envelope) {
        if (envelope.progress === "product-lock-acquired") resolveFirstLock();
      },
    },
  );
  await Promise.race([
    firstLock,
    new Promise<never>((_, reject) => window.setTimeout(
      () => reject(new Error("contender A did not acquire the measured product lock")),
      30_000,
    )),
  ]);
  const contentionB = runCommand(
    contenderB,
    "contention-write",
    { workerId: "b", holdMs: 0 },
  );
  const [contenderAResult, contenderBResult] = await Promise.all([contentionA, contentionB]);
  contenderA.terminate();
  contenderB.terminate();

  const writes = nested(primary, "models", "writes");
  const modelHashes = Array.isArray(writes)
    ? writes.map((write) => String(record(write)?.expectedHash ?? ""))
    : [];
  modelHashes.push(String(crash.hash ?? ""));
  const contentionHashes = [contenderBResult.hash].map(String);
  const finalWorker = worker("bg3d-sqlite-opfs-final-verifier");
  await waitForReady(finalWorker);
  const finalVerification = await runCommand(finalWorker, "verify-final", {
    modelHashes,
    contentionHashes,
  });
  finalWorker.terminate();

  const bWaitMs = Number(nested(contenderBResult, "locks", "maxWaitMs") ?? 0);
  const contentionPass = contenderAResult.pass === true
    && contenderBResult.pass === true
    && nested(contenderAResult, "locks", "instrumentationAvailable") === true
    && nested(contenderBResult, "locks", "instrumentationAvailable") === true
    && bWaitMs >= 150
    && finalVerification.contentionWritesPresent === true;
  const fallback = aggregateFallback(
    primary.fallback,
    crash.fallback,
    recovery.fallback,
    contenderAResult.fallback,
    contenderBResult.fallback,
    finalVerification.fallback,
  );
  const forcedTerminationPass = recovery.pass === true
    && recovery.exactHashAndBytes === true
    && crash.databaseIntentionallyLeftOpen === true;
  const pageMemoryAfter = await memorySnapshot();
  const pass = primary.pass === true
    && forcedTerminationPass
    && contentionPass
    && finalVerification.pass === true
    && fallback.totalFallbackCount === 0
    && fallback.probesInstalledInEveryWorker === true
    && pageSecurityPolicyViolations.length === 0;

  publish({
    status: pass ? "ok" : "error",
    pass,
    schemaVersion: 1,
    execution: "vite-production-build-chromium-dedicated-workers",
    primary,
    forcedTermination: {
      pass: forcedTerminationPass,
      workerTerminateCalled: true,
      databaseCloseCalledBeforeTerminate: false,
      terminateToRecoveryStartDelayMs: 250,
      terminatedAtMonotonicMs: terminatedAt,
      commit: crash,
      recovery,
    },
    contention: {
      attempted: true,
      supported: true,
      pass: contentionPass,
      mode: "dedicated-worker-lock-holder-plus-product-authority-writer",
      orchestratedHoldMs: 250,
      contenderA: contenderAResult,
      contenderB: contenderBResult,
      contenderBObservedWaitMs: bWaitMs,
      productWritePresentAfterFreshWorkerReopen: finalVerification.contentionWritesPresent,
      dualProductAuthorityWorkers: {
        status: "infeasible",
        attemptedInExploratoryRun: true,
        browser: "Chromium 140.0.7339.186",
        reason:
          "OPFS SAH-pool retains SyncAccessHandles for the owning Worker lifetime; a second "
          + "Worker opening the same pool was rejected with NoModificationAllowedError even "
          + "after the first logical DB handle closed.",
      },
    },
    finalVerification,
    fallback,
    pageMemory: { before: pageMemoryBefore, after: pageMemoryAfter },
    pageSecurityPolicyViolations,
    infeasibleDimensions: [
      ...Array.isArray(primary.infeasibleDimensions) ? primary.infeasibleDimensions : [],
      "Dedicated Worker terminate is measured; full Chromium process SIGKILL, browser crash, OS power loss, and fsync hardware semantics remain infeasible in this harness.",
      "Only the current Chromium/macOS device is measured; Windows, Linux, mobile, Safari, and Firefox remain unmeasured.",
      "Quota exhaustion is not induced because it can destabilize other same-origin benchmark evidence; available quota is recorded instead.",
    ],
  });
}

run().catch(async (error) => {
  publish({
    status: "error",
    pass: false,
    schemaVersion: 1,
    execution: "vite-production-build-chromium-dedicated-workers",
    error: errorShape(error),
    pageMemory: { before: null, after: await memorySnapshot() },
  });
});
