/**
 * Production-preview vertical-slice gate for Studio's automatic Hokusai live brushes.
 *
 * This verifier deliberately drives the shipped Studio UI on a blank native document. It never
 * uploads or injects raster input. For pencil, charcoal, and oil it selects the real catalogue
 * entry, draws through trusted Playwright mouse/pointer input, observes the dedicated Worker
 * protocol, and proves that the one user gesture becomes one hidden recoverable DrawEl plus one
 * canonical PNG ImageEl carrying the exact receipt. One Undo must remove both, Redo must restore
 * both, and local autosave + a real page reload must preserve the receipt byte-for-byte.
 *
 * The fallback scenario flips the canvas before drawing. A flipped view is intentionally outside
 * Hokusai v1 admission, so the same direct pointer route must persist as one ordinary vector with
 * no Hokusai begin/frame/complete traffic and no lost trusted input samples.
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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

export const STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION = 1 as const;

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

interface StoredElementSnapshot {
  readonly id: string;
  readonly type: string;
  readonly hidden: boolean;
  readonly brush: string | null;
  readonly brushCatalogId: string | null;
  readonly mode: string | null;
  readonly pointCount: number;
  readonly points: number[];
  readonly hokusaiLiveReceipt: unknown;
}

interface StoredDocumentSnapshot {
  readonly key: string | null;
  readonly savedAt: string | null;
  readonly elements: StoredElementSnapshot[];
}

interface WorkerBeginEvidence {
  readonly strokeId: string;
  readonly presetId: string;
  readonly radiusPixels: number | null;
  readonly opacity: number | null;
  readonly color: string | null;
  readonly seed: number | null;
}

interface WorkerFrameEvidence {
  readonly strokeId: string;
  readonly phase: string;
  readonly sequence: number | null;
  readonly pixelHash: string | null;
  readonly pixelBytes: number;
  readonly nonZeroAlphaPixels: number;
  readonly blank: boolean;
}

interface WorkerCompleteEvidence {
  readonly strokeId: string;
  readonly presetId: string | null;
  readonly sampleCount: number | null;
  readonly finalSequence: number | null;
  readonly inputHash: string | null;
  readonly lastLivePixelHash: string | null;
  readonly settledPixelHash: string | null;
  readonly pngHash: string | null;
  readonly exactLiveCommitParity: boolean;
  readonly materialTexture: string | null;
  readonly endpointPolicy: string | null;
  readonly colorOpacityApplication: string | null;
  readonly quality: StudioHokusaiLiveProductQualityEvidence | null;
  readonly complete: boolean;
}

export interface StudioHokusaiLiveProductQualityEvidence {
  readonly nonZeroPixels: number;
  readonly alphaMean: number;
  readonly alphaStandardDeviation: number;
  readonly edgeDensity: number;
  readonly neighbourDifference: number;
  readonly periodicity: number;
  readonly circleCarrierExposure: number;
  readonly startBackMassRatio: number;
  readonly centerlineGapsAfterStart: number;
  readonly horizontalVariation: number;
  readonly verticalVariation: number;
  readonly directionalAnisotropy: number;
}

interface TrustedPointerContactEvidence {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly down: readonly [number, number];
  readonly moves: readonly (readonly [number, number])[];
  readonly up: readonly [number, number] | null;
}

interface BrowserMonitorSnapshot {
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
}

export interface StudioHokusaiLiveFamilyIntegrationEvidence {
  readonly brushId: string;
  readonly brushName: string;
  readonly presetId: HokusaiFamilyId;
  readonly blankNativePageElementCount: 0;
  readonly workerBeginCount: number;
  readonly liveFrameCount: number;
  readonly blankFrameCount: number;
  readonly firstLiveFrame: WorkerFrameEvidence | null;
  readonly workerCompleteCount: number;
  readonly completeReceipt: WorkerCompleteEvidence | null;
  readonly trustedPointerSampleCount: number;
  readonly canonicalSourceId: string | null;
  readonly canonicalImageId: string | null;
  readonly canonicalPairElementCount: number;
  readonly hiddenDrawCount: number;
  readonly canonicalReceiptCount: number;
  readonly provisionalVisibleDrawCount: number;
  readonly receiptSourceMatched: boolean;
  readonly receiptPresetMatched: boolean;
  readonly receiptWorkerHashMatched: boolean;
  readonly undoLayerCount: number;
  readonly redoLayerCount: number;
  readonly reloadLayerCount: number;
  readonly redoReceiptPreserved: boolean;
  readonly reloadReceiptPreserved: boolean;
  readonly screenshotLive: string;
  readonly screenshotCommitted: string;
  readonly screenshotReloaded: string;
}

export interface StudioHokusaiLiveFallbackIntegrationEvidence {
  readonly mode: "canvas-horizontal-flip";
  readonly blankNativePageElementCount: 0;
  readonly hokusaiBeginDelta: number;
  readonly hokusaiFrameDelta: number;
  readonly hokusaiCompleteDelta: number;
  readonly trustedPointerSampleCount: number;
  readonly persistedVectorPointCount: number;
  readonly lostInputSamples: number;
  readonly persistedVectorPathDistance: number;
  readonly persistedElementCount: number;
  readonly visibleDrawCount: number;
  readonly canonicalReceiptCount: number;
  readonly undoLayerCount: number;
  readonly screenshot: string;
}

export interface StudioHokusaiLiveIntegrationResult {
  readonly status: "ok" | "failed";
  readonly schemaVersion: typeof STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION;
  readonly execution: "vite-production-preview-shipped-studio-direct-pointer";
  readonly families: StudioHokusaiLiveFamilyIntegrationEvidence[];
  readonly fallback: StudioHokusaiLiveFallbackIntegrationEvidence | null;
  readonly diagnostics: BrowserDiagnostics;
  readonly issues: string[];
  readonly evidenceDirectory: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function exactReceiptIdentity(receipt: unknown): Readonly<{
  sourceElementId: string;
  sourceRevision: string;
  presetId: string;
  inputHash: string;
  settledPixelHash: string;
  pngHash: string;
  exactLiveCommitParity: boolean;
}> | null {
  if (!record(receipt) || receipt.kind !== "studio-hokusai-live/document-receipt") return null;
  const canonical = receipt.canonical;
  if (!record(canonical)) return null;
  if (
    !string(receipt.sourceElementId)
    || !string(receipt.sourceRevision)
    || !string(canonical.presetId)
    || !string(canonical.inputHash)
    || !string(canonical.settledPixelHash)
    || !string(canonical.pngHash)
  ) return null;
  return {
    sourceElementId: receipt.sourceElementId,
    sourceRevision: receipt.sourceRevision,
    presetId: canonical.presetId,
    inputHash: canonical.inputHash,
    settledPixelHash: canonical.settledPixelHash,
    pngHash: canonical.pngHash,
    exactLiveCommitParity: canonical.exactLiveCommitParity === true,
  };
}

/** Pure policy validation is exported so CI can reject incomplete/mocked browser evidence. */
export function validateStudioHokusaiLiveIntegrationResult(candidate: unknown): string[] {
  const issues: string[] = [];
  if (!record(candidate)) return ["integration result is not an object"];
  if (candidate.status !== "ok") issues.push("integration run did not report ok");
  if (candidate.schemaVersion !== STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION) {
    issues.push("integration report schema version is invalid");
  }
  if (candidate.execution !== "vite-production-preview-shipped-studio-direct-pointer") {
    issues.push("integration run did not use the shipped production-preview direct-pointer path");
  }

  const families = array(candidate.families) ? candidate.families : [];
  const expectedPresetIds = FAMILY_SCENARIOS.map(({ presetId }) => presetId);
  const actualPresetIds = families.flatMap((family) => (
    record(family) && string(family.presetId) ? [family.presetId] : []
  ));
  if (
    families.length !== FAMILY_SCENARIOS.length
    || JSON.stringify(actualPresetIds) !== JSON.stringify(expectedPresetIds)
  ) {
    issues.push("pencil, charcoal, and oil were not each exercised exactly once");
  }

  for (const expected of FAMILY_SCENARIOS) {
    const family = families.find((value) => record(value) && value.presetId === expected.presetId);
    if (!record(family)) continue;
    const prefix = expected.presetId;
    if (family.brushId !== expected.brushId || family.brushName !== expected.brushName) {
      issues.push(`${prefix}: the shipped catalogue identity was not selected`);
    }
    if (family.blankNativePageElementCount !== 0) {
      issues.push(`${prefix}: scenario did not begin on a blank native document`);
    }
    if (family.workerBeginCount !== 1 || family.workerCompleteCount !== 1) {
      issues.push(`${prefix}: one pointer gesture did not own exactly one Hokusai session`);
    }
    if (!integer(family.liveFrameCount, 1) || family.blankFrameCount !== 0) {
      issues.push(`${prefix}: live frames are missing or include a blank frame`);
    }
    const firstFrame = family.firstLiveFrame;
    if (
      !record(firstFrame)
      || firstFrame.phase !== "live"
      || !integer(firstFrame.pixelBytes, 4)
      || !integer(firstFrame.nonZeroAlphaPixels, 1)
      || firstFrame.blank !== false
      || !string(firstFrame.pixelHash)
      || !HASH_PATTERN.test(firstFrame.pixelHash)
    ) {
      issues.push(`${prefix}: first live overlay frame lacks visible receipted pixels`);
    }
    const complete = family.completeReceipt;
    if (
      !record(complete)
      || complete.presetId !== expected.presetId
      || !integer(complete.sampleCount, 2)
      || !integer(family.trustedPointerSampleCount, 2)
      || (complete.sampleCount as number) < (family.trustedPointerSampleCount as number)
      || complete.exactLiveCommitParity !== true
      || complete.complete !== true
      || !string(complete.inputHash)
      || !HASH_PATTERN.test(complete.inputHash)
      || !string(complete.lastLivePixelHash)
      || !HASH_PATTERN.test(complete.lastLivePixelHash)
      || !string(complete.settledPixelHash)
      || complete.lastLivePixelHash !== complete.settledPixelHash
      || !string(complete.pngHash)
      || !HASH_PATTERN.test(complete.pngHash)
      || complete.materialTexture !== "studio-hokusai-material-texture-v2"
      || complete.endpointPolicy !== "tapered-start-no-dab-carrier-v1"
      || complete.colorOpacityApplication !== "worker-once-before-material-transfer-v1"
    ) {
      issues.push(`${prefix}: canonical Worker receipt is incomplete or lost pointer samples`);
    }
    const quality = record(complete) && record(complete.quality)
      ? complete.quality
      : null;
    // Graphite is intentionally porous: a single sampled centerline pixel can
    // land in paper grain even when the canonical stroke is visually
    // continuous. Charcoal and oil remain gap-free, and the separate sparse
    // figure-eight gate proves both lobes and their alpha mass survive.
    const maximumMaterialCenterlineGaps = expected.presetId === "pencil" ? 1 : 0;
    if (
      !quality
      || !integer(quality.nonZeroPixels, 128)
      || !finite(quality.alphaMean)
      || quality.alphaMean < 0.12
      || quality.alphaMean > 0.98
      || !finite(quality.alphaStandardDeviation)
      || quality.alphaStandardDeviation < 10
      || !finite(quality.edgeDensity)
      || quality.edgeDensity < 0.06
      || !finite(quality.neighbourDifference)
      || quality.neighbourDifference < 1.5
      || !finite(quality.periodicity)
      || quality.periodicity > 0.58
      || !finite(quality.circleCarrierExposure)
      || quality.circleCarrierExposure > 0.48
      || !finite(quality.startBackMassRatio)
      || quality.startBackMassRatio > 0.35
      || !integer(quality.centerlineGapsAfterStart, 0)
      || quality.centerlineGapsAfterStart > maximumMaterialCenterlineGaps
      || !finite(quality.directionalAnisotropy)
      || quality.directionalAnisotropy < 1.01
    ) {
      issues.push(`${prefix}: actual canonical pixels failed material quality gates`);
    }
    if (
      family.canonicalPairElementCount !== 2
      || family.hiddenDrawCount !== 1
      || family.canonicalReceiptCount !== 1
      || family.provisionalVisibleDrawCount !== 0
      || !string(family.canonicalSourceId)
      || !string(family.canonicalImageId)
      || family.canonicalSourceId === family.canonicalImageId
      || family.receiptSourceMatched !== true
      || family.receiptPresetMatched !== true
      || family.receiptWorkerHashMatched !== true
    ) {
      issues.push(`${prefix}: pointerup did not yield exactly one hidden DrawEl/canonical ImageEl pair`);
    }
    if (
      family.undoLayerCount !== 0
      || family.redoLayerCount !== 2
      || family.reloadLayerCount !== 2
      || family.redoReceiptPreserved !== true
      || family.reloadReceiptPreserved !== true
    ) {
      issues.push(`${prefix}: one-step Undo/Redo or save-reload receipt preservation failed`);
    }
  }

  const qualityByPreset = new Map<string, Record<string, unknown>>();
  for (const family of families) {
    if (!record(family) || !string(family.presetId)) continue;
    if (!record(family.completeReceipt) || !record(family.completeReceipt.quality)) continue;
    qualityByPreset.set(family.presetId, family.completeReceipt.quality);
  }
  const pencilQuality = qualityByPreset.get("pencil");
  const charcoalQuality = qualityByPreset.get("charcoal");
  const oilQuality = qualityByPreset.get("oil");
  if (
    !pencilQuality
    || !charcoalQuality
    || !oilQuality
    || !finite(pencilQuality.edgeDensity)
    || !finite(charcoalQuality.edgeDensity)
    || !finite(oilQuality.edgeDensity)
    || !finite(pencilQuality.alphaStandardDeviation)
    || !finite(charcoalQuality.alphaStandardDeviation)
    || !finite(oilQuality.alphaStandardDeviation)
    || !finite(oilQuality.directionalAnisotropy)
    || Math.max(
      pencilQuality.edgeDensity,
      charcoalQuality.edgeDensity,
      oilQuality.edgeDensity,
    ) - Math.min(
      pencilQuality.edgeDensity,
      charcoalQuality.edgeDensity,
      oilQuality.edgeDensity,
    ) < 0.025
    || Math.max(
      pencilQuality.alphaStandardDeviation,
      charcoalQuality.alphaStandardDeviation,
      oilQuality.alphaStandardDeviation,
    ) - Math.min(
      pencilQuality.alphaStandardDeviation,
      charcoalQuality.alphaStandardDeviation,
      oilQuality.alphaStandardDeviation,
    ) < 2
    || oilQuality.directionalAnisotropy < 1.05
  ) {
    issues.push("pencil graphite, charcoal grain, and oil bristles are not measurably separated");
  }

  const fallback = candidate.fallback;
  if (!record(fallback)) {
    issues.push("the rotated/flipped fail-visible vector scenario is missing");
  } else if (
    fallback.mode !== "canvas-horizontal-flip"
    || fallback.blankNativePageElementCount !== 0
    || fallback.hokusaiBeginDelta !== 0
    || fallback.hokusaiFrameDelta !== 0
    || fallback.hokusaiCompleteDelta !== 0
    || !integer(fallback.trustedPointerSampleCount, 2)
    || !integer(fallback.persistedVectorPointCount, 2)
    || fallback.persistedVectorPointCount < fallback.trustedPointerSampleCount
    || fallback.lostInputSamples !== 0
    || !finite(fallback.persistedVectorPathDistance)
    || fallback.persistedVectorPathDistance <= 100
    || fallback.persistedElementCount !== 1
    || fallback.visibleDrawCount !== 1
    || fallback.canonicalReceiptCount !== 0
    || fallback.undoLayerCount !== 0
  ) {
    issues.push("flipped-view fallback lost vector input or incorrectly entered Hokusai");
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
      readyCount: number;
      begins: Array<Record<string, unknown>>;
      frames: Array<Record<string, unknown>>;
      completes: Array<Record<string, unknown>>;
      failures: Array<Record<string, unknown>>;
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
      readyCount: 0,
      begins: [],
      frames: [],
      completes: [],
      failures: [],
      pointerContacts: [],
    };
    scope.__studioHokusaiLiveIntegrationMonitor = monitor;
    const strokeTraces = new Map<string, {
      radiusPixels: number;
      samples: Array<{ x: number; y: number }>;
    }>();

    const alphaAt = (
      pixels: Uint8Array,
      width: number,
      height: number,
      x: number,
      y: number,
    ): number => {
      let maximum = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.round(x + offsetX);
          const sampleY = Math.round(y + offsetY);
          if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
          maximum = Math.max(
            maximum,
            pixels[(sampleY * width + sampleX) * 4 + 3] ?? 0,
          );
        }
      }
      return maximum;
    };
    const normalizedPeriodicity = (values: readonly number[]): number => {
      const residual = values.map((value, index) => {
        let sum = 0;
        let count = 0;
        for (
          let neighbour = Math.max(0, index - 8);
          neighbour <= Math.min(values.length - 1, index + 8);
          neighbour += 1
        ) {
          sum += values[neighbour] ?? 0;
          count += 1;
        }
        return value - sum / Math.max(1, count);
      });
      let maximum = 0;
      for (let lag = 3; lag <= Math.min(24, residual.length / 3); lag += 1) {
        let correlation = 0;
        let leftEnergy = 0;
        let rightEnergy = 0;
        for (let index = lag; index < residual.length; index += 1) {
          const left = residual[index] ?? 0;
          const right = residual[index - lag] ?? 0;
          correlation += left * right;
          leftEnergy += left * left;
          rightEnergy += right * right;
        }
        const denominator = Math.sqrt(leftEnergy * rightEnergy);
        if (denominator > 0) maximum = Math.max(maximum, correlation / denominator);
      }
      return Math.max(0, maximum);
    };
    const measureQuality = (
      pixels: Uint8Array,
      width: number,
      height: number,
      placement: Readonly<{ x: number; y: number }>,
      trace: { radiusPixels: number; samples: Array<{ x: number; y: number }> },
    ): StudioHokusaiLiveProductQualityEvidence | null => {
      if (
        width <= 0
        || height <= 0
        || pixels.byteLength !== width * height * 4
        || trace.samples.length < 2
      ) return null;
      let nonZeroPixels = 0;
      let alphaSum = 0;
      let alphaSquareSum = 0;
      let edgeCount = 0;
      let neighbourCount = 0;
      let horizontalDifference = 0;
      let verticalDifference = 0;
      let horizontalPairs = 0;
      let verticalPairs = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = (y * width + x) * 4 + 3;
          const alpha = pixels[index] ?? 0;
          if (alpha <= 0) continue;
          nonZeroPixels += 1;
          alphaSum += alpha;
          alphaSquareSum += alpha * alpha;
          const right = pixels[index + 4] ?? 0;
          const down = pixels[index + width * 4] ?? 0;
          edgeCount += Math.abs(alpha - right) >= 12 ? 1 : 0;
          edgeCount += Math.abs(alpha - down) >= 12 ? 1 : 0;
          neighbourCount += 2;
          if (right > 0) {
            horizontalDifference += Math.abs(alpha - right);
            horizontalPairs += 1;
          }
          if (down > 0) {
            verticalDifference += Math.abs(alpha - down);
            verticalPairs += 1;
          }
        }
      }
      const localSamples = trace.samples.map((sample) => ({
        x: sample.x - placement.x,
        y: sample.y - placement.y,
      }));
      const centerline = localSamples.map((sample) => (
        alphaAt(pixels, width, height, sample.x, sample.y)
      ));
      const mean = alphaSum / Math.max(1, nonZeroPixels);
      const variance = Math.max(
        0,
        alphaSquareSum / Math.max(1, nonZeroPixels) - mean * mean,
      );
      const periodicity = normalizedPeriodicity(centerline);
      const horizontalVariation = horizontalDifference / Math.max(1, horizontalPairs);
      const verticalVariation = verticalDifference / Math.max(1, verticalPairs);
      const origin = localSamples[0]!;
      const next = localSamples.find((sample) => (
        Math.hypot(sample.x - origin.x, sample.y - origin.y) >= 0.5
      ));
      let backMass = 0;
      let forwardMass = 0;
      if (next) {
        const deltaX = next.x - origin.x;
        const deltaY = next.y - origin.y;
        const length = Math.hypot(deltaX, deltaY);
        const tangentX = deltaX / length;
        const tangentY = deltaY / length;
        const normalX = -tangentY;
        const normalY = tangentX;
        const radius = Math.max(3, trace.radiusPixels * 1.5);
        for (
          let y = Math.max(0, Math.floor(origin.y - radius));
          y <= Math.min(height - 1, Math.ceil(origin.y + radius));
          y += 1
        ) {
          for (
            let x = Math.max(0, Math.floor(origin.x - radius));
            x <= Math.min(width - 1, Math.ceil(origin.x + radius));
            x += 1
          ) {
            const relativeX = x - origin.x;
            const relativeY = y - origin.y;
            const along = relativeX * tangentX + relativeY * tangentY;
            const across = Math.abs(relativeX * normalX + relativeY * normalY);
            if (across > trace.radiusPixels || Math.abs(along) > trace.radiusPixels) continue;
            const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
            if (along < 0) backMass += alpha;
            else forwardMass += alpha;
          }
        }
      }
      return {
        nonZeroPixels,
        alphaMean: mean / 255,
        alphaStandardDeviation: Math.sqrt(variance),
        edgeDensity: edgeCount / Math.max(1, neighbourCount),
        neighbourDifference:
          (horizontalDifference + verticalDifference)
          / Math.max(1, horizontalPairs + verticalPairs),
        periodicity,
        circleCarrierExposure: periodicity * Math.min(1, Math.sqrt(variance) / 64),
        startBackMassRatio: backMass / Math.max(1, forwardMass),
        centerlineGapsAfterStart: centerline.slice(2).filter((alpha) => alpha <= 0).length,
        horizontalVariation,
        verticalVariation,
        directionalAnisotropy: Math.max(horizontalVariation, verticalVariation)
          / Math.max(0.001, Math.min(horizontalVariation, verticalVariation)),
      };
    };

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
          const worker = Reflect.construct(target, argumentsList, target) as Worker;
          const mutableWorker = worker as unknown as {
            postMessage(message: unknown, transferOrOptions?: unknown): void;
          };
          const nativePostMessage = mutableWorker.postMessage.bind(worker);
          mutableWorker.postMessage = (message: unknown, transferOrOptions?: unknown): void => {
            if (message && typeof message === "object" && !Array.isArray(message)) {
              const value = message as Record<string, unknown>;
              if (value.type === "studio-hokusai-live/begin") {
                const config = value.config && typeof value.config === "object"
                  ? value.config as Record<string, unknown>
                  : {};
                monitor.begins.push({
                  strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
                  presetId: typeof config.presetId === "string" ? config.presetId : "",
                  radiusPixels: typeof config.radiusPixels === "number" ? config.radiusPixels : null,
                  opacity: typeof config.opacity === "number" ? config.opacity : null,
                  color: typeof config.color === "string" ? config.color : null,
                  seed: typeof config.seed === "number" ? config.seed : null,
                });
                if (
                  typeof value.strokeId === "string"
                  && typeof config.radiusPixels === "number"
                ) {
                  strokeTraces.set(value.strokeId, {
                    radiusPixels: config.radiusPixels,
                    samples: [],
                  });
                }
              } else if (
                value.type === "studio-hokusai-live/append"
                && typeof value.strokeId === "string"
                && value.samples instanceof ArrayBuffer
                && typeof value.sampleCount === "number"
                && value.sampleStride === 6
              ) {
                const trace = strokeTraces.get(value.strokeId);
                if (trace) {
                  const packed = new Float32Array(value.samples);
                  for (let index = 0; index < value.sampleCount; index += 1) {
                    const offset = index * 6;
                    trace.samples.push({
                      x: packed[offset] ?? 0,
                      y: packed[offset + 1] ?? 0,
                    });
                  }
                }
              }
            }
            if (transferOrOptions === undefined) nativePostMessage(message);
            else nativePostMessage(message, transferOrOptions);
          };
          worker.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
            const value = event.data as Record<string, unknown>;
            if (value.type === "studio-hokusai-live/ready") {
              monitor.readyCount += 1;
              return;
            }
            if (value.type === "studio-hokusai-live/frame") {
              const pixels = value.pixels instanceof ArrayBuffer
                ? new Uint8Array(value.pixels)
                : new Uint8Array();
              let nonZeroAlphaPixels = 0;
              for (let offset = 3; offset < pixels.byteLength; offset += 4) {
                if ((pixels[offset] ?? 0) > 0) nonZeroAlphaPixels += 1;
              }
              monitor.frames.push({
                strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
                phase: typeof value.phase === "string" ? value.phase : "",
                sequence: typeof value.sequence === "number" ? value.sequence : null,
                pixelHash: typeof value.pixelHash === "string" ? value.pixelHash : null,
                pixelBytes: pixels.byteLength,
                nonZeroAlphaPixels,
                blank: nonZeroAlphaPixels === 0,
              });
              return;
            }
            if (value.type === "studio-hokusai-live/complete") {
              const receipt = value.receipt && typeof value.receipt === "object"
                ? value.receipt as Record<string, unknown>
                : {};
              const pixels = value.pixels instanceof ArrayBuffer
                ? new Uint8Array(value.pixels)
                : new Uint8Array();
              const dirtyBounds = Array.isArray(value.dirtyBounds)
                ? value.dirtyBounds
                : [];
              const placement = value.logicalPlacement && typeof value.logicalPlacement === "object"
                ? value.logicalPlacement as Record<string, unknown>
                : {};
              const trace = typeof value.strokeId === "string"
                ? strokeTraces.get(value.strokeId)
                : undefined;
              const quality = trace
                && typeof dirtyBounds[2] === "number"
                && typeof dirtyBounds[3] === "number"
                && typeof placement.x === "number"
                && typeof placement.y === "number"
                ? measureQuality(
                    pixels,
                    dirtyBounds[2],
                    dirtyBounds[3],
                    { x: placement.x, y: placement.y },
                    trace,
                  )
                : null;
              monitor.completes.push({
                strokeId: typeof value.strokeId === "string" ? value.strokeId : "",
                presetId: typeof receipt.presetId === "string" ? receipt.presetId : null,
                sampleCount: typeof receipt.sampleCount === "number" ? receipt.sampleCount : null,
                finalSequence: typeof receipt.finalSequence === "number" ? receipt.finalSequence : null,
                inputHash: typeof receipt.inputHash === "string" ? receipt.inputHash : null,
                lastLivePixelHash: typeof receipt.lastLivePixelHash === "string"
                  ? receipt.lastLivePixelHash
                  : null,
                settledPixelHash: typeof receipt.settledPixelHash === "string"
                  ? receipt.settledPixelHash
                  : null,
                pngHash: typeof receipt.pngHash === "string" ? receipt.pngHash : null,
                exactLiveCommitParity: receipt.exactLiveCommitParity === true,
                materialTexture: typeof receipt.materialTexture === "string"
                  ? receipt.materialTexture
                  : null,
                endpointPolicy: typeof receipt.endpointPolicy === "string"
                  ? receipt.endpointPolicy
                  : null,
                colorOpacityApplication: typeof receipt.colorOpacityApplication === "string"
                  ? receipt.colorOpacityApplication
                  : null,
                quality,
                complete: receipt.complete === true,
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

async function readStoredDocument(page: Page): Promise<StoredDocumentSnapshot> {
  return page.evaluate((prefix) => {
    type StoredDocument = {
      savedAt?: string;
      currentPageId?: string;
      pagesList?: Array<{ id?: string; elements?: unknown[] }>;
    };
    let newest: { key: string; value: StoredDocument } | null = null;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as StoredDocument;
        if (!Array.isArray(value.pagesList)) continue;
        if (!newest || String(value.savedAt ?? "") >= String(newest.value.savedAt ?? "")) {
          newest = { key, value };
        }
      } catch {
        // Keep looking for the newest valid Studio autosave.
      }
    }
    if (!newest) return { key: null, savedAt: null, elements: [] };
    const pageRecord = newest.value.pagesList?.find(
      (candidate) => candidate.id === newest?.value.currentPageId,
    ) ?? newest.value.pagesList?.[0];
    const elements = (pageRecord?.elements ?? []).flatMap((element) => {
      if (!element || typeof element !== "object" || Array.isArray(element)) return [];
      const value = element as Record<string, unknown>;
      const points = Array.isArray(value.points)
        ? value.points.filter((point): point is number => (
            typeof point === "number" && Number.isFinite(point)
          ))
        : [];
      return [{
        id: typeof value.id === "string" ? value.id : "",
        type: typeof value.type === "string" ? value.type : "",
        hidden: value.hidden === true,
        brush: typeof value.brush === "string" ? value.brush : null,
        brushCatalogId: typeof value.brushCatalogId === "string" ? value.brushCatalogId : null,
        mode: typeof value.mode === "string" ? value.mode : null,
        pointCount: Math.floor(points.length / 2),
        points,
        hokusaiLiveReceipt: value.hokusaiLiveReceipt ?? null,
      }];
    });
    return {
      key: newest.key,
      savedAt: typeof newest.value.savedAt === "string" ? newest.value.savedAt : null,
      elements,
    };
  }, AUTOSAVE_PREFIX);
}

function canonicalPair(snapshot: StoredDocumentSnapshot): Readonly<{
  source: StoredElementSnapshot;
  image: StoredElementSnapshot;
  receipt: NonNullable<ReturnType<typeof exactReceiptIdentity>>;
}> | null {
  const images = snapshot.elements.flatMap((element) => {
    const receipt = exactReceiptIdentity(element.hokusaiLiveReceipt);
    return element.type === "image" && receipt ? [{ element, receipt }] : [];
  });
  if (images.length !== 1) return null;
  const [{ element: image, receipt }] = images;
  const source = snapshot.elements.find(({ id }) => id === receipt.sourceElementId);
  return source?.type === "draw" ? { source, image, receipt } : null;
}

async function waitForStoredDocument(
  page: Page,
  predicate: (snapshot: StoredDocumentSnapshot) => boolean,
  message: string,
  timeoutMilliseconds = 12_000,
): Promise<StoredDocumentSnapshot> {
  const deadline = Date.now() + timeoutMilliseconds;
  let snapshot = await readStoredDocument(page);
  while (!predicate(snapshot) && Date.now() < deadline) {
    await page.waitForTimeout(150);
    snapshot = await readStoredDocument(page);
  }
  invariant(predicate(snapshot), message);
  return snapshot;
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

function pathDistance(points: readonly number[]): number {
  let distance = 0;
  for (let offset = 2; offset + 1 < points.length; offset += 2) {
    distance += Math.hypot(
      points[offset]! - points[offset - 2]!,
      points[offset + 1]! - points[offset - 1]!,
    );
  }
  return distance;
}

async function waitForWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (
    ((globalThis as typeof globalThis & {
      __studioHokusaiLiveIntegrationMonitor?: BrowserMonitorSnapshot;
    }).__studioHokusaiLiveIntegrationMonitor?.readyCount ?? 0) > 0
  ), undefined, { timeout: 12_000 });
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

async function runFamilyScenario(
  browser: Browser,
  studioUrl: string,
  scenario: (typeof FAMILY_SCENARIOS)[number],
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioHokusaiLiveFamilyIntegrationEvidence> {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 1_000 } });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, scenario.presetId, studioUrl);
  const screenshotLive = join(SCRATCH, `${scenario.presetId}-01-live.png`);
  const screenshotCommitted = join(SCRATCH, `${scenario.presetId}-02-committed.png`);
  const screenshotReloaded = join(SCRATCH, `${scenario.presetId}-03-reloaded.png`);
  try {
    await installInstrumentedCleanStudioState(page);
    await prepareStudio(page, studioUrl);
    await activatePen(page);
    await selectBrush(page, scenario);
    await page.locator('[data-studio-hokusai-live-overlay="true"]').waitFor({ state: "attached" });
    await waitForWorkerReady(page);
    await openLayerNavigator(page);
    const blankNativePageElementCount = await waitForLayerCount(page, 0);
    const route = await directPointerRoute(page);
    await drawDirectPointerRoute(page, route, {
      waitForLiveFrame: true,
      liveScreenshot: screenshotLive,
    });
    await waitForLayerCount(page, 2);
    const committed = await waitForStoredDocument(
      page,
      (snapshot) => canonicalPair(snapshot) !== null && snapshot.elements.length === 2,
      `${scenario.presetId}: pointerup did not autosave the canonical pair`,
    );
    const pair = canonicalPair(committed);
    invariant(pair, `${scenario.presetId}: canonical pair is missing`);
    await page.screenshot({ path: screenshotCommitted, animations: "disabled" });
    const monitor = await readBrowserMonitor(page);
    invariant(monitor.failures.length === 0, `${scenario.presetId}: Worker reported ${JSON.stringify(monitor.failures)}`);
    const begins = monitor.begins.filter(({ strokeId }) => strokeId === pair.source.id);
    const frames = monitor.frames.filter(({ strokeId }) => strokeId === pair.source.id);
    const completes = monitor.completes.filter(({ strokeId }) => strokeId === pair.source.id);
    const firstLiveFrame = frames.find(({ phase }) => phase === "live") ?? null;
    const completeReceipt = completes[0] ?? null;
    const contact = monitor.pointerContacts[0];

    await page.keyboard.press("Meta+z");
    const undoLayerCount = await waitForLayerCount(page, 0);
    await page.keyboard.press("Meta+Shift+z");
    const redoLayerCount = await waitForLayerCount(page, 2);
    const redone = await waitForStoredDocument(
      page,
      (snapshot) => canonicalPair(snapshot) !== null && snapshot.elements.length === 2,
      `${scenario.presetId}: Redo did not restore the canonical pair`,
    );
    const redonePair = canonicalPair(redone);
    invariant(redonePair, `${scenario.presetId}: redone canonical pair is missing`);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 25_000 });
    await restoreAutosaveAfterReload(page);
    await openLayerNavigator(page);
    const reloadLayerCount = await waitForLayerCount(page, 2);
    const reloaded = await readStoredDocument(page);
    const reloadedPair = canonicalPair(reloaded);
    invariant(reloadedPair, `${scenario.presetId}: reload did not preserve the canonical pair`);
    await page.screenshot({ path: screenshotReloaded, animations: "disabled" });

    const receipt = pair.receipt;
    const workerReceiptHashMatched = Boolean(
      completeReceipt
      && receipt.inputHash === completeReceipt.inputHash
      && receipt.settledPixelHash === completeReceipt.settledPixelHash
      && receipt.pngHash === completeReceipt.pngHash,
    );
    return {
      brushId: scenario.brushId,
      brushName: scenario.brushName,
      presetId: scenario.presetId,
      blankNativePageElementCount: blankNativePageElementCount as 0,
      workerBeginCount: begins.length,
      liveFrameCount: frames.length,
      blankFrameCount: frames.filter(({ blank }) => blank).length,
      firstLiveFrame,
      workerCompleteCount: completes.length,
      completeReceipt,
      trustedPointerSampleCount: pointerSampleCount(contact),
      canonicalSourceId: pair.source.id,
      canonicalImageId: pair.image.id,
      canonicalPairElementCount: committed.elements.length,
      hiddenDrawCount: committed.elements.filter(({ type, hidden }) => type === "draw" && hidden).length,
      canonicalReceiptCount: committed.elements.filter((element) => (
        exactReceiptIdentity(element.hokusaiLiveReceipt) !== null
      )).length,
      provisionalVisibleDrawCount: committed.elements.filter(({ type, hidden }) => (
        type === "draw" && !hidden
      )).length,
      receiptSourceMatched: receipt.sourceElementId === pair.source.id
        && SOURCE_REVISION_PATTERN.test(receipt.sourceRevision),
      receiptPresetMatched: receipt.presetId === scenario.presetId,
      receiptWorkerHashMatched: workerReceiptHashMatched,
      undoLayerCount,
      redoLayerCount,
      reloadLayerCount,
      redoReceiptPreserved: JSON.stringify(redonePair.receipt) === JSON.stringify(receipt),
      reloadReceiptPreserved: JSON.stringify(reloadedPair.receipt) === JSON.stringify(receipt),
      screenshotLive,
      screenshotCommitted,
      screenshotReloaded,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

async function runFallbackScenario(
  browser: Browser,
  studioUrl: string,
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioHokusaiLiveFallbackIntegrationEvidence> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1_440, height: 1_000 },
  });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, "flipped-fallback", studioUrl);
  const screenshot = join(SCRATCH, "fallback-flipped-vector.png");
  try {
    await installInstrumentedCleanStudioState(page);
    await prepareStudio(page, studioUrl);
    await activatePen(page);
    await selectBrush(page, FAMILY_SCENARIOS[0]);
    await waitForWorkerReady(page);
    await openLayerNavigator(page);
    const blankNativePageElementCount = await waitForLayerCount(page, 0);
    const flip = page.getByRole("button", { name: "캔버스 좌우 반전", exact: true }).first();
    await flip.waitFor({ state: "visible" });
    await flip.click();
    invariant(await flip.getAttribute("aria-pressed") === "true", "canvas flip did not activate");
    const before = await readBrowserMonitor(page);
    const route = await directPointerRoute(page);
    await drawDirectPointerRoute(page, route, { waitForLiveFrame: false });
    await waitForLayerCount(page, 1);
    const persisted = await waitForStoredDocument(
      page,
      (snapshot) => snapshot.elements.length === 1
        && snapshot.elements[0]?.type === "draw"
        && snapshot.elements[0]?.hidden === false,
      "flipped fallback did not autosave one visible DrawEl",
    );
    const after = await readBrowserMonitor(page);
    const vector = persisted.elements[0]!;
    const contact = after.pointerContacts[0];
    const trustedPointerSampleCount = pointerSampleCount(contact);
    const persistedVectorPointCount = vector.pointCount;
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await page.keyboard.press("Meta+z");
    const undoLayerCount = await waitForLayerCount(page, 0);
    return {
      mode: "canvas-horizontal-flip",
      blankNativePageElementCount: blankNativePageElementCount as 0,
      hokusaiBeginDelta: after.begins.length - before.begins.length,
      hokusaiFrameDelta: after.frames.length - before.frames.length,
      hokusaiCompleteDelta: after.completes.length - before.completes.length,
      trustedPointerSampleCount,
      persistedVectorPointCount,
      lostInputSamples: Math.max(0, trustedPointerSampleCount - persistedVectorPointCount),
      persistedVectorPathDistance: pathDistance(vector.points),
      persistedElementCount: persisted.elements.length,
      visibleDrawCount: persisted.elements.filter(({ type, hidden }) => (
        type === "draw" && !hidden
      )).length,
      canonicalReceiptCount: persisted.elements.filter((element) => (
        exactReceiptIdentity(element.hokusaiLiveReceipt) !== null
      )).length,
      undoLayerCount,
      screenshot,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a production-preview port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForServer(origin: string, timeoutMilliseconds = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { method: "HEAD" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Production preview is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`production preview did not become ready: ${origin}`);
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  const waitForExit = (timeoutMilliseconds: number) => Promise.race([
    new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, timeoutMilliseconds)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await waitForExit(1_500);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForExit(1_500);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

function prepareScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const name of readdirSync(SCRATCH)) {
    if (!/^(?:pencil|charcoal|oil|fallback|studio-hokusai-live-integration).*(?:\.png|\.json|\.log)$/u.test(name)) {
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
  const port = externalOrigin ? null : await findFreePort();
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
    await waitForServer(origin);
    log(`production preview ready @ ${studioUrl}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const families: StudioHokusaiLiveFamilyIntegrationEvidence[] = [];
    for (const scenario of FAMILY_SCENARIOS) {
      log(`${scenario.presetId}: direct-pointer scenario starting`);
      families.push(await runFamilyScenario(browser, studioUrl, scenario, diagnostics));
      log(`${scenario.presetId}: canonical pair, Undo/Redo, and reload observed`);
    }
    const fallback = await runFallbackScenario(browser, studioUrl, diagnostics);
    const candidate = {
      status: "ok",
      schemaVersion: STUDIO_HOKUSAI_LIVE_INTEGRATION_REPORT_SCHEMA_VERSION,
      execution: "vite-production-preview-shipped-studio-direct-pointer",
      families,
      fallback,
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
