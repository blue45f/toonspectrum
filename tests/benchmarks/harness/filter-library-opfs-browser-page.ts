/** Main-page launcher for the Dedicated Worker filter-library OPFS benchmark. */

const RESULT_GLOBAL = "__TOONSPECTRUM_FILTER_LIBRARY_OPFS_BROWSER_RESULT__";

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

function errorShape(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : { name: "NonError", message: String(error), stack: null };
}

async function memorySnapshot(): Promise<Record<string, unknown>> {
  const browserPerformance = performance as BrowserMemoryPerformance;
  let userAgentSpecific: Record<string, unknown> | null = null;
  let userAgentSpecificError: Record<string, unknown> | null = null;
  if (typeof browserPerformance.measureUserAgentSpecificMemory === "function") {
    try {
      const measured = await browserPerformance.measureUserAgentSpecificMemory();
      userAgentSpecific = {
        bytes: measured.bytes,
        breakdownEntryCount: measured.breakdown?.length ?? null,
      };
    } catch (error) {
      userAgentSpecificError = errorShape(error);
    }
  }
  return {
    performanceMemory: browserPerformance.memory
      ? {
          usedJSHeapSizeBytes: browserPerformance.memory.usedJSHeapSize,
          totalJSHeapSizeBytes: browserPerformance.memory.totalJSHeapSize,
          jsHeapSizeLimitBytes: browserPerformance.memory.jsHeapSizeLimit,
        }
      : null,
    userAgentSpecific,
    userAgentSpecificError,
  };
}

function publish(value: unknown): void {
  (window as unknown as Record<string, unknown>)[RESULT_GLOBAL] = value;
  const output = document.querySelector("[data-benchmark-output]");
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

async function run(): Promise<void> {
  const pageMemoryBefore = await memorySnapshot();
  const pageSecurityPolicyViolations: Array<Record<string, unknown>> = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    pageSecurityPolicyViolations.push({
      effectiveDirective: event.effectiveDirective,
      blockedUri: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const worker = new Worker(
    new URL("./filter-library-opfs-browser-client.ts", import.meta.url),
    { type: "module", name: "filter-library-opfs-sahpool-benchmark" },
  );
  worker.addEventListener("message", async (event: MessageEvent<unknown>) => {
    const envelope = event.data as { type?: unknown; value?: unknown } | null;
    if (envelope?.type !== "benchmark-result") return;
    worker.terminate();
    const pageMemoryAfter = await memorySnapshot();
    const result = envelope.value && typeof envelope.value === "object"
      ? envelope.value as Record<string, unknown>
      : { status: "error", pass: false, error: { message: "worker returned an invalid result" } };
    publish({
      ...result,
      pageMemory: { before: pageMemoryBefore, after: pageMemoryAfter },
      pageSecurityPolicyViolations,
    });
  });
  worker.addEventListener("error", (event) => {
    worker.terminate();
    publish({
      status: "error",
      pass: false,
      schemaVersion: 1,
      authority: "sqlite-opfs-sahpool",
      error: {
        name: "WorkerError",
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      pageMemory: { before: pageMemoryBefore, after: null },
      pageSecurityPolicyViolations,
    });
  });
}

run().catch((error) => {
  publish({
    status: "error",
    pass: false,
    schemaVersion: 1,
    authority: "sqlite-opfs-sahpool",
    error: errorShape(error),
  });
});
