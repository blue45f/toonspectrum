/** Page coordinator for the custom-font SQLite/OPFS browser promotion gate. */

declare const __CUSTOM_FONT_BENCHMARK_FIXTURES__: readonly FontFixtureDescriptor[];

const RESULT_GLOBAL = "__TOONSPECTRUM_CUSTOM_FONT_SQLITE_OPFS_RESULT__";
const PRIMARY_TIMEOUT_MS = 15 * 60 * 1_000;
const PHASE_TIMEOUT_MS = 5 * 60 * 1_000;
const RECOVERY_SAMPLES = 30;

type WorkerCommand =
  | "primary"
  | "reopen"
  | "reopen-sample"
  | "faults"
  | "termination-seed"
  | "termination-verify";

type JsonRecord = Record<string, unknown>;

interface Distribution {
  readonly sampleCount: number;
  readonly percentileMethod: "nearest-rank-ceil";
  readonly samplesMs: readonly number[];
  readonly minMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly meanMs: number;
}

interface FontFixtureDescriptor {
  readonly id: "cjk-medium" | "largest-ttc";
  readonly class: "cjk-5-30-mib" | "largest-ttc-under-128-mib";
  readonly url: string;
  readonly sourcePath: string;
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly contentHash: `sha256:${string}`;
  readonly format: "ttf" | "otf" | "ttc" | "woff" | "woff2";
  readonly mimeType: string;
  readonly licenseCaveat: string;
}

interface FontPayload {
  readonly family: string;
  readonly fileName: string;
  readonly format: string;
  readonly bytes: ArrayBuffer;
}

interface WorkerEnvelope {
  readonly type?: unknown;
  readonly value?: unknown;
  readonly fontPayloads?: unknown;
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

function fixed(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[Math.min(sorted.length - 1, index)] ?? 0;
}

function distribution(samples: readonly number[]): Distribution {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.length === 0
    ? 0
    : samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  return {
    sampleCount: samples.length,
    percentileMethod: "nearest-rank-ceil",
    samplesMs: samples.map((sample) => fixed(sample)),
    minMs: fixed(sorted[0] ?? 0),
    p50Ms: fixed(percentile(sorted, 0.5)),
    p95Ms: fixed(percentile(sorted, 0.95)),
    p99Ms: fixed(percentile(sorted, 0.99)),
    maxMs: fixed(sorted.at(-1) ?? 0),
    meanMs: fixed(mean),
  };
}

function measuredField(receipt: JsonRecord, field: string): number {
  const value = receipt[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid ${field} receipt from recovery Worker`);
  }
  return value;
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : { status: "error", pass: false, error: "invalid Worker receipt" };
}

function asFontPayloads(value: unknown): FontPayload[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is FontPayload => {
    if (!candidate || typeof candidate !== "object") return false;
    const record = candidate as Record<string, unknown>;
    return typeof record.family === "string"
      && typeof record.fileName === "string"
      && typeof record.format === "string"
      && record.bytes instanceof ArrayBuffer;
  });
}

function runWorkerPhase(
  command: WorkerCommand,
  expectedType: "phase-result" | "termination-ready" = "phase-result",
): Promise<{ value: JsonRecord; worker: Worker; fontPayloads: FontPayload[] }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./custom-font-sqlite-opfs-browser-worker.ts", import.meta.url),
      { type: "module", name: `custom-font-sqlite-opfs-${command}` },
    );
    const timeoutMs = command === "primary" ? PRIMARY_TIMEOUT_MS : PHASE_TIMEOUT_MS;
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error(`${command} Worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    worker.addEventListener("message", (event: MessageEvent<WorkerEnvelope>) => {
      if (event.data?.type !== expectedType) return;
      window.clearTimeout(timeout);
      resolve({
        value: asRecord(event.data.value),
        worker,
        fontPayloads: asFontPayloads(event.data.fontPayloads),
      });
    });
    worker.addEventListener("error", (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(`${command} Worker error: ${event.message}`));
    });
    worker.postMessage({ command });
  });
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const source = bytes.byteOffset === 0
    && bytes.byteLength === bytes.buffer.byteLength
    && bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : Uint8Array.from(bytes).buffer;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function canvasPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("canvas PNG encode failed")), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function drawFontSamples(
  context: CanvasRenderingContext2D,
  payloads: readonly FontPayload[],
): void {
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  context.fillStyle = "#101010";
  context.textBaseline = "alphabetic";
  const medium = payloads.find(({ format }) => format !== "ttc") ?? payloads[0];
  const largest = payloads.find(({ format }) => format === "ttc") ?? payloads.at(-1);
  if (!medium || !largest) throw new Error("both recovered font payloads are required");
  context.font = `64px "${medium.family}"`;
  context.fillText("한글 손맛 필압 정밀 2026", 32, 105);
  context.font = `60px "${largest.family}"`;
  context.fillText("日本語の線画精度 中文字体渲染精度", 32, 215);
  context.font = `38px "${medium.family}"`;
  context.fillText("가나다 ABC 123 · 한中日", 32, 300);
  context.restore();
}

