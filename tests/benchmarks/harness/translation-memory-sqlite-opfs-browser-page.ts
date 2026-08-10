/** Main-page launcher for the Dedicated Worker translation-memory OPFS probe. */

const RESULT_GLOBAL = "__TOONSPECTRUM_TRANSLATION_MEMORY_SQLITE_OPFS_RESULT__";

function errorShape(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack ?? null }
    : { name: "NonError", message: String(error), stack: null };
}

function publish(value: unknown): void {
  (window as unknown as Record<string, unknown>)[RESULT_GLOBAL] = value;
  const output = document.querySelector("[data-benchmark-output]");
  if (output) output.textContent = JSON.stringify(value, null, 2);
}

function run(): void {
  const pageSecurityPolicyViolations: Array<Record<string, unknown>> = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    pageSecurityPolicyViolations.push({
      effectiveDirective: event.effectiveDirective,
      blockedUri: event.blockedURI,
      disposition: event.disposition,
    });
  });
  const worker = new Worker(
    new URL("./translation-memory-sqlite-opfs-browser-client.ts", import.meta.url),
    { type: "module", name: "translation-memory-sqlite-opfs-probe" },
  );
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    const envelope = event.data as { type?: unknown; value?: unknown } | null;
    if (envelope?.type !== "benchmark-result") return;
    worker.terminate();
    const result = envelope.value && typeof envelope.value === "object"
      ? envelope.value as Record<string, unknown>
      : { status: "error", pass: false, error: { message: "worker returned invalid data" } };
    publish({ ...result, pageSecurityPolicyViolations });
  });
  worker.addEventListener("error", (event) => {
    worker.terminate();
    publish({
      status: "error",
      pass: false,
      schemaVersion: 1,
      error: {
        name: "WorkerError",
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      pageSecurityPolicyViolations,
    });
  });
}

try {
  run();
} catch (error) {
  publish({ status: "error", pass: false, schemaVersion: 1, error: errorShape(error) });
}
