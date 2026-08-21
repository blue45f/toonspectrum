/**
 * Production-preview vertical-slice gate for Studio's Hokusai product boundary.
 *
 * The committed full-size quality/throughput evidence intentionally blocks automatic Hokusai live
 * promotion. This verifier therefore proves two distinct shipped contracts without injecting
 * raster input or bypassing product policy:
 *
 * 1. Selecting pencil, charcoal, or oil from the normal shelf keeps the exact existing vector
 *    route. One trusted pointer gesture persists as one visible DrawEl, and no Hokusai live Worker
 *    may become ready or receive begin/frame/complete traffic.
 * 2. The user-visible "Hokusai 자연매체 · 실험적" inspector is the explicit conversion route.
 *    It probes the settled Hokusai Worker, converts a selected DrawEl into one hidden source plus
 *    one PNG ImageEl, and preserves that pair through one-step Undo/Redo and autosave reload.
 *
 * This file never builds the application. Run it only after a known-good production build exists:
 *   pnpm exec tsx scripts/verify-studio-hokusai-live-integration.mts
 * Reuse an already-running production preview:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5199 \
 *     pnpm exec tsx scripts/verify-studio-hokusai-live-integration.mts
 */
import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import {
  findFreePort,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

export const STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION = 2 as const;

const SCRATCH =
  process.env.TOONSPECTRUM_HOKUSAI_LIVE_INTEGRATION_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-hokusai-live-integration");
const LOG_PATH = join(SCRATCH, "studio-hokusai-live-integration.log");
const REPORT_PATH = join(SCRATCH, "studio-hokusai-live-integration.json");
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const CLEAN_SESSION_KEY = "toonspectrum-hokusai-live-integration-cleaned";
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const APP_SETTINGS_KEY = "toonspectrum-studio-app-settings";
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SOURCE_REVISION_PATTERN = /^hokusai-source-v1:[a-f0-9]{16}$/u;

const FAMILY_SCENARIOS = [
  { brushId: "pencil", brushName: "연필", presetId: "pencil" },
  { brushId: "charcoal", brushName: "목탄", presetId: "charcoal" },
  { brushId: "oil", brushName: "유화 붓", presetId: "oil" },
] as const;

type HokusaiFamilyId = (typeof FAMILY_SCENARIOS)[number]["presetId"];

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly consoleWarnings: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly fiveHundredResponses: string[];
}

interface WorkerBeginEvidence {
  readonly strokeId: string;
}

interface WorkerFrameEvidence {
  readonly strokeId: string;
}

interface WorkerCompleteEvidence {
  readonly strokeId: string;
}

interface StudioHokusaiProductRenderEvidence {
  readonly version: number | null;
  readonly requestId: number | null;
  readonly engineEpoch: number | null;
  readonly sourceElementId: string | null;
  readonly sourceRevision: string | null;
  readonly presetId: string | null;
  readonly materialProfileId: string | null;
  readonly sourcePointCount: number | null;
}

interface StudioHokusaiProductResultEvidence {
  readonly version: number | null;
  readonly requestId: number | null;
  readonly engineEpoch: number | null;
  readonly receiptKind: string | null;
  readonly receiptVersion: number | null;
  readonly receiptRequestId: number | null;
  readonly receiptEngineEpoch: number | null;
  readonly sourceElementId: string | null;
  readonly presetId: string | null;
  readonly materialProfileId: string | null;
  readonly inputHash: string | null;
  readonly pixelHash: string | null;
  readonly pngHash: string | null;
  readonly adapterVersion: string | null;
  readonly execution: string | null;
  readonly pngByteLength: number;
  readonly pngSignatureValid: boolean;
  readonly complete: boolean;
}

interface StudioLayerRowEvidence {
  readonly id: string;
  readonly semanticKind: string | null;
  readonly hidden: boolean;
  readonly selected: boolean;
  readonly accessibleLabel: string;
}

interface TrustedPointerContactEvidence {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly down: readonly [number, number];
  readonly moves: readonly (readonly [number, number])[];
  readonly up: readonly [number, number] | null;
}

interface BrowserMonitorSnapshot {
  readonly liveWorkerConstructionCount: number;
  readonly productWorkerConstructionCount: number;
  readonly readyCount: number;
  readonly begins: WorkerBeginEvidence[];
  readonly frames: WorkerFrameEvidence[];
  readonly completes: WorkerCompleteEvidence[];
  readonly failures: readonly Readonly<{
    reason: string | null;
    detail: string | null;
    strokeId: string | null;
  }>[];
  readonly pointerContacts: TrustedPointerContactEvidence[];
  readonly productReadyCount: number;
  readonly productReadyProtocolValidCount: number;
  readonly productRenders: StudioHokusaiProductRenderEvidence[];
  readonly productResults: StudioHokusaiProductResultEvidence[];
  readonly productPngDataUrlCount: number;
  readonly productFailures: readonly Readonly<{
    reason: string | null;
    detail: string | null;
    requestId: number | null;
  }>[];
}

export interface StudioHokusaiDefaultShelfIntegrationEvidence {
  readonly brushId: string;
  readonly brushName: string;
  readonly presetId: HokusaiFamilyId;
  readonly blankNativePageElementCount: 0;
  readonly liveReadyCount: number;
  readonly liveWorkerConstructionCount: number;
  readonly liveBeginCount: number;
  readonly liveFrameCount: number;
  readonly liveCompleteCount: number;
  readonly liveFailureCount: number;
  readonly productReadyCount: number;
  readonly productWorkerConstructionCount: number;
  readonly productReadyProtocolValidCount: number;
  readonly productRenderCount: number;
  readonly productResultCount: number;
  readonly productFailureCount: number;
  readonly productPngDataUrlCount: number;
  readonly trustedPointerSampleCount: number;
  readonly vectorElementId: string | null;
  readonly committedElementCount: number;
  readonly visibleVectorCount: number;
  readonly undoLayerCount: number;
  readonly screenshot: string;
}