async function registerAndRenderRecoveredFonts(
  payloads: readonly FontPayload[],
): Promise<JsonRecord> {
  const decodeReceipts: JsonRecord[] = [];
  for (const payload of payloads) {
    const startedAt = performance.now();
    try {
      const source = payload.bytes.slice(0);
      const face = new FontFace(payload.family, source);
      await face.load();
      document.fonts.add(face);
      const loaded = document.fonts.check(`32px "${payload.family}"`);
      decodeReceipts.push({
        family: payload.family,
        fileName: payload.fileName,
        format: payload.format,
        byteLength: payload.bytes.byteLength,
        decodeMs: fixed(performance.now() - startedAt),
        status: face.status,
        documentFontsCheck: loaded,
        pass: face.status === "loaded" && loaded,
        error: null,
      });
    } catch (error) {
      decodeReceipts.push({
        family: payload.family,
        fileName: payload.fileName,
        format: payload.format,
        byteLength: payload.bytes.byteLength,
        decodeMs: fixed(performance.now() - startedAt),
        status: "error",
        documentFontsCheck: false,
        pass: false,
        error: errorShape(error),
      });
    }
  }
  const loadedPayloads = payloads.filter((payload) =>
    decodeReceipts.some((receipt) => receipt.family === payload.family && receipt.pass === true));
  if (loadedPayloads.length !== payloads.length) {
    return {
      pass: false,
      decodeReceipts,
      render: null,
      explicitReason: "One or more recovered ArrayBuffer fonts failed FontFace decode",
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 340;
  canvas.setAttribute("data-custom-font-evidence", "true");
  document.body.append(canvas);
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("2D canvas context is unavailable");

  drawFontSamples(context, loadedPayloads);
  const firstPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const firstPixelSha256 = await sha256Bytes(firstPixels);
  const firstPng = await canvasPngBytes(canvas);
  const firstPngSha256 = await sha256Bytes(firstPng);
  drawFontSamples(context, loadedPayloads);
  const secondPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const secondPixelSha256 = await sha256Bytes(secondPixels);
  const secondPng = await canvasPngBytes(canvas);
  const secondPngSha256 = await sha256Bytes(secondPng);
  let nonWhitePixels = 0;
  for (let offset = 0; offset < secondPixels.length; offset += 4) {
    if (
      secondPixels[offset] !== 255
      || secondPixels[offset + 1] !== 255
      || secondPixels[offset + 2] !== 255
    ) nonWhitePixels += 1;
  }
  const deterministic = firstPixelSha256 === secondPixelSha256
    && firstPngSha256 === secondPngSha256;
  return {
    pass: deterministic && nonWhitePixels > 1_000,
    decodeReceipts,
    render: {
      canvas: { width: canvas.width, height: canvas.height, colorSpace: "srgb" },
      samples: [
        "한글 손맛 필압 정밀 2026",
        "日本語の線画精度 中文字体渲染精度",
        "가나다 ABC 123 · 한中日",
      ],
      firstPixelSha256,
      secondPixelSha256,
      firstPngSha256,
      secondPngSha256,
      pngBytes: firstPng.byteLength,
      nonWhitePixels,
      deterministic,
      browserRasterEvidenceScope:
        "same-production-build-same-Chromium-same-system-font-bytes-two-renders",
    },
    explicitReason: null,
  };
}

async function captureMemory(): Promise<JsonRecord> {
  const measured = performance as BrowserMemoryPerformance;
  const performanceMemory = measured.memory
    ? {
        jsHeapSizeLimitBytes: measured.memory.jsHeapSizeLimit ?? null,
        totalJSHeapSizeBytes: measured.memory.totalJSHeapSize ?? null,
        usedJSHeapSizeBytes: measured.memory.usedJSHeapSize ?? null,
      }
    : null;
  const specific = measured.measureUserAgentSpecificMemory;
  if (typeof specific !== "function") {
    return {
      performanceMemory,
      performanceMemoryUnavailableReason: performanceMemory === null
        ? "performance.memory is not exposed on this page"
        : null,
      userAgentSpecificMemory: null,
      userAgentSpecificMemoryUnavailableReason:
        "performance.measureUserAgentSpecificMemory is not exposed on this page",
    };
  }
  try {
    const result = await specific.call(measured);
    return {
      performanceMemory,
      performanceMemoryUnavailableReason: performanceMemory === null
        ? "performance.memory is not exposed on this page"
        : null,
      userAgentSpecificMemory: {
        bytes: typeof result.bytes === "number" ? result.bytes : null,
        breakdownCount: Array.isArray(result.breakdown) ? result.breakdown.length : null,
      },
      userAgentSpecificMemoryUnavailableReason: null,
    };
  } catch (error) {
    return {
      performanceMemory,
      performanceMemoryUnavailableReason: performanceMemory === null
        ? "performance.memory is not exposed on this page"
        : null,
      userAgentSpecificMemory: null,
      userAgentSpecificMemoryUnavailableReason: error instanceof Error
        ? error.message
        : String(error),
    };
  }
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
  const pageMemoryBefore = await captureMemory();

  const primary = await runWorkerPhase("primary");
  primary.worker.terminate();
  if (primary.value.status !== "ok") {
    publish({
      status: primary.value.status === "unsupported" ? "unsupported" : "error",
      pass: false,
      schemaVersion: 1,
      primary: primary.value,
      pageSecurityPolicyViolations,
    });
    return;
  }

  const reopen = await runWorkerPhase("reopen");
  reopen.worker.terminate();
  const fontFace = await registerAndRenderRecoveredFonts(reopen.fontPayloads);
  const recoveryReceipts = [reopen.value];
  for (let sample = 1; sample < RECOVERY_SAMPLES; sample += 1) {
    const recoverySample = await runWorkerPhase("reopen-sample");
    recoverySample.worker.terminate();
    recoveryReceipts.push(recoverySample.value);
  }
  const allRecoverySamplesPassed = recoveryReceipts.every((receipt) =>
    receipt.pass === true
    && receipt.closeCompleted === true
    && Number((receipt.fallback as JsonRecord | undefined)?.totalFallbackCount) === 0);
  const normalReopen = {
    ...reopen.value,
    pass: reopen.value.pass === true && allRecoverySamplesPassed,
    recoveryCycles: recoveryReceipts.length,
    allRecoverySamplesPassed,
    reopenDatabaseDistribution: distribution(
      recoveryReceipts.map((receipt) => measuredField(receipt, "reopenDatabaseMs")),
    ),
    verifiedListDistribution: distribution(
      recoveryReceipts.map((receipt) => measuredField(receipt, "verifiedListMs")),
    ),
    recoveryDistribution: distribution(
      recoveryReceipts.map((receipt) => measuredField(receipt, "recoveryLatencyMs")),
    ),
  };

  const faults = await runWorkerPhase("faults");
  faults.worker.terminate();

  const seed = await runWorkerPhase("termination-seed", "termination-ready");
  const terminationReceiptObservedAt = performance.now();
  seed.worker.terminate();
  const terminatedAt = performance.now();
  const terminateCallDelayMs = terminatedAt - terminationReceiptObservedAt;
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  const verifyStartedAt = performance.now();
  const verify = await runWorkerPhase("termination-verify");
  verify.worker.terminate();
  const forcedRecoveryElapsedMs = performance.now() - terminatedAt;
  const workerVerifyElapsedMs = performance.now() - verifyStartedAt;

  const forcedTermination = {
    pass:
      seed.value.pass === true
      && seed.value.closeCalledBeforeReceipt === false
      && seed.value.databaseIntentionallyLeftOpen === true
      && verify.value.pass === true
      && verify.value.exactHashAndBytes === true,
    workerTerminateCalled: true,
    terminateCallDelayMs: fixed(terminateCallDelayMs),
    committedReceipt: seed.value,
    recovery: verify.value,
    forcedRecoveryElapsedMs: fixed(forcedRecoveryElapsedMs),
    workerVerifyElapsedMs: fixed(workerVerifyElapsedMs),
    internalRecoveryDistribution: distribution([
      measuredField(verify.value, "recoveryLatencyMs"),
    ]),
    pageRecoveryDistribution: distribution([forcedRecoveryElapsedMs]),
  };
  const pageMemoryAfter = await captureMemory();
  const pass =
    primary.value.pass === true
    && normalReopen.pass === true
    && fontFace.pass === true
    && faults.value.pass === true
    && forcedTermination.pass
    && pageSecurityPolicyViolations.length === 0;
  publish({
    status: pass ? "ok" : "error",
    pass,
    schemaVersion: 1,
    fixtureSelection: __CUSTOM_FONT_BENCHMARK_FIXTURES__,
    primary: primary.value,
    normalReopen,
    fontFace,
    faults: faults.value,
    forcedTermination,
    pageMemory: { before: pageMemoryBefore, after: pageMemoryAfter },
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
