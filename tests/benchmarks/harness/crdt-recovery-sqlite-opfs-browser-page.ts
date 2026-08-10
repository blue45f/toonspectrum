/** Page coordinator for the CRDT recovery-vault v6 SQLite/OPFS Chromium gate. */

const RESULT_GLOBAL = "__TOONSPECTRUM_CRDT_RECOVERY_SQLITE_OPFS_BROWSER_RESULT__";
const REPORT_SCHEMA_VERSION = 1;
const PHASE_TIMEOUT_MS = 5 * 60 * 1_000;
const OWNER_HOLD_MS = 1_000;

type JsonRecord = Record<string, unknown>;

type WorkerCommandName =
  | "graceful-seed"
  | "graceful-reopen"
  | "termination-seed"
  | "termination-verify"
  | "corruption-seed"
  | "corruption-verify"
  | "contention-owner"
  | "contention-contender"
  | "contention-verify";

interface WorkerEnvelope {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly progress?: unknown;
  readonly value?: unknown;
}

interface BrowserMemoryPerformance extends Performance {
  readonly memory?: {
    readonly jsHeapSizeLimit?: number;
    readonly totalJSHeapSize?: number;
    readonly usedJSHeapSize?: number;
  };
  measureUserAgentSpecificMemory?: () => Promise<{
    readonly bytes?: number;
    readonly breakdown?: readonly unknown[];
  }>;
}

const pageFallbackProbe = {
  indexedDbAccessCount: 0,
  localStorageAccessCount: 0,
  indexedDbProbeInstalled: false,
  localStorageProbeInstalled: false,
};

function installPageFallbackProbes(): void {
  try {
    const original = window.indexedDB;
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      enumerable: true,
      get() {
        pageFallbackProbe.indexedDbAccessCount += 1;
        return original;
      },
    });
    pageFallbackProbe.indexedDbProbeInstalled = true;
  } catch {
    pageFallbackProbe.indexedDbProbeInstalled = false;
  }
  try {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      enumerable: true,
      get() {
        pageFallbackProbe.localStorageAccessCount += 1;
        return original;
      },
    });
    pageFallbackProbe.localStorageProbeInstalled = true;
  } catch {
    pageFallbackProbe.localStorageProbeInstalled = false;
  }
}

installPageFallbackProbes();

const pageSecurityPolicyViolations: JsonRecord[] = [];
document.addEventListener("securitypolicyviolation", (event) => {
  pageSecurityPolicyViolations.push({
    blockedURI: event.blockedURI,
    effectiveDirective: event.effectiveDirective,
    violatedDirective: event.violatedDirective,
    disposition: event.disposition,
  });
});

function fixed(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
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

function worker(name: string): Worker {
  return new Worker(
    new URL("./crdt-recovery-sqlite-opfs-browser-worker.ts", import.meta.url),
    { type: "module", name },
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForReady(target: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("CRDT recovery benchmark Worker did not become ready"));
    }, 30_000);
    const onMessage = (event: MessageEvent<WorkerEnvelope>) => {
      if (event.data?.type !== "ready") return;
      cleanup();
      resolve();
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(`CRDT recovery benchmark Worker error: ${event.message}`));
    };
    function cleanup(): void {
      window.clearTimeout(timeout);
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onError);
    }
    target.addEventListener("message", onMessage);
    target.addEventListener("error", onError);
  });
}