export interface StudioHokusaiExplicitInspectorIntegrationEvidence {
  readonly mode: "selected-stroke-explicit-conversion";
  readonly presetId: "charcoal";
  readonly materialProfileId: "charcoal";
  readonly blankNativePageElementCount: 0;
  readonly liveReadyCount: number;
  readonly liveWorkerConstructionCount: number;
  readonly liveBeginCount: number;
  readonly liveFrameCount: number;
  readonly liveCompleteCount: number;
  readonly liveFailureCount: number;
  readonly trustedPointerSampleCount: number;
  readonly sourceSelectedBeforeConversion: boolean;
  readonly productReadyCount: number;
  readonly productWorkerConstructionCount: number;
  readonly productReadyProtocolValidCount: number;
  readonly productRenderCount: number;
  readonly productResultCount: number;
  readonly productFailureCount: number;
  readonly productPngDataUrlCount: number;
  readonly productRender: StudioHokusaiProductRenderEvidence | null;
  readonly productReceipt: StudioHokusaiProductResultEvidence | null;
  readonly sourceElementId: string | null;
  readonly convertedImageId: string | null;
  readonly convertedPairElementCount: number;
  readonly hiddenDrawCount: number;
  readonly visibleImageCount: number;
  readonly convertedImageHasPngSource: boolean;
  readonly convertedImageSelected: boolean;
  readonly receiptSourceMatched: boolean;
  readonly receiptPresetMatched: boolean;
  readonly receiptRequestMatched: boolean;
  readonly undoLayerCount: number;
  readonly redoLayerCount: number;
  readonly reloadLayerCount: number;
  readonly sourceRestoredByUndo: boolean;
  readonly pairRestoredByRedo: boolean;
  readonly pairPreservedByReload: boolean;
  readonly redoSourceElementId: string | null;
  readonly redoImageElementId: string | null;
  readonly reloadSourceElementId: string | null;
  readonly reloadImageElementId: string | null;
  readonly screenshotConverted: string;
  readonly screenshotReloaded: string;
}

export interface StudioHokusaiLiveIntegrationResult {
  readonly status: "ok" | "failed";
  readonly schemaVersion: typeof STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION;
  readonly execution: "vite-production-preview-shipped-studio-policy-and-explicit-inspector";
  readonly shelf: StudioHokusaiDefaultShelfIntegrationEvidence[];
  readonly explicitInspector: StudioHokusaiExplicitInspectorIntegrationEvidence | null;
  readonly diagnostics: BrowserDiagnostics;
  readonly issues: string[];
  readonly evidenceDirectory: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function array(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
}

/** Pure policy validation is exported so CI can reject incomplete/mocked browser evidence. */
export function validateStudioHokusaiLiveIntegrationResult(candidate: unknown): string[] {
  const issues: string[] = [];
  if (!record(candidate)) return ["integration result is not an object"];
  if (candidate.status !== "ok") issues.push("integration run did not report ok");
  if (candidate.schemaVersion !== STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION) {
    issues.push("integration report schema version is invalid");
  }
  if (
    candidate.execution
    !== "vite-production-preview-shipped-studio-policy-and-explicit-inspector"
  ) {
    issues.push(
      "integration run did not use the shipped product-policy and explicit-inspector path",
    );
  }

  const shelf = array(candidate.shelf) ? candidate.shelf : [];
  const expectedPresetIds = FAMILY_SCENARIOS.map(({ presetId }) => presetId);
  const actualPresetIds = shelf.flatMap((entry) => (
    record(entry) && string(entry.presetId) ? [entry.presetId] : []
  ));
  if (
    shelf.length !== FAMILY_SCENARIOS.length
    || JSON.stringify(actualPresetIds) !== JSON.stringify(expectedPresetIds)
  ) {
    issues.push("pencil, charcoal, and oil shelf policy was not each exercised exactly once");
  }

  for (const expected of FAMILY_SCENARIOS) {
    const entry = shelf.find((value) => record(value) && value.presetId === expected.presetId);
    if (!record(entry)) continue;
    const prefix = expected.presetId;
    if (entry.brushId !== expected.brushId || entry.brushName !== expected.brushName) {
      issues.push(`${prefix}: the shipped catalogue identity was not selected`);
    }
    if (entry.blankNativePageElementCount !== 0) {
      issues.push(`${prefix}: scenario did not begin on a blank native document`);
    }
    if (
      entry.liveReadyCount !== 0
      || entry.liveWorkerConstructionCount !== 0
      || entry.liveBeginCount !== 0
      || entry.liveFrameCount !== 0
      || entry.liveCompleteCount !== 0
      || entry.liveFailureCount !== 0
      || entry.productReadyCount !== 0
      || entry.productWorkerConstructionCount !== 0
      || entry.productReadyProtocolValidCount !== 0
      || entry.productRenderCount !== 0
      || entry.productResultCount !== 0
      || entry.productFailureCount !== 0
      || entry.productPngDataUrlCount !== 0
    ) {
      issues.push(`${prefix}: blocked normal shelf created Hokusai Worker traffic`);
    }
    if (
      !integer(entry.trustedPointerSampleCount, 2)
      || !string(entry.vectorElementId)
      || entry.committedElementCount !== 1
      || entry.visibleVectorCount !== 1
      || entry.undoLayerCount !== 0
    ) {
      issues.push(`${prefix}: blocked shelf route lost vector input or failed one-step Undo`);
    }
  }

  const inspector = candidate.explicitInspector;
  const receipt = record(inspector) && record(inspector.productReceipt)
    ? inspector.productReceipt
    : null;
  const render = record(inspector) && record(inspector.productRender)
    ? inspector.productRender
    : null;
  if (!record(inspector)) {
    issues.push("the explicit Hokusai inspector conversion scenario is missing");
  } else {
    if (
      inspector.mode !== "selected-stroke-explicit-conversion"
      || inspector.presetId !== "charcoal"
      || inspector.materialProfileId !== "charcoal"
      || inspector.blankNativePageElementCount !== 0
      || !integer(inspector.trustedPointerSampleCount, 2)
      || inspector.sourceSelectedBeforeConversion !== true
    ) {
      issues.push("explicit inspector did not start from one trusted selected vector stroke");
    }
    if (
      inspector.liveReadyCount !== 0
      || inspector.liveWorkerConstructionCount !== 0
      || inspector.liveBeginCount !== 0
      || inspector.liveFrameCount !== 0
      || inspector.liveCompleteCount !== 0
      || inspector.liveFailureCount !== 0
    ) {
      issues.push("explicit settled inspector conversion incorrectly entered Hokusai live");
    }
    if (
      inspector.productWorkerConstructionCount !== 2
      || inspector.productReadyCount !== 2
      || inspector.productReadyProtocolValidCount !== 2
      || inspector.productRenderCount !== 1
      || inspector.productResultCount !== 1
      || inspector.productFailureCount !== 0
      || inspector.productPngDataUrlCount !== 1
      || !render
      || render.version !== 3
      || !integer(render.requestId, 1)
      || render.engineEpoch !== 1
      || render.sourceElementId !== inspector.sourceElementId
      || !string(render.sourceRevision)
      || !SOURCE_REVISION_PATTERN.test(render.sourceRevision)
      || render.presetId !== inspector.presetId
      || render.materialProfileId !== inspector.materialProfileId
      || !integer(
        render.sourcePointCount,
        integer(inspector.trustedPointerSampleCount, 2)
          ? inspector.trustedPointerSampleCount
          : 2,
      )
      || !receipt
      || receipt.version !== 3
      || receipt.requestId !== render.requestId
      || receipt.engineEpoch !== render.engineEpoch
      || receipt.receiptKind !== "studio-hokusai/receipt"
      || receipt.receiptVersion !== 3
      || receipt.receiptRequestId !== render.requestId
      || receipt.receiptEngineEpoch !== render.engineEpoch
      || receipt.sourceElementId !== inspector.sourceElementId
      || receipt.presetId !== inspector.presetId
      || receipt.materialProfileId !== inspector.materialProfileId
      || receipt.complete !== true
      || receipt.adapterVersion !== "0.3.0-packed-dirty-frame-adapter.3-profile-routing"
      || receipt.execution !== "dedicated-worker-wasm-packed-dirty-frame"
      || !string(receipt.inputHash)
      || !HASH_PATTERN.test(receipt.inputHash)
      || !string(receipt.pixelHash)
      || !HASH_PATTERN.test(receipt.pixelHash)
      || !string(receipt.pngHash)
      || !HASH_PATTERN.test(receipt.pngHash)
      || !integer(receipt.pngByteLength, 33)
      || receipt.pngSignatureValid !== true
      || inspector.receiptSourceMatched !== true
      || inspector.receiptPresetMatched !== true
      || inspector.receiptRequestMatched !== true
    ) {
      issues.push("explicit inspector Worker receipt is incomplete or mismatched");
    }
    if (
      !string(inspector.sourceElementId)
      || !string(inspector.convertedImageId)
      || inspector.sourceElementId === inspector.convertedImageId
      || inspector.convertedPairElementCount !== 2
      || inspector.hiddenDrawCount !== 1
      || inspector.visibleImageCount !== 1
      || inspector.convertedImageHasPngSource !== true
      || inspector.convertedImageSelected !== true
    ) {
      issues.push("explicit inspector did not create one hidden source and one visible PNG image");
    }
    if (
      inspector.undoLayerCount !== 1
      || inspector.redoLayerCount !== 2
      || inspector.reloadLayerCount !== 2
      || inspector.sourceRestoredByUndo !== true
      || inspector.pairRestoredByRedo !== true
      || inspector.pairPreservedByReload !== true
      || inspector.redoSourceElementId !== inspector.sourceElementId
      || inspector.redoImageElementId !== inspector.convertedImageId
      || inspector.reloadSourceElementId !== inspector.sourceElementId
      || inspector.reloadImageElementId !== inspector.convertedImageId
    ) {
      issues.push("explicit inspector pair identity failed one-step Undo/Redo or durable reload");
    }
  }

  const diagnostics = candidate.diagnostics;
  if (!record(diagnostics)) {
    issues.push("browser diagnostics are missing");
  } else {
    for (const key of [
      "consoleErrors",
      "consoleWarnings",
      "pageErrors",
      "requestFailures",
      "fiveHundredResponses",
    ] as const) {
      if (!array(diagnostics[key]) || diagnostics[key].length !== 0) {
        issues.push(`browser diagnostics contain ${key}`);
      }
    }
  }
  return issues;
}

function expectedStaticPreviewDiagnostic(message: string, studioUrl: string): boolean {
  if (OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path))) return true;
  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:"
    || previewUrl.hostname !== "127.0.0.1"
    || previewUrl.port.length === 0
  ) return false;
  const sourceSeparator = message.lastIndexOf(" @ ");
  if (sourceSeparator > 0) {
    const diagnostic = message.slice(0, sourceSeparator);
    const source = message.slice(sourceSeparator + 3);
    try {
      const sourceUrl = new URL(source);
      const expectedHeadlessGraphicsDiagnostic = diagnostic === "No available adapters."
        || /^\[\.WebGL-0x[\da-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels$/iu.test(
          diagnostic,
        );
      if (
        expectedHeadlessGraphicsDiagnostic
        && sourceUrl.origin === previewUrl.origin
        && (sourceUrl.pathname === "/studio"
          || /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname))
        && sourceUrl.search === ""
        && sourceUrl.hash === ""
      ) return true;
    } catch {
      // Continue to the strict static-preview WebSocket allowlist below.
    }
  }
  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessages = [
    `WebSocket connection to '${socketUrl}' failed: Connection closed before receiving a handshake response`,
    `WebSocket connection to '${socketUrl}' failed: Error during WebSocket handshake: Unexpected response code: 400`,
  ];
  if (expectedMessages.includes(message)) return true;
  const sourcePrefix = expectedMessages
    .map((expectedMessage) => `${expectedMessage} @ `)
    .find((prefix) => message.startsWith(prefix));
  if (!sourcePrefix) return false;
  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname)
      && sourceUrl.search === ""
      && sourceUrl.hash === "";
  } catch {
    return false;
  }
}

