/** Main-page coordinator for normal close/reopen and forced Worker termination phases. */

const RESULT_GLOBAL = "__TOONSPECTRUM_PRODUCTION_BIBLE_SQLITE_OPFS_RESULT__";
const PHASE_TIMEOUT_MS = 120_000;

type Phase = "normal" | "termination-seed" | "termination-verify";
type JsonRecord = Record<string, unknown>;

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

function runWorkerPhase(
  phase: Phase,
  expectedType: "phase-result" | "termination-ready",
): Promise<{ value: JsonRecord; worker: Worker }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./production-bible-sqlite-opfs-browser-client.ts", import.meta.url),
      { type: "module", name: `production-bible-sqlite-opfs-${phase}` },
    );
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`${phase} Worker timed out after ${PHASE_TIMEOUT_MS}ms`));
    }, PHASE_TIMEOUT_MS);
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      const envelope = event.data as { type?: unknown; value?: unknown } | null;
      if (envelope?.type !== expectedType) return;
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

  const normal = await runWorkerPhase("normal", "phase-result");
  normal.worker.terminate();
  if (normal.value.status === "unsupported") {
    publish({
      status: "unsupported",
      pass: false,
      schemaVersion: 1,
      normal: normal.value,
      forcedTermination: null,
      pageSecurityPolicyViolations,
    });
    return;
  }

  const seed = await runWorkerPhase("termination-seed", "termination-ready");
  seed.worker.terminate();
  const terminatedAt = performance.now();
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  const verify = await runWorkerPhase("termination-verify", "phase-result");
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
      && verify.value.reopenedCanonicalExact === true,
  };
  publish({
    status:
      normal.value.pass === true && forcedTermination.pass
        ? "ok"
        : "error",
    pass: normal.value.pass === true && forcedTermination.pass,
    schemaVersion: 1,
    normal: normal.value,
    forcedTermination,
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