function runCommand(
  target: Worker,
  command: WorkerCommandName,
  payload: JsonRecord = {},
  options: { readonly onProgress?: (progress: string) => void } = {},
): Promise<JsonRecord> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${command} timed out after ${PHASE_TIMEOUT_MS}ms`));
    }, PHASE_TIMEOUT_MS);
    const onMessage = (event: MessageEvent<WorkerEnvelope>) => {
      if (event.data?.id !== id) return;
      if (event.data.type === "progress") {
        options.onProgress?.(String(event.data.progress ?? ""));
        return;
      }
      if (event.data.type !== "result") return;
      cleanup();
      resolve(record(event.data.value));
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(`${command} Worker error: ${event.message}`));
    };
    function cleanup(): void {
      window.clearTimeout(timeout);
      target.removeEventListener("message", onMessage);
      target.removeEventListener("error", onError);
    }
    target.addEventListener("message", onMessage);
    target.addEventListener("error", onError);
    target.postMessage({ id, command, payload });
  });
}

async function runFreshWorker(
  name: string,
  command: WorkerCommandName,
  payload: JsonRecord = {},
  options: { readonly terminateDelayMs?: number } = {},
): Promise<JsonRecord> {
  const target = worker(name);
  await waitForReady(target);
  try {
    return await runCommand(target, command, payload);
  } finally {
    target.terminate();
    await wait(options.terminateDelayMs ?? 250);
  }
}

async function memorySnapshot(): Promise<JsonRecord> {
  const measuredPerformance = performance as BrowserMemoryPerformance;
  let userAgentSpecific: JsonRecord | null = null;
  if (typeof measuredPerformance.measureUserAgentSpecificMemory === "function") {
    try {
      const measured = await measuredPerformance.measureUserAgentSpecificMemory();
      userAgentSpecific = {
        bytes: measured.bytes ?? null,
        breakdownEntryCount: measured.breakdown?.length ?? null,
      };
    } catch {
      userAgentSpecific = null;
    }
  }
  return {
    performanceMemory: measuredPerformance.memory
      ? {
          usedJSHeapSizeBytes: measuredPerformance.memory.usedJSHeapSize ?? null,
          totalJSHeapSizeBytes: measuredPerformance.memory.totalJSHeapSize ?? null,
          jsHeapSizeLimitBytes: measuredPerformance.memory.jsHeapSizeLimit ?? null,
        }
      : null,
    userAgentSpecific,
  };
}

function aggregateFallback(...receipts: readonly unknown[]): JsonRecord {
  const records = receipts.map(record);
  const sum = (field: string): number => records.reduce((total, receipt) => {
    const value = receipt[field];
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
  const workerIndexedDbAccessCount = sum("indexedDbAccessCount");
  const workerLocalStorageAccessCount = sum("localStorageAccessCount");
  const memoryDatabaseOpenCount = sum("memoryDatabaseOpenCount");
  const durableMemoryFallbackSuccessCount = sum("durableMemoryFallbackSuccessCount");
  const totalFallbackCount = workerIndexedDbAccessCount
    + workerLocalStorageAccessCount
    + memoryDatabaseOpenCount
    + durableMemoryFallbackSuccessCount
    + pageFallbackProbe.indexedDbAccessCount
    + pageFallbackProbe.localStorageAccessCount;
  return {
    workerCount: records.length,
    workerIndexedDbAccessCount,
    workerLocalStorageAccessCount,
    pageIndexedDbAccessCount: pageFallbackProbe.indexedDbAccessCount,
    pageLocalStorageAccessCount: pageFallbackProbe.localStorageAccessCount,
    memoryDatabaseOpenCount,
    durableMemoryFallbackSuccessCount,
    totalFallbackCount,
    workerProbesInstalledInEveryWorker: records.every((receipt) =>
      receipt.indexedDbProbeInstalled === true && receipt.localStorageProbeInstalled === true),
    pageProbes: {
      indexedDbProbeInstalled: pageFallbackProbe.indexedDbProbeInstalled,
      localStorageProbeInstalled: pageFallbackProbe.localStorageProbeInstalled,
    },
  };
}

async function run(): Promise<void> {
  const pageMemoryBefore = await memorySnapshot();
  const gracefulSeed = await runFreshWorker(
    "crdt-recovery-graceful-seed",
    "graceful-seed",
  );
  if (gracefulSeed.status === "unsupported") {
    publish({
      status: "unsupported",
      pass: false,
      schemaVersion: REPORT_SCHEMA_VERSION,
      execution: "vite-production-build-chromium-dedicated-workers",
      reason: gracefulSeed.reason ?? "OPFS SAH-pool unavailable",
      gracefulSeed,
      claims: {
        browserOpfsDurability: null,
        multiWorkerConcurrentOwnership: null,
        osCrashPowerLoss: null,
        quotaExhaustion: null,
        externalCspParity: false,
      },
    });
    return;
  }

  const gracefulReopen = await runFreshWorker(
    "crdt-recovery-graceful-reopen",
    "graceful-reopen",
    { expectedDigest: gracefulSeed.expected && record(gracefulSeed.expected).digest },
  );

  const terminationWorker = worker("crdt-recovery-termination-seed");
  await waitForReady(terminationWorker);
  const terminationSeed = await runCommand(terminationWorker, "termination-seed");
  const terminationResultAt = performance.now();
  terminationWorker.terminate();
  await wait(250);
  const terminationVerify = await runFreshWorker(
    "crdt-recovery-termination-verify",
    "termination-verify",
    { expectedDigest: terminationSeed.expectedDigest },
  );

  const corruptionSeed = await runFreshWorker(
    "crdt-recovery-corruption-seed",
    "corruption-seed",
  );
  const corruptionVerify = await runFreshWorker(
    "crdt-recovery-corruption-verify",
    "corruption-verify",
  );

  const ownerWorker = worker("crdt-recovery-contention-owner");
  const contenderWorker = worker("crdt-recovery-contention-contender");
  await Promise.all([waitForReady(ownerWorker), waitForReady(contenderWorker)]);
  let resolveOwnerReady!: () => void;
  const ownerReady = new Promise<void>((resolve) => {
    resolveOwnerReady = resolve;
  });
  const ownerResultPromise = runCommand(
    ownerWorker,
    "contention-owner",
    { holdMs: OWNER_HOLD_MS },
    {
      onProgress(progress) {
        if (progress === "owner-ready") resolveOwnerReady();
      },
    },
  );
  await Promise.race([
    ownerReady,
    new Promise<never>((_, reject) => window.setTimeout(
      () => reject(new Error("contention owner did not acquire the SAH-pool")),
      30_000,
    )),
  ]);
  const contenderResult = await runCommand(contenderWorker, "contention-contender");
  const ownerResult = await ownerResultPromise;
  ownerWorker.terminate();
  contenderWorker.terminate();
  await wait(300);

  const contenderCommitted = contenderResult.status === "supported"
    && contenderResult.pass === true;
  const contentionVerify = await runFreshWorker(
    "crdt-recovery-contention-verify",
    "contention-verify",
    {
      contenderCommitted,
      ownerExpectedDigest: ownerResult.digest,
      contenderExpectedDigest: contenderCommitted ? contenderResult.digest : "",
    },
  );
  const contenderQuarantined = contenderResult.status === "quarantined-single-owner"
    && contenderResult.knownSingleOwnerRejection === true;
  const contentionGatePass = ownerResult.pass === true
    && contentionVerify.pass === true
    && (contenderCommitted || contenderQuarantined);
  const contentionClaim = contenderCommitted
    ? "supported-and-exact"
    : contenderQuarantined ? "quarantined-single-owner" : "failed-unknown";

  const fallback = aggregateFallback(
    gracefulSeed.fallback,
    gracefulReopen.fallback,
    terminationSeed.fallback,
    terminationVerify.fallback,
    corruptionSeed.fallback,
    corruptionVerify.fallback,
    ownerResult.fallback,
    contenderResult.fallback,
    contentionVerify.fallback,
  );
  const gracefulPass = gracefulSeed.pass === true && gracefulReopen.pass === true;
  const forcedTerminationPass = terminationSeed.pass === true
    && terminationSeed.databaseIntentionallyLeftOpen === true
    && terminationVerify.pass === true
    && record(terminationVerify.exact).match === true;
  const corruptionPass = corruptionSeed.pass === true
    && corruptionVerify.pass === true
    && corruptionVerify.failClosed === true
    && corruptionVerify.returnedPartialFrontierCount === 0;
  const pageMemoryAfter = await memorySnapshot();
  const pass = gracefulPass
    && forcedTerminationPass
    && corruptionPass
    && contentionGatePass
    && fallback.totalFallbackCount === 0
    && fallback.workerProbesInstalledInEveryWorker === true
    && pageSecurityPolicyViolations.length === 0;

  publish({
    status: pass ? "ok" : "error",
    pass,
    schemaVersion: REPORT_SCHEMA_VERSION,
    execution: "vite-production-build-chromium-dedicated-workers",
    authority: gracefulSeed.authority,
    gracefulRestart: {
      pass: gracefulPass,
      seed: gracefulSeed,
      reopen: gracefulReopen,
    },
    forcedTermination: {
      pass: forcedTerminationPass,
      workerTerminateCalled: true,
      databaseCloseCalledBeforeTerminate: false,
      terminateToRecoveryStartDelayMs: 250,
      terminationResultAtMonotonicMs: fixed(terminationResultAt),
      seed: terminationSeed,
      verify: terminationVerify,
    },
    corruption: {
      attempted: true,
      safeTestSeam: true,
      pass: corruptionPass,
      seed: corruptionSeed,
      verify: corruptionVerify,
    },
    contention: {
      attempted: true,
      bounded: true,
      ownerHoldMs: OWNER_HOLD_MS,
      claim: contentionClaim,
      concurrentOwnershipSupported: contenderCommitted,
      gatePass: contentionGatePass,
      owner: ownerResult,
      contender: contenderResult,
      finalVerification: contentionVerify,
      quarantinedReason: contenderQuarantined
        ? "Chromium OPFS SAH-pool rejected a concurrent second Worker owner; no support claim is made"
        : null,
    },
    metrics: {
      save: record(record(gracefulSeed.metrics).save),
      load: record(record(gracefulReopen.metrics).load),
      export: record(record(gracefulReopen.metrics).export),
      bundleBuild: record(record(gracefulReopen.metrics).bundleBuild),
      payloadBytes: record(gracefulReopen.rows).payloadBytes ?? null,
      rowCount: record(gracefulReopen.rows).rowCount ?? null,
      workerPeakMemoryBytes: null,
      workerPeakMemoryReason:
        "Chromium exposes snapshots only; no Worker peak-memory observer is available",
    },
    fallback,
    pageMemory: { before: pageMemoryBefore, after: pageMemoryAfter },
    pageSecurityPolicyViolations,
    claims: {
      browserOpfsDurability: true,
      multiWorkerConcurrentOwnership: contenderCommitted ? true : null,
      osCrashPowerLoss: null,
      quotaExhaustion: null,
      externalCspParity: false,
    },
    quarantinedLimitations: [
      ...(contenderQuarantined
        ? ["Concurrent dual-Worker SAH-pool ownership is quarantined on this Chromium build."]
        : []),
      "Full Chromium process crash, OS crash, power loss, and hardware fsync semantics are unmeasured.",
      "Quota exhaustion and full SAH-pool injection remain unmeasured to avoid destabilizing the shared origin.",
      "Multi-tab authenticated Yjs convergence and server receipt deduplication are separate gates.",
      "External CSP blind quality parity is not claimed by this storage benchmark.",
    ],
    remainingFaultGates: [
      "full-browser-process-crash",
      "os-crash-and-power-loss",
      "opfs-quota-exhaustion",
      "sah-pool-capacity-exhaustion",
      "long-duration-multi-tab-contention",
      "cross-platform-filesystem-matrix",
    ],
  });
}

run().catch(async (error) => {
  publish({
    status: "error",
    pass: false,
    schemaVersion: REPORT_SCHEMA_VERSION,
    execution: "vite-production-build-chromium-dedicated-workers",
    error: errorShape(error),
    pageMemory: { before: null, after: await memorySnapshot() },
    pageSecurityPolicyViolations,
    claims: {
      browserOpfsDurability: null,
      multiWorkerConcurrentOwnership: null,
      osCrashPowerLoss: null,
      quotaExhaustion: null,
      externalCspParity: false,
    },
  });
});