function collectBrowserDiagnostics(
  page: Page,
  label: string,
  studioUrl: string,
): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    fiveHundredResponses: [],
  };
  page.on("console", (entry) => {
    if (entry.type() !== "error" && entry.type() !== "warning") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (expectedStaticPreviewDiagnostic(message, studioUrl)) return;
    const target = entry.type() === "error"
      ? diagnostics.consoleErrors
      : diagnostics.consoleWarnings;
    target.push(`${label}: ${message}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(`${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`;
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) {
      diagnostics.requestFailures.push(`${label}: ${message}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) {
      diagnostics.fiveHundredResponses.push(`${label}: ${message}`);
    }
  });
  return diagnostics;
}

function mergeDiagnostics(target: BrowserDiagnostics, source: BrowserDiagnostics): void {
  target.consoleErrors.push(...source.consoleErrors);
  target.consoleWarnings.push(...source.consoleWarnings);
  target.pageErrors.push(...source.pageErrors);
  target.requestFailures.push(...source.requestFailures);
  target.fiveHundredResponses.push(...source.fiveHundredResponses);
}

async function installInstrumentedCleanStudioState(page: Page): Promise<void> {
  const monitorBootstrap = (input: Readonly<{
    appSettingsKey: string;
    autosavePrefix: string;
    cleanSessionKey: string;
    mobileHintKey: string;
    quickstartKey: string;
  }>) => {
    const {
      appSettingsKey,
      autosavePrefix,
      cleanSessionKey,
      mobileHintKey,
      quickstartKey,
    } = input;
    type MutableMonitor = {
      liveWorkerConstructionCount: number;
      productWorkerConstructionCount: number;
      readyCount: number;
      begins: Array<Record<string, unknown>>;
      frames: Array<Record<string, unknown>>;
      completes: Array<Record<string, unknown>>;
      failures: Array<Record<string, unknown>>;
      productReadyCount: number;
      productReadyProtocolValidCount: number;
      productRenders: Array<Record<string, unknown>>;
      productResults: Array<Record<string, unknown>>;
      productPngDataUrlCount: number;
      productFailures: Array<Record<string, unknown>>;
      pointerContacts: Array<{
        pointerId: number;
        pointerType: string;
        down: readonly [number, number];
        moves: Array<readonly [number, number]>;
        up: readonly [number, number] | null;
      }>;
    };
    const scope = globalThis as typeof globalThis & {
      __studioHokusaiLiveIntegrationMonitor?: MutableMonitor;
    };
    const monitor: MutableMonitor = {
      liveWorkerConstructionCount: 0,
      productWorkerConstructionCount: 0,
      readyCount: 0,
      begins: [],
      frames: [],
      completes: [],
      failures: [],
      productReadyCount: 0,
      productReadyProtocolValidCount: 0,
      productRenders: [],
      productResults: [],
      productPngDataUrlCount: 0,
      productFailures: [],
      pointerContacts: [],
    };
    scope.__studioHokusaiLiveIntegrationMonitor = monitor;

    const nativeReadAsDataUrl = globalThis.FileReader?.prototype.readAsDataURL;
    if (typeof nativeReadAsDataUrl === "function") {
      Object.defineProperty(globalThis.FileReader.prototype, "readAsDataURL", {
        configurable: true,
        writable: true,
        value(this: FileReader, blob: Blob): void {
          if (blob.type === "image/png") {
            this.addEventListener("load", () => {
              if (
                typeof this.result === "string"
                && this.result.startsWith("data:image/png;base64,")
              ) monitor.productPngDataUrlCount += 1;
            }, { once: true });
          }
          nativeReadAsDataUrl.call(this, blob);
        },
      });
    }

    try {
      window.localStorage.setItem(quickstartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
      let settings: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(window.localStorage.getItem(appSettingsKey) ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) settings = parsed;
      } catch {
        // Replace malformed QA-only settings with the minimal deterministic preference below.
      }
      const general = settings.general && typeof settings.general === "object"
        && !Array.isArray(settings.general)
        ? settings.general as Record<string, unknown>
        : {};
      window.localStorage.setItem(appSettingsKey, JSON.stringify({
        ...settings,
        general: { ...general, brushCursorStyle: "none" },
      }));
      if (window.sessionStorage.getItem(cleanSessionKey) !== "1") {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith(autosavePrefix)) window.localStorage.removeItem(key);
        }
        window.sessionStorage.setItem(cleanSessionKey, "1");
      }
    } catch {
      // Visible DOM, Worker, and layer assertions remain strict when storage is unavailable.
    }

    const nativeWorker = globalThis.Worker;
    if (typeof nativeWorker === "function") {
      const instrumentedWorker = new Proxy(nativeWorker, {
        construct(target, argumentsList) {
          const options = argumentsList[1] && typeof argumentsList[1] === "object"
            ? argumentsList[1] as Record<string, unknown>
            : {};
          if (options.name === "studio-hokusai-live-brush") {
            monitor.liveWorkerConstructionCount += 1;
          } else if (options.name === "studio-hokusai-natural-media") {
            monitor.productWorkerConstructionCount += 1;
          }
          const worker = Reflect.construct(target, argumentsList, target) as Worker;
          const mutableWorker = worker as unknown as {
            postMessage(message: unknown, transferOrOptions?: unknown): void;
          };
          const nativePostMessage = mutableWorker.postMessage.bind(worker);
          mutableWorker.postMessage = (message: unknown, transferOrOptions?: unknown): void => {
            if (message && typeof message === "object" && !Array.isArray(message)) {
              const value = message as Record<string, unknown>;
              if (value.type === "studio-hokusai-live/begin") {
                monitor.begins.push({
                  strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
                });
              } else if (value.type === "studio-hokusai/render") {
                const plan = value.plan && typeof value.plan === "object"
                  ? value.plan as Record<string, unknown>
                  : {};
                const source = plan.source && typeof plan.source === "object"
                  ? plan.source as Record<string, unknown>
                  : {};
                monitor.productRenders.push({
                  version: typeof value.version === "number" ? value.version : null,
                  requestId: typeof value.requestId === "number" ? value.requestId : null,
                  engineEpoch: typeof value.engineEpoch === "number" ? value.engineEpoch : null,
                  sourceElementId: typeof source.elementId === "string" ? source.elementId : null,
                  sourceRevision: typeof source.revision === "string" ? source.revision : null,
                  presetId: typeof plan.presetId === "string" ? plan.presetId : null,
                  materialProfileId: typeof plan.materialProfileId === "string"
                    ? plan.materialProfileId
                    : null,
                  sourcePointCount: typeof source.sourcePointCount === "number"
                    ? source.sourcePointCount
                    : null,
                });
              }
            }
            if (transferOrOptions === undefined) nativePostMessage(message);
            else nativePostMessage(message, transferOrOptions);
          };
          worker.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
            const value = event.data as Record<string, unknown>;
            if (value.type === "studio-hokusai/ready") {
              monitor.productReadyCount += 1;
              const runtime = value.runtime && typeof value.runtime === "object"
                ? value.runtime as Record<string, unknown>
                : {};
              if (
                value.version === 3
                && runtime.engine === "reearth-hokusai"
                && runtime.version === "0.3.0"
                && runtime.adapterVersion
                  === "0.3.0-packed-dirty-frame-adapter.3-profile-routing"
                && runtime.wasm === true
                && runtime.dedicatedWorker === true
                && runtime.transparentRgba === true
                && runtime.dirtyTiles === true
                && runtime.packedDirtyFrame === true
                && runtime.mainThreadFallback === false
              ) monitor.productReadyProtocolValidCount += 1;
              return;
            }
            if (value.type === "studio-hokusai/result") {
              const receipt = value.receipt && typeof value.receipt === "object"
                ? value.receipt as Record<string, unknown>
                : {};
              const pngBytes = value.pngBytes instanceof ArrayBuffer
                ? new Uint8Array(value.pngBytes)
                : new Uint8Array();
              monitor.productResults.push({
                version: typeof value.version === "number" ? value.version : null,
                requestId: typeof value.requestId === "number" ? value.requestId : null,
                engineEpoch: typeof value.engineEpoch === "number" ? value.engineEpoch : null,
                receiptKind: typeof receipt.kind === "string" ? receipt.kind : null,
                receiptVersion: typeof receipt.version === "number" ? receipt.version : null,
                receiptRequestId: typeof receipt.requestId === "number"
                  ? receipt.requestId
                  : null,
                receiptEngineEpoch: typeof receipt.engineEpoch === "number"
                  ? receipt.engineEpoch
                  : null,
                sourceElementId: typeof receipt.sourceElementId === "string"
                  ? receipt.sourceElementId
                  : null,
                presetId: typeof receipt.presetId === "string" ? receipt.presetId : null,
                materialProfileId: typeof receipt.materialProfileId === "string"
                  ? receipt.materialProfileId
                  : null,
                inputHash: typeof receipt.inputHash === "string" ? receipt.inputHash : null,
                pixelHash: typeof receipt.pixelHash === "string" ? receipt.pixelHash : null,
                pngHash: typeof receipt.pngHash === "string" ? receipt.pngHash : null,
                adapterVersion: typeof receipt.adapterVersion === "string"
                  ? receipt.adapterVersion
                  : null,
                execution: typeof receipt.execution === "string" ? receipt.execution : null,
                pngByteLength: pngBytes.byteLength,
                pngSignatureValid: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
                  .every((byte, index) => pngBytes[index] === byte),
                complete: receipt.complete === true,
              });
              return;
            }
            if (value.type === "studio-hokusai/failure") {
              monitor.productFailures.push({
                reason: typeof value.reason === "string" ? value.reason : null,
                detail: typeof value.detail === "string" ? value.detail : null,
                requestId: typeof value.requestId === "number" ? value.requestId : null,
              });
              return;
            }
            if (value.type === "studio-hokusai-live/ready") {
              monitor.readyCount += 1;
              return;
            }
            if (value.type === "studio-hokusai-live/frame") {
              monitor.frames.push({
                strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
              });
              return;
            }
            if (value.type === "studio-hokusai-live/complete") {
              monitor.completes.push({
                strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
              });
              return;
            }
            if (value.type === "studio-hokusai-live/failure") {
              monitor.failures.push({
                reason: typeof value.reason === "string" ? value.reason : null,
                detail: typeof value.detail === "string" ? value.detail : null,
                strokeId: typeof value.strokeId === "string" ? value.strokeId : null,
              });
            }
          });
          return worker;
        },
      });
      Object.defineProperty(globalThis, "Worker", {
        configurable: true,
        writable: true,
        value: instrumentedWorker,
      });
    }

    let activeContact: MutableMonitor["pointerContacts"][number] | null = null;
    globalThis.addEventListener("pointerdown", (event) => {
      if (
        !(event instanceof PointerEvent)
        || event.button !== 0
        || !event.composedPath().some((target) => (
          target instanceof Element && target.classList.contains("konvajs-content")
        ))
      ) return;
      activeContact = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        down: [event.clientX, event.clientY],
        moves: [],
        up: null,
      };
      monitor.pointerContacts.push(activeContact);
    }, true);
    globalThis.addEventListener("pointermove", (event) => {
      if (!(event instanceof PointerEvent) || activeContact?.pointerId !== event.pointerId) return;
      activeContact.moves.push([event.clientX, event.clientY]);
    }, true);
    globalThis.addEventListener("pointerup", (event) => {
      if (!(event instanceof PointerEvent) || activeContact?.pointerId !== event.pointerId) return;
      activeContact.up = [event.clientX, event.clientY];
      activeContact = null;
    }, true);
    globalThis.addEventListener("pointercancel", (event) => {
      if (!(event instanceof PointerEvent) || activeContact?.pointerId !== event.pointerId) return;
      activeContact.up = [event.clientX, event.clientY];
      activeContact = null;
    }, true);
  };
  const input = {
    appSettingsKey: APP_SETTINGS_KEY,
    autosavePrefix: AUTOSAVE_PREFIX,
    cleanSessionKey: CLEAN_SESSION_KEY,
    mobileHintKey: MOBILE_HINT_KEY,
    quickstartKey: QUICKSTART_KEY,
  };
  // tsx preserves nested function names with an esbuild `__name` helper. Playwright serializes
  // only the callback body, so install a local no-op helper with the monitor bootstrap itself.
  await page.addInitScript({
    content: [
      "var __name = function(target) { return target; };",
      `(${monitorBootstrap.toString()})(${JSON.stringify(input)});`,
    ].join("\n"),
  });
}

async function readBrowserMonitor(page: Page): Promise<BrowserMonitorSnapshot> {
  return page.evaluate(() => {
    const monitor = (globalThis as typeof globalThis & {
      __studioHokusaiLiveIntegrationMonitor?: BrowserMonitorSnapshot;
    }).__studioHokusaiLiveIntegrationMonitor;
    if (!monitor) throw new Error("Hokusai integration monitor is unavailable");
    return structuredClone(monitor);
  });
}

async function readLayerRows(page: Page): Promise<StudioLayerRowEvidence[]> {
  return page.locator('[data-studio-layer-row="true"]').evaluateAll((rows) => rows.map((row) => {
    const visibility = row.querySelector<HTMLElement>(
      '[data-studio-layer-row-action="visibility"]',
    );
    const visibilityLabel = visibility?.getAttribute("aria-label") ?? "";
    const selectionState = row.getAttribute("data-studio-layer-selection-state");
    return {
      id: row.id.startsWith("studio-layer-")
        ? row.id.slice("studio-layer-".length)
        : "",
      semanticKind: row.querySelector<HTMLElement>("[data-studio-layer-kind-badge]")
        ?.getAttribute("data-studio-layer-kind-badge") ?? null,
      hidden: visibilityLabel.endsWith(" 표시"),
      selected: row.getAttribute("data-studio-layer-selected") === "true"
        || selectionState === "current"
        || selectionState === "selected",
      accessibleLabel: row.getAttribute("aria-label") ?? "",
    };
  }));
}

function explicitInspectorPair(
  rows: readonly StudioLayerRowEvidence[],
  sourceElementId: string,
  expectedImageId?: string,
): Readonly<{
  source: StudioLayerRowEvidence;
  image: StudioLayerRowEvidence;
}> | null {
  const source = rows.find(({ id }) => id === sourceElementId);
  const images = rows.filter(({ semanticKind, hidden }) => semanticKind === "raster" && !hidden);
  if (!source || source.semanticKind !== "vector" || !source.hidden) return null;
  if (images.length !== 1) return null;
  const image = images[0]!;
  if (expectedImageId !== undefined && image.id !== expectedImageId) return null;
  if (!image.accessibleLabel.includes("Hokusai")) return null;
  return { source, image };
}

async function waitForLayerRows(
  page: Page,
  predicate: (rows: readonly StudioLayerRowEvidence[]) => boolean,
  message: string,
  timeoutMilliseconds = 12_000,
): Promise<StudioLayerRowEvidence[]> {
  const deadline = Date.now() + timeoutMilliseconds;
  let rows = await readLayerRows(page);
  while (!predicate(rows) && Date.now() < deadline) {
    await page.waitForTimeout(100);
    rows = await readLayerRows(page);
  }
  invariant(predicate(rows), message);
  return rows;
}

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(10_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.locator(".konvajs-content").first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickstart.isVisible({ timeout: 250 }).catch(() => false)) {
    await quickstart.locator('[data-studio-quickstart-dismiss="true"]').click();
  }
}

async function activatePen(page: Page): Promise<void> {
  await page.keyboard.press("b");
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 8_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  await toolbar.locator('[data-studio-brush-active-pill="true"]').waitFor({ state: "visible" });
}

async function selectBrush(
  page: Page,
  brush: Readonly<{ brushId: string; brushName: string }>,
): Promise<void> {
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.locator('[data-studio-brush-active-pill="true"]').click();
  const catalogue = page.locator('[data-studio-brush-catalog-session="true"]');
  await catalogue.waitFor({ state: "visible" });
  await catalogue.getByRole("searchbox", { name: "전체 브러시 검색" }).fill(brush.brushId);
  await catalogue.getByRole("button", {
    name: `${brush.brushName} 선택`,
    exact: true,
  }).click();
  await catalogue.waitFor({ state: "detached" });
  await page.waitForFunction(({ expectedName }) => (
    document.querySelector('[data-studio-brush-active-pill="true"]')
      ?.getAttribute("aria-label")
      ?.includes(expectedName) === true
  ), { expectedName: brush.brushName });
}

async function openLayerNavigator(page: Page): Promise<void> {
  const navigator = page.getByTestId("studio-inspector-navigator");
  await navigator.waitFor({ state: "visible" });
  const layers = navigator.locator('[data-studio-inspector-primary-tab="layers"]');
  if (await layers.getAttribute("aria-selected") !== "true") await layers.click();
}

async function waitForLayerCount(page: Page, expected: number): Promise<number> {
  await page.waitForFunction((count) => (
    document.querySelectorAll('[data-studio-layer-row="true"]').length === count
  ), expected, { timeout: 10_000 });
  return page.locator('[data-studio-layer-row="true"]').count();
}

interface ScreenPoint { readonly x: number; readonly y: number }

async function directPointerRoute(page: Page): Promise<readonly ScreenPoint[]> {
  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  const viewport = page.viewportSize();
  invariant(box && viewport, "Studio canvas bounds are unavailable");
  const left = Math.max(box.x + 110, viewport.width * 0.34);
  const right = Math.min(box.x + box.width - 110, viewport.width * 0.68);
  const centerY = Math.max(box.y + 190, viewport.height * 0.43);
  invariant(right - left >= 320, "Studio canvas is too narrow for Hokusai integration input");
  const points = Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16;
    return {
      x: left + (right - left) * progress,
      y: centerY + Math.sin(progress * Math.PI * 2.2) * 54,
    };
  });
  const misses = await page.evaluate((route) => route.flatMap((point) => (
    document.elementFromPoint(point.x, point.y)?.closest(".konvajs-content")
      ? []
      : [point]
  )), points);
  invariant(misses.length === 0, `Hokusai pointer route is covered by editor chrome: ${JSON.stringify(misses)}`);
  return points;
}

async function drawDirectPointerRoute(
  page: Page,
  points: readonly ScreenPoint[],
  options: Readonly<{ waitForLiveFrame: boolean; liveScreenshot?: string }>,
): Promise<void> {
  const initialMonitor = await readBrowserMonitor(page);
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  let released = false;
  try {
    for (const point of points.slice(1)) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(7);
    }
    if (options.waitForLiveFrame) {
      await page.waitForFunction((initialFrameCount) => {
        const monitor = (globalThis as typeof globalThis & {
          __studioHokusaiLiveIntegrationMonitor?: BrowserMonitorSnapshot;
        }).__studioHokusaiLiveIntegrationMonitor;
        return Boolean(monitor && monitor.frames.length > initialFrameCount);
      }, initialMonitor.frames.length, { timeout: 12_000 });
      if (options.liveScreenshot) {
        await page.screenshot({ path: options.liveScreenshot, animations: "disabled" });
      }
    }
    await page.mouse.up();
    released = true;
  } finally {
    if (!released) await page.mouse.up().catch(() => undefined);
  }
  await page.mouse.move(4, 4);
}

function pointerSampleCount(contact: TrustedPointerContactEvidence | undefined): number {
  return contact ? 1 + contact.moves.length : 0;
}

async function restoreAutosaveAfterReload(page: Page): Promise<void> {
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 15_000 });
  const banner = page.getByText(
    "이전에 작성 중이던 임시저장 데이터가 있습니다.",
    { exact: false },
  );
  await banner.waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: "복구하기", exact: true }).click();
  await banner.waitFor({ state: "detached", timeout: 10_000 });
}

async function runDefaultShelfScenario(
  browser: Browser,
  studioUrl: string,
  scenario: (typeof FAMILY_SCENARIOS)[number],
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioHokusaiDefaultShelfIntegrationEvidence> {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 1_000 } });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, scenario.presetId, studioUrl);
  const screenshot = join(SCRATCH, `${scenario.presetId}-blocked-shelf-vector.png`);
  try {
    await installInstrumentedCleanStudioState(page);
    await prepareStudio(page, studioUrl);
    await activatePen(page);
    await selectBrush(page, scenario);
    await openLayerNavigator(page);
    const blankNativePageElementCount = await waitForLayerCount(page, 0);
    const route = await directPointerRoute(page);
    await drawDirectPointerRoute(page, route, { waitForLiveFrame: false });
    await waitForLayerCount(page, 1);
    const committed = await waitForLayerRows(
      page,
      (rows) => rows.length === 1
        && rows[0]?.semanticKind === "vector"
        && rows[0]?.hidden === false,
      `${scenario.presetId}: blocked shelf route did not commit one visible vector layer`,
    );
    const monitor = await readBrowserMonitor(page);
    const contact = monitor.pointerContacts[0];
    const trustedPointerSampleCount = pointerSampleCount(contact);
    const vector = committed[0]!;
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await page.keyboard.press("Meta+z");
    const undoLayerCount = await waitForLayerCount(page, 0);
    return {
      brushId: scenario.brushId,
      brushName: scenario.brushName,
      presetId: scenario.presetId,
      blankNativePageElementCount: blankNativePageElementCount as 0,
      liveReadyCount: monitor.readyCount,
      liveWorkerConstructionCount: monitor.liveWorkerConstructionCount,
      liveBeginCount: monitor.begins.length,
      liveFrameCount: monitor.frames.length,
      liveCompleteCount: monitor.completes.length,
      liveFailureCount: monitor.failures.length,
      productReadyCount: monitor.productReadyCount,
      productWorkerConstructionCount: monitor.productWorkerConstructionCount,
      productReadyProtocolValidCount: monitor.productReadyProtocolValidCount,
      productRenderCount: monitor.productRenders.length,
      productResultCount: monitor.productResults.length,
      productFailureCount: monitor.productFailures.length,
      productPngDataUrlCount: monitor.productPngDataUrlCount,
      trustedPointerSampleCount,
      vectorElementId: vector.id,
      committedElementCount: committed.length,
      visibleVectorCount: committed.filter(({ semanticKind, hidden }) => (
        semanticKind === "vector" && !hidden
      )).length,
      undoLayerCount,
      screenshot,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

async function runExplicitInspectorScenario(
  browser: Browser,
  studioUrl: string,
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioHokusaiExplicitInspectorIntegrationEvidence> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1_440, height: 1_000 },
  });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, "explicit-inspector", studioUrl);
  const screenshotSelected = join(SCRATCH, "explicit-inspector-00-selected.png");
  const screenshotConverted = join(SCRATCH, "explicit-inspector-01-converted.png");
  const screenshotReloaded = join(SCRATCH, "explicit-inspector-02-reloaded.png");
  try {
    await installInstrumentedCleanStudioState(page);
    await prepareStudio(page, studioUrl);
    await activatePen(page);
    await selectBrush(page, FAMILY_SCENARIOS[0]);
    await openLayerNavigator(page);
    const blankNativePageElementCount = await waitForLayerCount(page, 0);
    const route = await directPointerRoute(page);
    await drawDirectPointerRoute(page, route, { waitForLiveFrame: false });
    await waitForLayerCount(page, 1);
    const sourceRows = await waitForLayerRows(
      page,
      (rows) => rows.length === 1
        && rows[0]?.semanticKind === "vector"
        && rows[0]?.hidden === false,
      "explicit inspector source did not commit one visible vector layer",
    );
    const source = sourceRows[0]!;
    const sourceElementId = source.id;
    // Leave draw-mode tool settings before selecting the authored stroke so
    // the shipped properties inspector renders the selected freehand path
    // controls (including the explicit Hokusai conversion section).
    const selectTool = page.locator('[data-studio-rail-tool-id="select"]').first();
    await selectTool.click();
    await page.waitForFunction(() => (
      document.querySelector('[data-studio-rail-tool-id="select"]')
        ?.getAttribute("aria-pressed") === "true"
    ));
    await page.locator(
      '[data-studio-rail-tool-id="select"][aria-pressed="true"]',
    ).first().waitFor({ state: "attached", timeout: 8_000 });
    const layerRow = page.locator('[data-studio-layer-row="true"]').first();
    // Clicking the row's geometric centre can land on an inline opacity or
    // visibility control, which intentionally stops row selection. The
    // selection marker is the shipped non-control target for primary/current
    // selection and bubbles through the same row handler as a user click.
    await layerRow.locator('[data-studio-layer-selection-marker]').click();
    const selectedSourceRows = await waitForLayerRows(
      page,
      (rows) => rows.some(({ id, selected }) => id === sourceElementId && selected),
      "explicit inspector source layer was not selected",
    );
    const navigator = page.getByTestId("studio-inspector-navigator");
    const properties = navigator.locator(
      '[data-studio-inspector-primary-tab="properties"]',
    );
    await properties.click();
    await page.screenshot({ path: screenshotSelected, animations: "disabled" });
    const inspectorRoute = await page.evaluate(() => {
      const selectionContext = document.querySelector<HTMLElement>(
        '[data-testid="studio-inspector-context-selection"]',
      );
      const activeSelectionTool = document.querySelector<HTMLElement>(
        '[data-studio-rail-tool-id="select"][aria-pressed="true"]',
      );
      return {
        activeSelectionTool: activeSelectionTool !== null,
        selectionContextPresent: selectionContext !== null,
        selectionContextHidden: selectionContext?.hidden ?? null,
        selectedLayerStates: Array.from(
          document.querySelectorAll<HTMLElement>('[data-studio-layer-row="true"]'),
        ).map((row) => ({
          id: row.id,
          selected: row.getAttribute("data-studio-layer-selected"),
          selectionState: row.getAttribute("data-studio-layer-selection-state"),
        })),
      };
    });
    log(`explicit inspector route: ${JSON.stringify(inspectorRoute)}`);
    // The selection inspector is a long, content-visibility-managed scroll
    // surface. Move through the shipped aside so the freehand leaf mounts;
    // querying an offscreen lazy section alone does not activate it.
    await page.locator('[data-studio-sheet-id="props"]').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    // Freehand controls live inside the shipped, collapsed-by-default shape-style disclosure.
    // Open that surface first. The drawing-tool inspector also keeps a hidden Hokusai duplicate,
    // so scope every following interaction to this selected-element section.
    const shapeStyleSection = page.getByTestId("studio-inspector-context-selection").locator(
      '[data-inspector-section="element.shape-style"]',
    );
    const shapeStyleDisclosure = shapeStyleSection.getByRole("button", {
      name: "도형 스타일",
      exact: true,
    });
    if (await shapeStyleDisclosure.getAttribute("aria-expanded") !== "true") {
      await shapeStyleDisclosure.click();
    }
    const inspector = shapeStyleSection.locator(
      '[data-studio-hokusai-natural-media="true"]',
    ).first();
    await inspector.scrollIntoViewIfNeeded();
    await inspector.waitFor({ state: "attached", timeout: 15_000 });
    await inspector.scrollIntoViewIfNeeded();
    await inspector.waitFor({ state: "visible", timeout: 15_000 });
    await inspector.locator("summary").click();
    await inspector.getByText("사용 가능", { exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await inspector.locator(
      'label:has(input[name="studio-hokusai-preset"][value="charcoal"])',
    ).click();
    await inspector.getByRole("button", {
      name: "선택 획을 자연매체로 변환",
      exact: true,
    }).click();
    // Successful conversion selects the new raster immediately, which unmounts the selected-Draw
    // inspector. Observe the Worker outcome independently, then prove the product commit in Layers.
    await page.waitForFunction(() => {
      const monitor = (globalThis as typeof globalThis & {
        __studioHokusaiLiveIntegrationMonitor?: BrowserMonitorSnapshot;
      }).__studioHokusaiLiveIntegrationMonitor;
      return Boolean(
        monitor
        && monitor.productResults.length + monitor.productFailures.length >= 1,
      );
    }, undefined, { timeout: 60_000 });
    await openLayerNavigator(page);
    const converted = await waitForLayerRows(
      page,
      (rows) => rows.length === 2 && explicitInspectorPair(rows, sourceElementId) !== null,
      "explicit inspector did not commit the hidden-source/image pair",
    );
    const pair = explicitInspectorPair(converted, sourceElementId);
    invariant(pair, "explicit inspector pair is missing");
    await page.screenshot({ path: screenshotConverted, animations: "disabled" });
    const monitor = await readBrowserMonitor(page);
    const contact = monitor.pointerContacts[0];
    const productRender = monitor.productRenders[0] ?? null;
    const productReceipt = monitor.productResults[0] ?? null;

    await page.keyboard.press("Meta+z");
    const undone = await waitForLayerRows(
      page,
      (rows) => rows.length === 1
        && rows[0]?.id === sourceElementId
        && rows[0]?.semanticKind === "vector"
        && rows[0]?.hidden === false,
      "Undo did not restore the explicit inspector source vector",
    );
    await page.keyboard.press("Meta+Shift+z");
    const redone = await waitForLayerRows(
      page,
      (rows) => rows.length === 2
        && explicitInspectorPair(rows, sourceElementId, pair.image.id) !== null,
      "Redo did not restore the explicit inspector pair",
    );
    const redonePair = explicitInspectorPair(redone, sourceElementId, pair.image.id);
    invariant(redonePair, "Redo pair is missing");

    // Studio's durable OPFS/SQLite autosave starts after a 1.5-second debounce. Let that write
    // settle before reload; the recovery banner plus exact restored IDs below is the durable proof.
    await page.waitForTimeout(3_500);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await restoreAutosaveAfterReload(page);
    await openLayerNavigator(page);
    const reloaded = await waitForLayerRows(
      page,
      (rows) => rows.length === 2
        && explicitInspectorPair(rows, sourceElementId, pair.image.id) !== null,
      "reload did not preserve the explicit inspector pair",
    );
    const reloadedPair = explicitInspectorPair(reloaded, sourceElementId, pair.image.id);
    invariant(reloadedPair, "reload did not preserve the explicit inspector pair");
    await page.screenshot({ path: screenshotReloaded, animations: "disabled" });
    return {
      mode: "selected-stroke-explicit-conversion",
      presetId: "charcoal",
      materialProfileId: "charcoal",
      blankNativePageElementCount: blankNativePageElementCount as 0,
      liveReadyCount: monitor.readyCount,
      liveWorkerConstructionCount: monitor.liveWorkerConstructionCount,
      liveBeginCount: monitor.begins.length,
      liveFrameCount: monitor.frames.length,
      liveCompleteCount: monitor.completes.length,
      liveFailureCount: monitor.failures.length,
      trustedPointerSampleCount: pointerSampleCount(contact),
      sourceSelectedBeforeConversion: selectedSourceRows.some(
        ({ id, selected }) => id === sourceElementId && selected,
      ),
      productReadyCount: monitor.productReadyCount,
      productWorkerConstructionCount: monitor.productWorkerConstructionCount,
      productReadyProtocolValidCount: monitor.productReadyProtocolValidCount,
      productRenderCount: monitor.productRenders.length,
      productResultCount: monitor.productResults.length,
      productFailureCount: monitor.productFailures.length,
      productPngDataUrlCount: monitor.productPngDataUrlCount,
      productRender,
      productReceipt,
      sourceElementId,
      convertedImageId: pair.image.id,
      convertedPairElementCount: converted.length,
      hiddenDrawCount: converted.filter(({ semanticKind, hidden }) => (
        semanticKind === "vector" && hidden
      )).length,
      visibleImageCount: converted.filter(({ semanticKind, hidden }) => (
        semanticKind === "raster" && !hidden
      )).length,
      convertedImageHasPngSource: monitor.productPngDataUrlCount === 1
        && productReceipt?.pngSignatureValid === true,
      convertedImageSelected: pair.image.selected,
      receiptSourceMatched: productReceipt?.sourceElementId === sourceElementId,
      receiptPresetMatched: productReceipt?.presetId === "charcoal"
        && productReceipt.materialProfileId === "charcoal",
      receiptRequestMatched: productReceipt?.requestId === productRender?.requestId
        && productReceipt?.engineEpoch === productRender?.engineEpoch
        && productReceipt?.receiptRequestId === productRender?.requestId
        && productReceipt?.receiptEngineEpoch === productRender?.engineEpoch,
      undoLayerCount: undone.length,
      redoLayerCount: redone.length,
      reloadLayerCount: reloaded.length,
      sourceRestoredByUndo: undone[0]?.id === sourceElementId && !undone[0]?.hidden,
      pairRestoredByRedo: redonePair.image.id === pair.image.id,
      pairPreservedByReload: reloadedPair.image.id === pair.image.id,
      redoSourceElementId: redonePair.source.id,
      redoImageElementId: redonePair.image.id,
      reloadSourceElementId: reloadedPair.source.id,
      reloadImageElementId: reloadedPair.image.id,
      screenshotConverted,
      screenshotReloaded,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

function prepareScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const name of readdirSync(SCRATCH)) {
    if (!/^(?:pencil|charcoal|oil|explicit-inspector|studio-hokusai-live-integration).*(?:\.png|\.json|\.log)$/u.test(name)) {
      continue;
    }
    try {
      unlinkSync(join(SCRATCH, name));
    } catch {
      // A previous screenshot may be open; stable new artifacts still fail loudly on write.
    }
  }
}

async function main(): Promise<void> {
  prepareScratch();
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  const port = externalOrigin
    ? null
    : await findFreePort({ unavailableMessage: "could not allocate a production-preview port" });
  const origin = externalOrigin
    ? `${externalOrigin.replace(/\/+$/u, "")}/`
    : `http://127.0.0.1:${port}/`;
  const studioUrl = `${origin}studio`;
  const preview: ChildProcess | null = externalOrigin
    ? null
    : spawn(
        process.execPath,
        [
          join(process.cwd(), "node_modules", "vite", "bin", "vite.js"),
          "preview",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
  preview?.stdout?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  preview?.stderr?.on("data", (chunk) => appendFileSync(LOG_PATH, String(chunk)));
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    fiveHundredResponses: [],
  };
  let browser: Browser | null = null;
  try {
    await waitForServer(origin, {
      notReadyMessage: `production preview did not become ready: ${origin}`,
    });
    log(`production preview ready @ ${studioUrl}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const shelf: StudioHokusaiDefaultShelfIntegrationEvidence[] = [];
    for (const scenario of FAMILY_SCENARIOS) {
      log(`${scenario.presetId}: blocked-shelf direct-pointer scenario starting`);
      shelf.push(await runDefaultShelfScenario(browser, studioUrl, scenario, diagnostics));
      log(`${scenario.presetId}: exact vector fallback and zero Hokusai live traffic observed`);
    }
    log("explicit inspector: selected-stroke conversion scenario starting");
    const explicitInspector = await runExplicitInspectorScenario(
      browser,
      studioUrl,
      diagnostics,
    );
    log("explicit inspector: Worker receipt, pair, Undo/Redo, and reload observed");
    const candidate = {
      status: "ok",
      schemaVersion: STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
      execution: "vite-production-preview-shipped-studio-policy-and-explicit-inspector",
      shelf,
      explicitInspector,
      diagnostics,
      issues: [],
      evidenceDirectory: SCRATCH,
    } as const satisfies StudioHokusaiLiveIntegrationResult;
    const issues = validateStudioHokusaiLiveIntegrationResult(candidate);
    const result: StudioHokusaiLiveIntegrationResult = {
      ...candidate,
      status: issues.length === 0 ? "ok" : "failed",
      issues,
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (issues.length > 0) process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    if (preview) await stopChildProcess(preview).catch(() => undefined);
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (executedPath === import.meta.url) {
  void main().catch((cause) => {
    const failure = {
      status: "error",
      message: cause instanceof Error ? cause.message : String(cause),
      stack: cause instanceof Error ? cause.stack ?? null : null,
      evidenceDirectory: SCRATCH,
    };
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(REPORT_PATH, `${JSON.stringify(failure, null, 2)}\n`);
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  });
}
