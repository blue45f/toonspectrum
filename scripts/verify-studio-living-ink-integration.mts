/**
 * Production-preview vertical integration gate for Studio Living Ink.
 *
 * This verifier intentionally starts from a blank native Studio document and draws with trusted
 * browser pointer input. It does not upload an image and it does not import application modules in
 * the page. Worker messages, product-owned DOM receipts, the ordinary layer navigator, history,
 * and the persisted Studio document are the only authorities.
 *
 * Run only after a production build already exists:
 *   pnpm exec tsx scripts/verify-studio-living-ink-integration.mts
 * Reuse an existing production preview:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5199 \
 *     pnpm exec tsx scripts/verify-studio-living-ink-integration.mts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { decodePng } from "image-js";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

import { DIST_DIR } from "./lib/repo-paths.mjs";
import {
  findFreePort,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

export const STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION = 7 as const;

const FIXED_PIGMENT_INVARIANT_GATE =
  "scripts/verify-studio-living-ink-execution.mjs#fixedInvariant.exact-and-maximumRgbDifference-zero" as const;

const SCRATCH =
  process.env.TOONSPECTRUM_LIVING_INK_INTEGRATION_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-living-ink-integration");
const LOG_PATH = join(SCRATCH, "studio-living-ink-integration.log");
const REPORT_PATH = join(SCRATCH, "studio-living-ink-integration.json");
const AUTOSAVE_PREFIX = "toonspectrum-studio-autosave";
const CLEAN_SESSION_KEY = "toonspectrum-living-ink-integration-cleaned";
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const MOBILE_DRAW_SETTINGS_ID = "studio-mobile-draw-settings";
const APP_SETTINGS_KEY = "toonspectrum-studio-app-settings";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ROUTE_PATTERN = /^studio-stroke-surface-route-v1:\d+:\d+:[^:]+:living-ink$/u;
const MINIMUM_AUTHORITATIVE_SAMPLES = 65;
const MAX_PHYSICAL_FIRST_PIXEL_MS = 1_500;
const MAX_PHYSICAL_CANONICAL_HANDOFF_MS = 5_000;
const BRUSH = Object.freeze({ id: "watercolor", name: "수채 번짐" });
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly consoleWarnings: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly fiveHundredResponses: string[];
}

interface WorkerRequestEvidence {
  readonly requestId: number | null;
  readonly type: string;
  readonly operationKind: string | null;
  readonly operationSequence: number | null;
  readonly markCount: number;
  readonly quality: string | null;
}

interface WorkerFrameEvidence {
  readonly sequence: number;
  readonly requestId: number | null;
  readonly operationKind: string | null;
  readonly revision: number | null;
  readonly displaySha256: string | null;
  readonly operationSha256: string | null;
  readonly backend: string | null;
  readonly gpuError: number | null;
}

interface PointerContactEvidence {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly down: readonly [number, number];
  readonly moves: readonly (readonly [number, number])[];
  readonly up: readonly [number, number] | null;
  readonly coalescedCalls: number;
  readonly coalescedSamples: number;
  readonly downAtMs: number;
  readonly upAtMs: number | null;
}

interface ProductPresentationEvidence {
  readonly sequence: number;
  readonly atMs: number;
  readonly routeKey: string | null;
  readonly displaySha256: string | null;
  readonly revision: number | null;
}

interface ProductCanonicalHandoffEvidence {
  readonly sequence: number;
  readonly atMs: number;
  readonly pngSha256: string | null;
}

interface ControlStateEvidence {
  readonly sequence: number;
  readonly state: string;
  readonly waterDisabled: boolean;
  readonly fixDisabled: boolean;
  readonly clearDisabled: boolean;
}

interface ControlPresenceEvidence {
  readonly sequence: number;
  readonly present: boolean;
}

interface OverlaySurfaceEvidence {
  readonly sequence: number;
  readonly connected: boolean;
  readonly width: number;
  readonly height: number;
  readonly left: string;
  readonly top: string;
  readonly cssWidth: string;
  readonly cssHeight: string;
}

interface BrowserMonitorSnapshot {
  readonly initSteps: readonly string[];
  readonly sequence: number;
  readonly livingInkInitializes: number;
  readonly livingInkReady: number;
  readonly requests: WorkerRequestEvidence[];
  readonly frames: WorkerFrameEvidence[];
  readonly workerErrors: readonly string[];
  readonly competingSpecialistMessages: readonly string[];
  readonly pointerContacts: PointerContactEvidence[];
  readonly presentations: ProductPresentationEvidence[];
  readonly canonicalHandoffs: ProductCanonicalHandoffEvidence[];
  readonly controlStates: ControlStateEvidence[];
  readonly controlPresenceStates: ControlPresenceEvidence[];
  readonly overlayDraws: number;
  readonly statusMessages: readonly string[];
  readonly overlaySurfaces: readonly OverlaySurfaceEvidence[];
}

interface StoredElementSnapshot {
  readonly id: string;
  readonly type: string;
  readonly hidden: boolean;
  readonly pointCount: number;
  readonly src: string | null;
  readonly livingInkReceipt: unknown;
}

interface StoredDocumentSnapshot {
  readonly key: string | null;
  readonly raw: string | null;
  readonly savedAt: string | null;
  readonly elements: StoredElementSnapshot[];
}

interface LivingInkReceiptIdentity {
  readonly pageId: string;
  readonly routeKey: string;
  readonly canonicalPngSha256: string;
  readonly engineVersion: string;
  readonly sourceElementIds: readonly string[];
  readonly journalLength: number;
  readonly journalKinds: readonly string[];
  readonly displaySha256: string;
  readonly operationSha256: string;
  readonly fixedPigmentPolicy: string;
  readonly historyEntryCount: number;
}

export interface StudioLivingInkPositiveEvidence {
  readonly blankNativePageElementCount: 0;
  readonly brushId: "watercolor";
  readonly workerInitializeCount: number;
  readonly workerReadyCount: number;
  readonly depositOperationCount: number;
  readonly advanceOperationCount: number;
  readonly competingSpecialistMessageCount: number;
  readonly trustedPointerSampleCount: number;
  readonly coalescedApiCallCount: number;
  readonly coalescedSampleCount: number;
  readonly persistedSourcePointCount: number;
  readonly strictRouteKey: string | null;
  readonly presentationReceipt: ProductPresentationEvidence | null;
  readonly canonicalHandoffReceipt: ProductCanonicalHandoffEvidence | null;
  readonly overlayDrawCount: number;
  readonly presentationBeforeCanonicalHandoff: boolean;
  readonly canonicalPairElementCount: number;
  readonly hiddenSourceCount: number;
  readonly visibleCanonicalPngCount: number;
  readonly canonicalReceiptCount: number;
  readonly storedCanonicalPngHashMatched: boolean;
  readonly workerFinalHashMatched: boolean;
  readonly physicalFirstPixelLatencyMs: number;
  readonly physicalCanonicalHandoffLatencyMs: number;
  readonly untouchedPaperPatchChangedPixels: number;
  readonly untouchedPaperPatchMaxChannelDelta: number;
  readonly canonicalUntouchedAlphaSampleCount: number;
  readonly canonicalUntouchedNonTransparentPixels: number;
  readonly canonicalUntouchedMaxAlpha: number;
  readonly canonicalHandoffSelectedLayerCount: number;
  readonly canonicalHandoffViewportMaxDelta: number;
  readonly undoLayerCount: number;
  readonly undoStoredElementCount: number;
  readonly redoLayerCount: number;
  readonly reloadLayerCount: number;
  readonly redoReceiptPreserved: boolean;
  readonly reloadReceiptPreserved: boolean;
  readonly replayAcceptedFrameObserved: boolean;
  readonly replayPreAcceptanceControlStateCount: number;
  readonly replayControlsAbsentBeforeAcceptedFrame: boolean;
  readonly replayControlsFailClosedBeforeAcceptedFrame: boolean;
  readonly physicsReadyAfterAcceptedHash: boolean;
  readonly waterModeSelectableAfterReplay: boolean;
  readonly fixEnabledAfterReplay: boolean;
  readonly fixJournalCommitted: boolean;
  readonly fixCanonicalPngHashMatched: boolean;
  readonly fixUndoRestoredPriorReceipt: boolean;
  readonly fixRedoRestoredReceipt: boolean;
  readonly waterAfterFixJournalCommitted: boolean;
  readonly fixedWaterCanonicalPngHashMatched: boolean;
  /**
   * Composite PNGs legitimately evolve under clear-water sheen. The exact fixed-pigment invariant
   * is owned by the separate actual Worker/WebGL2 gate named here, which renders the fixed channel
   * before and after Water + advance and requires a zero-byte/zero-RGB difference.
   */
  readonly fixedPigmentInvariantGate: typeof FIXED_PIGMENT_INVARIANT_GATE;
  readonly fixedWaterUndoRestoredFixReceipt: boolean;
  readonly fixedWaterRedoRestoredReceipt: boolean;
  readonly fixedWaterReloadReceiptPreserved: boolean;
  readonly screenshotLive: string;
  readonly screenshotBlank: string;
  readonly screenshotCommitted: string;
  readonly screenshotReloaded: string;
  readonly screenshotFixed: string;
  readonly screenshotFixedAfterWater: string;
}

export interface StudioLivingInkFailClosedEvidence {
  readonly corruption: "canonical-png-hash" | "final-receipt-hash" | "journal-sequence";
  readonly state: string;
  readonly visibleCanonicalPngCount: number;
  readonly hiddenSourceCount: number;
  readonly canonicalPngSha256Preserved: boolean;
  readonly canonicalPngBytesPreserved: boolean;
  readonly waterDisabled: boolean;
  readonly fixDisabled: boolean;
  readonly clearDisabled: boolean;
  readonly screenshot: string;
}

export interface StudioLivingInkMobileEvidence {
  readonly viewport: "390x844";
  readonly coarsePointer: boolean;
  readonly controlsVisible: boolean;
  readonly controlsWithinViewport: boolean;
  readonly minimumControlWidth: number;
  readonly minimumControlHeight: number;
  readonly state: string;
  readonly screenshot: string;
}

export interface StudioLivingInkIntegrationResult {
  readonly status: "failed" | "ok";
  readonly schemaVersion: typeof STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION;
  readonly execution: "vite-production-preview-shipped-studio-native-pointer";
  readonly positive: StudioLivingInkPositiveEvidence | null;
  readonly corruptedReceipt: StudioLivingInkFailClosedEvidence | null;
  readonly corruptedJournal: StudioLivingInkFailClosedEvidence | null;
  readonly corruptedCanonicalPng: StudioLivingInkFailClosedEvidence | null;
  readonly mobile: StudioLivingInkMobileEvidence | null;
  readonly diagnostics: BrowserDiagnostics;
  readonly issues: string[];
  readonly evidenceDirectory: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): value is unknown[] {
  return Array.isArray(value);
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

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
}

function pngDataUrlSha256(src: string | null): `sha256:${string}` | null {
  const encoded = src?.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u)?.[1];
  if (!encoded) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0) return null;
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inspectCanonicalUntouchedAlpha(src: string | null): Readonly<{
  sampleCount: number;
  nonTransparentPixels: number;
  maxAlpha: number;
}> {
  const encoded = src?.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u)?.[1];
  invariant(encoded, "stored canonical image is not a PNG data URL");
  const bytes = Buffer.from(encoded, "base64");
  const image = decodePng(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const data = image.getRawImage().data;
  const patchSize = Math.max(
    1,
    Math.min(32, Math.floor(image.width / 8), Math.floor(image.height / 8)),
  );
  const origins = [
    [0, 0],
    [image.width - patchSize, 0],
    [0, image.height - patchSize],
    [image.width - patchSize, image.height - patchSize],
  ] as const;
  let sampleCount = 0;
  let nonTransparentPixels = 0;
  let maxAlpha = 0;
  for (const [originX, originY] of origins) {
    for (let y = originY; y < originY + patchSize; y += 1) {
      for (let x = originX; x < originX + patchSize; x += 1) {
        sampleCount += 1;
        const alpha = image.channels === 4
          ? Number(data[(y * image.width + x) * image.channels + 3])
          : 255;
        if (alpha !== 0) nonTransparentPixels += 1;
        maxAlpha = Math.max(maxAlpha, alpha);
      }
    }
  }
  return Object.freeze({ sampleCount, nonTransparentPixels, maxAlpha });
}

function compareScreenshotRgbPatch(
  beforePath: string,
  afterPath: string,
  patch: Readonly<{ x: number; y: number; width: number; height: number }>,
): Readonly<{ changedPixels: number; maxChannelDelta: number }> {
  const decode = (path: string) => {
    const buffer = readFileSync(path);
    const image = decodePng(new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    ));
    return {
      width: image.width,
      height: image.height,
      channels: image.channels,
      data: image.getRawImage().data,
    };
  };
  const before = decode(beforePath);
  const after = decode(afterPath);
  invariant(
    before.width === after.width
    && before.height === after.height
    && before.channels >= 3
    && after.channels >= 3,
    "Living Ink paper-patch screenshots have incompatible RGB geometry",
  );
  invariant(
    patch.x >= 0
    && patch.y >= 0
    && patch.x + patch.width <= before.width
    && patch.y + patch.height <= before.height,
    "Living Ink paper-patch sample falls outside the production screenshot",
  );
  let changedPixels = 0;
  let maxChannelDelta = 0;
  for (let y = patch.y; y < patch.y + patch.height; y += 1) {
    for (let x = patch.x; x < patch.x + patch.width; x += 1) {
      const beforeOffset = (y * before.width + x) * before.channels;
      const afterOffset = (y * after.width + x) * after.channels;
      let changed = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(
          Number(before.data[beforeOffset + channel])
          - Number(after.data[afterOffset + channel]),
        );
        if (delta > 0) changed = true;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      if (changed) changedPixels += 1;
    }
  }
  return Object.freeze({ changedPixels, maxChannelDelta });
}

function exactLivingInkReceipt(receipt: unknown): LivingInkReceiptIdentity | null {
  if (!record(receipt) || receipt.kind !== "studio-living-ink/document-receipt") return null;
  const final = receipt.finalExecutionReceipt;
  const journal = receipt.journal;
  const sourceElementIds = receipt.sourceElementIds;
  if (
    !record(final)
    || !array(journal)
    || !array(sourceElementIds)
    || !string(receipt.pageId)
    || !string(receipt.routeKey)
    || !string(receipt.canonicalPngSha256)
    || !string(receipt.engineVersion)
    || !string(final.displaySha256)
    || !string(final.operationSha256)
    || !string(final.fixedPigmentPolicy)
  ) return null;
  return {
    pageId: receipt.pageId,
    routeKey: receipt.routeKey,
    canonicalPngSha256: receipt.canonicalPngSha256,
    engineVersion: receipt.engineVersion,
    sourceElementIds: sourceElementIds.filter(string),
    journalLength: journal.length,
    journalKinds: journal.flatMap((operation) => (
      record(operation) && string(operation.kind) ? [operation.kind] : []
    )),
    displaySha256: final.displaySha256,
    operationSha256: final.operationSha256,
    fixedPigmentPolicy: final.fixedPigmentPolicy,
    historyEntryCount: integer(receipt.historyEntryCount) ? receipt.historyEntryCount : -1,
  };
}

function canonicalPair(snapshot: StoredDocumentSnapshot): Readonly<{
  image: StoredElementSnapshot;
  receipt: LivingInkReceiptIdentity;
  sources: StoredElementSnapshot[];
}> | null {
  const images = snapshot.elements.flatMap((element) => {
    const receipt = exactLivingInkReceipt(element.livingInkReceipt);
    return element.type === "image" && receipt ? [{ image: element, receipt }] : [];
  });
  if (images.length !== 1) return null;
  const [{ image, receipt }] = images;
  const sources = receipt.sourceElementIds.flatMap((id) => {
    const source = snapshot.elements.find((element) => element.id === id);
    return source?.type === "draw" ? [source] : [];
  });
  return { image, receipt, sources };
}

/** Pure gate used by Vitest and CI to reject partial, mocked, or fail-open evidence. */
export function validateStudioLivingInkIntegrationResult(candidate: unknown): string[] {
  const issues: string[] = [];
  if (!record(candidate)) return ["integration result is not an object"];
  if (candidate.status !== "ok") issues.push("integration run did not report ok");
  if (candidate.schemaVersion !== STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION) {
    issues.push("integration report schema version is invalid");
  }
  if (candidate.execution !== "vite-production-preview-shipped-studio-native-pointer") {
    issues.push("integration did not use the shipped native-pointer Studio route");
  }

  const positive = candidate.positive;
  if (!record(positive)) {
    issues.push("positive Living Ink product flow is missing");
  } else {
    if (
      positive.blankNativePageElementCount !== 0
      || positive.brushId !== BRUSH.id
      || !integer(positive.workerInitializeCount, 1)
      || !integer(positive.workerReadyCount, 1)
      || !integer(positive.depositOperationCount, 1)
      || !integer(positive.advanceOperationCount, 1)
      || positive.competingSpecialistMessageCount !== 0
      || !string(positive.strictRouteKey)
      || !ROUTE_PATTERN.test(positive.strictRouteKey)
    ) {
      issues.push("Living Ink did not exclusively own one strict pointer-down route");
    }
    if (
      !integer(positive.trustedPointerSampleCount, MINIMUM_AUTHORITATIVE_SAMPLES)
      || !integer(positive.coalescedApiCallCount, 1)
      || !integer(positive.coalescedSampleCount)
      || !integer(positive.persistedSourcePointCount, MINIMUM_AUTHORITATIVE_SAMPLES)
      || positive.persistedSourcePointCount < positive.trustedPointerSampleCount
    ) {
      issues.push("Living Ink lost authoritative/coalesced pointer samples");
    }
    const presentation = positive.presentationReceipt;
    const handoff = positive.canonicalHandoffReceipt;
    if (
      !record(presentation)
      || !integer(presentation.sequence, 1)
      || !finite(presentation.atMs)
      || presentation.routeKey !== positive.strictRouteKey
      || !string(presentation.displaySha256)
      || !HASH_PATTERN.test(presentation.displaySha256)
      || !integer(presentation.revision, 1)
      || !record(handoff)
      || !integer(handoff.sequence, 1)
      || !finite(handoff.atMs)
      || !string(handoff.pngSha256)
      || !HASH_PATTERN.test(handoff.pngSha256)
      || !integer(positive.overlayDrawCount, 1)
      || positive.presentationBeforeCanonicalHandoff !== true
      || presentation.sequence >= handoff.sequence
    ) {
      issues.push("overlay presentation receipt did not precede the canonical Konva PNG receipt");
    }
    if (
      positive.canonicalPairElementCount !== 2
      || positive.hiddenSourceCount !== 1
      || positive.visibleCanonicalPngCount !== 1
      || positive.canonicalReceiptCount !== 1
      || positive.storedCanonicalPngHashMatched !== true
      || positive.workerFinalHashMatched !== true
    ) {
      issues.push("pointerup did not create one hidden native source plus one canonical PNG");
    }
    if (
      positive.untouchedPaperPatchChangedPixels !== 0
      || positive.untouchedPaperPatchMaxChannelDelta !== 0
      || !integer(positive.canonicalUntouchedAlphaSampleCount, 1)
      || positive.canonicalUntouchedNonTransparentPixels !== 0
      || positive.canonicalUntouchedMaxAlpha !== 0
    ) {
      issues.push("canonical handoff changed untouched paper or emitted opaque off-stroke pixels");
    }
    if (
      positive.canonicalHandoffSelectedLayerCount !== 0
      || !finite(positive.canonicalHandoffViewportMaxDelta)
      || positive.canonicalHandoffViewportMaxDelta > 0.5
    ) {
      issues.push("canonical handoff selected the page image or shifted canvas viewport geometry");
    }
    if (
      !finite(positive.physicalFirstPixelLatencyMs)
      || positive.physicalFirstPixelLatencyMs < 0
      || positive.physicalFirstPixelLatencyMs > MAX_PHYSICAL_FIRST_PIXEL_MS
      || !finite(positive.physicalCanonicalHandoffLatencyMs)
      || positive.physicalCanonicalHandoffLatencyMs < 0
      || positive.physicalCanonicalHandoffLatencyMs > MAX_PHYSICAL_CANONICAL_HANDOFF_MS
    ) {
      issues.push("explicit physical mode exceeded first-pixel or canonical-handoff latency limits");
    }
    if (
      positive.undoLayerCount !== 0
      || positive.undoStoredElementCount !== 0
      || positive.redoLayerCount !== 2
      || positive.reloadLayerCount !== 2
      || positive.redoReceiptPreserved !== true
      || positive.reloadReceiptPreserved !== true
    ) {
      issues.push("Living Ink did not remain one atomic history/save-reload transaction");
    }
    if (
      positive.replayAcceptedFrameObserved !== true
      || positive.replayControlsFailClosedBeforeAcceptedFrame !== true
      || !integer(positive.replayPreAcceptanceControlStateCount)
      || (
        integer(positive.replayPreAcceptanceControlStateCount)
        && positive.replayPreAcceptanceControlStateCount < 1
        && positive.replayControlsAbsentBeforeAcceptedFrame !== true
      )
      || positive.physicsReadyAfterAcceptedHash !== true
      || positive.waterModeSelectableAfterReplay !== true
    ) {
      issues.push("water/fix/clear controls reactivated before an accepted replay receipt");
    }
    if (
      positive.fixEnabledAfterReplay !== true
      || positive.fixJournalCommitted !== true
      || positive.fixCanonicalPngHashMatched !== true
      || positive.fixUndoRestoredPriorReceipt !== true
      || positive.fixRedoRestoredReceipt !== true
      || positive.waterAfterFixJournalCommitted !== true
      || positive.fixedWaterCanonicalPngHashMatched !== true
      || positive.fixedPigmentInvariantGate !== FIXED_PIGMENT_INVARIANT_GATE
      || positive.fixedWaterUndoRestoredFixReceipt !== true
      || positive.fixedWaterRedoRestoredReceipt !== true
      || positive.fixedWaterReloadReceiptPreserved !== true
    ) {
      issues.push("Fix/Water did not remain canonical actions or the fixed-pigment authority gate is missing");
    }
  }

  for (const [key, expected] of [
    ["corruptedReceipt", "final-receipt-hash"],
    ["corruptedJournal", "journal-sequence"],
    ["corruptedCanonicalPng", "canonical-png-hash"],
  ] as const) {
    const evidence = candidate[key];
    if (!record(evidence)) {
      issues.push(`${expected} fail-closed evidence is missing`);
      continue;
    }
    if (
      evidence.corruption !== expected
      || evidence.state !== "failed"
      || evidence.visibleCanonicalPngCount !== 1
      || evidence.hiddenSourceCount !== 1
      || (expected === "canonical-png-hash"
        ? evidence.canonicalPngSha256Preserved !== false
        : evidence.canonicalPngSha256Preserved !== true)
      || evidence.canonicalPngBytesPreserved !== true
      || evidence.waterDisabled !== true
      || evidence.fixDisabled !== true
      || evidence.clearDisabled !== true
    ) {
      issues.push(`${expected} did not preserve flattened pixels and fail closed`);
    }
  }

  const mobile = candidate.mobile;
  if (!record(mobile)) {
    issues.push("mobile pointer-coarse evidence is missing");
  } else if (
    mobile.viewport !== "390x844"
    || mobile.coarsePointer !== true
    || mobile.controlsVisible !== true
    || mobile.controlsWithinViewport !== true
    || !finite(mobile.minimumControlWidth)
    || !finite(mobile.minimumControlHeight)
    || mobile.minimumControlWidth < 44
    || mobile.minimumControlHeight < 44
    || mobile.state !== "ready"
  ) {
    issues.push("mobile Living Ink controls are clipped, hidden, or below 44px");
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

export function expectedStudioLivingInkVerifierDiagnostic(
  message: string,
  studioUrl: string,
): boolean {
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
  const httpCandidates = message.match(/https?:\/\/[^\s]+/gu) ?? [];
  if (httpCandidates.some((candidate) => {
    try {
      const url = new URL(candidate.replace(/['"\]})>,.;:]+$/u, ""));
      return url.origin === previewUrl.origin
        && url.search === ""
        && url.hash === ""
        && OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => path === url.pathname);
    } catch {
      return false;
    }
  })) return true;
  // Chromium's software/headless GL backend warns when the verifier intentionally performs the
  // receipt-authoritative RGBA8 readback. The WebGPU capability probe also reports its expected
  // no-adapter fallback in headless CI. Suppress only these exact loopback-preview diagnostics;
  // every other warning remains fatal evidence.
  if (message === `No available adapters. @ ${studioUrl}`) return true;
  if (
    /^\[\.WebGL-0x[a-f0-9]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels @ /u
      .test(message)
    && message.endsWith(studioUrl)
  ) return true;
  const socketUrl = `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  return message.includes(socketUrl);
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
    if (message.includes("[LEASE_BUSY]")) {
      log(`${label} durable-writer collision: ${message}`);
    }
    if (expectedStudioLivingInkVerifierDiagnostic(message, studioUrl)) return;
    (entry.type() === "error" ? diagnostics.consoleErrors : diagnostics.consoleWarnings)
      .push(`${label}: ${message}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(
      `${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`;
    if (!expectedStudioLivingInkVerifierDiagnostic(message, studioUrl)) {
      diagnostics.requestFailures.push(`${label}: ${message}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStudioLivingInkVerifierDiagnostic(message, studioUrl)) {
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

async function installStudioMonitor(
  page: Page,
  seed?: Readonly<{ key: string; raw: string }>,
): Promise<void> {
  const monitorBootstrap = (input: Readonly<{
    appSettingsKey: string;
    autosavePrefix: string;
    cleanSessionKey: string;
    mobileHintKey: string;
    quickstartKey: string;
    seed: Readonly<{ key: string; raw: string }> | null;
  }>) => {
    type MutableContact = {
      pointerId: number;
      pointerType: string;
      down: readonly [number, number];
      moves: Array<readonly [number, number]>;
      up: readonly [number, number] | null;
      coalescedCalls: number;
      coalescedSamples: number;
      downAtMs: number;
      upAtMs: number | null;
    };
    type MutableMonitor = {
      initSteps: string[];
      sequence: number;
      livingInkInitializes: number;
      livingInkReady: number;
      requests: Array<Record<string, unknown>>;
      frames: Array<Record<string, unknown>>;
      workerErrors: string[];
      competingSpecialistMessages: string[];
      pointerContacts: MutableContact[];
      presentations: Array<Record<string, unknown>>;
      canonicalHandoffs: Array<Record<string, unknown>>;
      controlStates: Array<Record<string, unknown>>;
      controlPresenceStates: Array<Record<string, unknown>>;
      overlayDraws: number;
      statusMessages: string[];
      overlaySurfaces: Array<Record<string, unknown>>;
    };
    const scope = globalThis as typeof globalThis & {
      __studioLivingInkIntegrationMonitor?: MutableMonitor;
    };
    const monitor: MutableMonitor = {
      initSteps: ["monitor-created"],
      sequence: 0,
      livingInkInitializes: 0,
      livingInkReady: 0,
      requests: [],
      frames: [],
      workerErrors: [],
      competingSpecialistMessages: [],
      pointerContacts: [],
      presentations: [],
      canonicalHandoffs: [],
      controlStates: [],
      controlPresenceStates: [],
      overlayDraws: 0,
      statusMessages: [],
      overlaySurfaces: [],
    };
    scope.__studioLivingInkIntegrationMonitor = monitor;
    try {
    const nextSequence = (): number => {
      monitor.sequence += 1;
      return monitor.sequence;
    };

    try {
      window.localStorage.setItem(input.quickstartKey, "1");
      window.localStorage.setItem(input.mobileHintKey, "1");
      let settings: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(window.localStorage.getItem(input.appSettingsKey) ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) settings = parsed;
      } catch {
        // Replace malformed QA-only settings below.
      }
      const general = settings.general && typeof settings.general === "object"
        && !Array.isArray(settings.general)
        ? settings.general as Record<string, unknown>
        : {};
      window.localStorage.setItem(input.appSettingsKey, JSON.stringify({
        ...settings,
        general: { ...general, brushCursorStyle: "none" },
      }));
      if (input.seed) {
        window.sessionStorage.setItem(input.cleanSessionKey, "1");
        window.localStorage.setItem(input.seed.key, input.seed.raw);
      } else if (window.sessionStorage.getItem(input.cleanSessionKey) !== "1") {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith(input.autosavePrefix)) window.localStorage.removeItem(key);
        }
        window.sessionStorage.setItem(input.cleanSessionKey, "1");
      }
    } catch {
      // Product assertions remain strict if local storage is unavailable.
    }
    monitor.initSteps.push("storage-configured");

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
              const type = typeof value.type === "string" ? value.type : "";
              if (type === "living-ink/initialize") monitor.livingInkInitializes += 1;
              if (type.startsWith("living-ink/")) {
                const operation = value.operation && typeof value.operation === "object"
                  ? value.operation as Record<string, unknown>
                  : {};
                const options = value.options && typeof value.options === "object"
                  ? value.options as Record<string, unknown>
                  : {};
                monitor.requests.push({
                  requestId: typeof value.requestId === "number" ? value.requestId : null,
                  type,
                  operationKind: typeof operation.kind === "string" ? operation.kind : null,
                  operationSequence: typeof operation.sequence === "number"
                    ? operation.sequence
                    : null,
                  markCount: Array.isArray(operation.marks) ? operation.marks.length : 0,
                  quality: typeof options.quality === "string" ? options.quality : null,
                });
              } else if (
                type === "studio-hokusai-live/begin"
                || type.startsWith("studio-live-ink/")
                || type.startsWith("studio-dynamic-brush/")
              ) {
                monitor.competingSpecialistMessages.push(type);
              }
            }
            if (transferOrOptions === undefined) nativePostMessage(message);
            else nativePostMessage(message, transferOrOptions);
          };
          worker.addEventListener("message", (event: MessageEvent<unknown>) => {
            if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
            const value = event.data as Record<string, unknown>;
            if (value.type === "living-ink/ready") {
              monitor.livingInkReady += 1;
              return;
            }
            if (value.type === "living-ink/error") {
              monitor.workerErrors.push(
                `${String(value.code ?? "unknown")}:${String(value.message ?? "unknown")}`,
              );
              return;
            }
            if (value.type !== "living-ink/frame") return;
            const frame = value.frame && typeof value.frame === "object"
              ? value.frame as Record<string, unknown>
              : {};
            const receipt = frame.receipt && typeof frame.receipt === "object"
              ? frame.receipt as Record<string, unknown>
              : {};
            monitor.frames.push({
              sequence: nextSequence(),
              requestId: typeof value.requestId === "number" ? value.requestId : null,
              operationKind: typeof receipt.operationKind === "string" ? receipt.operationKind : null,
              revision: typeof receipt.revision === "number" ? receipt.revision : null,
              displaySha256: typeof receipt.displaySha256 === "string"
                ? receipt.displaySha256
                : null,
              operationSha256: typeof receipt.operationSha256 === "string"
                ? receipt.operationSha256
                : null,
              backend: typeof receipt.backend === "string" ? receipt.backend : null,
              gpuError: typeof receipt.gpuError === "number" ? receipt.gpuError : null,
            });
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
    monitor.initSteps.push("worker-instrumented");

    let activeContact: MutableContact | null = null;
    const targetsCanvas = (event: PointerEvent): boolean => event.composedPath().some((target) => (
      target instanceof Element && target.classList.contains("konvajs-content")
    ));
    globalThis.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0 || !targetsCanvas(event)) return;
      activeContact = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        down: [event.clientX, event.clientY],
        moves: [],
        up: null,
        coalescedCalls: 0,
        coalescedSamples: 0,
        downAtMs: performance.now(),
        upAtMs: null,
      };
      monitor.pointerContacts.push(activeContact);
    }, true);
    globalThis.addEventListener("pointermove", (event) => {
      if (!(event instanceof PointerEvent) || activeContact?.pointerId !== event.pointerId) return;
      activeContact.moves.push([event.clientX, event.clientY]);
    }, true);
    const endContact = (event: Event): void => {
      if (!(event instanceof PointerEvent) || activeContact?.pointerId !== event.pointerId) return;
      activeContact.up = [event.clientX, event.clientY];
      activeContact.upAtMs = performance.now();
      activeContact = null;
    };
    globalThis.addEventListener("pointerup", endContact, true);
    globalThis.addEventListener("pointercancel", endContact, true);
    monitor.initSteps.push("pointer-instrumented");

    const nativeGetCoalescedEvents = PointerEvent.prototype.getCoalescedEvents;
    if (typeof nativeGetCoalescedEvents === "function") {
      Object.defineProperty(PointerEvent.prototype, "getCoalescedEvents", {
        configurable: true,
        writable: true,
        value(this: PointerEvent): PointerEvent[] {
          const coalesced = nativeGetCoalescedEvents.call(this);
          const contact = monitor.pointerContacts.find(({ pointerId }) => pointerId === this.pointerId);
          if (contact) {
            contact.coalescedCalls += 1;
            // An empty native batch is evidence that the API was called, not that one hardware
            // sample existed. Keep those authorities separate so synthetic Playwright input cannot
            // inflate the coalesced sample count.
            contact.coalescedSamples += coalesced.length;
          }
          return coalesced;
        },
      });
    }

    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    Object.defineProperty(CanvasRenderingContext2D.prototype, "drawImage", {
      configurable: true,
      writable: true,
      value(this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D["drawImage"]>) {
        const result = Reflect.apply(nativeDrawImage, this, args);
        if (this.canvas.dataset.studioLivingInkOverlay === "true") {
          monitor.overlayDraws += 1;
        }
        return result;
      },
    });
    monitor.initSteps.push("canvas-instrumented");

    const scanProductReceipts = (): void => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '[data-studio-living-ink-overlay="true"]',
      );
      if (overlay?.dataset.studioLivingInkPresentation === "presented") {
        const routeKey = overlay.dataset.studioLivingInkRouteKey ?? null;
        const displaySha256 = overlay.dataset.studioLivingInkDisplaySha256 ?? null;
        const revision = Number(overlay.dataset.studioLivingInkPresentationRevision);
        const last = monitor.presentations.at(-1);
        if (
          !last
          || last.routeKey !== routeKey
          || last.displaySha256 !== displaySha256
          || last.revision !== revision
        ) {
          monitor.presentations.push({
            sequence: nextSequence(),
            atMs: performance.now(),
            routeKey,
            displaySha256,
            revision: Number.isSafeInteger(revision) ? revision : null,
          });
        }
      }
      if (overlay?.dataset.studioLivingInkCanonicalHandoff === "presented") {
        const pngSha256 = overlay.dataset.studioLivingInkCanonicalPngSha256 ?? null;
        const last = monitor.canonicalHandoffs.at(-1);
        if (!last || last.pngSha256 !== pngSha256) {
          monitor.canonicalHandoffs.push({
            sequence: nextSequence(),
            atMs: performance.now(),
            pngSha256,
          });
        }
      }
      const controls = document.querySelector<HTMLElement>(
        '[data-studio-living-ink-controls="true"]',
      );
      const lastPresence = monitor.controlPresenceStates.at(-1);
      if (!lastPresence || lastPresence.present !== Boolean(controls)) {
        monitor.controlPresenceStates.push({
          sequence: nextSequence(),
          present: Boolean(controls),
        });
      }
      if (controls) {
        const state = controls.dataset.studioLivingInkState ?? "";
        const water = controls.querySelector<HTMLButtonElement>('[aria-label="수채 번짐 물"]');
        const fix = controls.querySelector<HTMLButtonElement>('[data-studio-living-ink-fix="true"]');
        const clear = controls.querySelector<HTMLButtonElement>('[data-studio-living-ink-clear="true"]');
        const next = {
          sequence: nextSequence(),
          state,
          waterDisabled: water?.disabled !== false,
          fixDisabled: fix?.disabled !== false,
          clearDisabled: clear?.disabled !== false,
        };
        const last = monitor.controlStates.at(-1);
        if (
          !last
          || last.state !== next.state
          || last.waterDisabled !== next.waterDisabled
          || last.fixDisabled !== next.fixDisabled
          || last.clearDisabled !== next.clearDisabled
        ) monitor.controlStates.push(next);
      }
      const statusText = document.querySelector<HTMLElement>(
        '[data-studio-global-status-rail] [role="status"]',
      )?.textContent?.trim();
      if (statusText && monitor.statusMessages.at(-1) !== statusText) {
        monitor.statusMessages.push(statusText);
      }
      if (overlay) {
        const nextSurface = {
          sequence: nextSequence(),
          connected: overlay.isConnected,
          width: overlay.width,
          height: overlay.height,
          left: overlay.style.left,
          top: overlay.style.top,
          cssWidth: overlay.style.width,
          cssHeight: overlay.style.height,
        };
        const lastSurface = monitor.overlaySurfaces.at(-1);
        if (
          !lastSurface
          || lastSurface.connected !== nextSurface.connected
          || lastSurface.width !== nextSurface.width
          || lastSurface.height !== nextSurface.height
          || lastSurface.left !== nextSurface.left
          || lastSurface.top !== nextSurface.top
          || lastSurface.cssWidth !== nextSurface.cssWidth
          || lastSurface.cssHeight !== nextSurface.cssHeight
        ) monitor.overlaySurfaces.push(nextSurface);
      }
    };
    const startObserver = (): void => {
      scanProductReceipts();
      const observer = new MutationObserver(() => queueMicrotask(scanProductReceipts));
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: [
          "data-studio-living-ink-state",
          "data-studio-living-ink-presentation",
          "data-studio-living-ink-route-key",
          "data-studio-living-ink-display-sha256",
          "data-studio-living-ink-presentation-revision",
          "data-studio-living-ink-canonical-handoff",
          "data-studio-living-ink-canonical-png-sha256",
          "disabled",
        ],
      });
    };
    if (document.documentElement) startObserver();
    else globalThis.addEventListener("DOMContentLoaded", startObserver, { once: true });
    monitor.initSteps.push("observer-instrumented");
    } catch (cause) {
      monitor.initSteps.push(
        `init-error:${cause instanceof Error ? `${cause.name}:${cause.message}` : String(cause)}`,
      );
    }
  };
  const input = {
    appSettingsKey: APP_SETTINGS_KEY,
    autosavePrefix: AUTOSAVE_PREFIX,
    cleanSessionKey: CLEAN_SESSION_KEY,
    mobileHintKey: MOBILE_HINT_KEY,
    quickstartKey: QUICKSTART_KEY,
    seed: seed ?? null,
  };
  // tsx preserves nested function names with an esbuild `__name` helper. Playwright serializes
  // only the callback body, so that module-scoped helper would otherwise be missing in Chromium.
  // Install a local no-op name helper in the same init script; it affects QA instrumentation only.
  await page.addInitScript({
    content: [
      "var __name = function(target) { return target; };",
      `(${monitorBootstrap.toString()})(${JSON.stringify(input)});`,
    ].join("\n"),
  });
}

async function readMonitor(page: Page): Promise<BrowserMonitorSnapshot> {
  return page.evaluate(() => {
    const monitor = (globalThis as typeof globalThis & {
      __studioLivingInkIntegrationMonitor?: BrowserMonitorSnapshot;
    }).__studioLivingInkIntegrationMonitor;
    if (!monitor) throw new Error("Living Ink integration monitor is unavailable");
    return structuredClone(monitor);
  });
}

async function readStoredDocument(
  page: Page,
  expectedKey?: string | null,
): Promise<StoredDocumentSnapshot> {
  return page.evaluate((input) => {
    type StoredDocument = {
      savedAt?: string;
      currentPageId?: string;
      pagesList?: Array<{ id?: string; elements?: unknown[] }>;
    };
    let newest: { key: string; raw: string; value: StoredDocument } | null = null;
    const keys = input.expectedKey
      ? [input.expectedKey]
      : Array.from({ length: window.localStorage.length }, (_, index) => (
          window.localStorage.key(index)
        ));
    for (const key of keys) {
      if (!key?.startsWith(input.prefix) || key.endsWith(":lifecycle")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw) as StoredDocument;
        if (!Array.isArray(value.pagesList)) continue;
        if (!newest || String(value.savedAt ?? "") >= String(newest.value.savedAt ?? "")) {
          newest = { key, raw, value };
        }
      } catch {
        // Keep looking for the newest valid Studio autosave.
      }
    }
    if (!newest) return { key: null, raw: null, savedAt: null, elements: [] };
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
        pointCount: Math.floor(points.length / 2),
        src: typeof value.src === "string" ? value.src : null,
        livingInkReceipt: value.livingInkReceipt ?? null,
      }];
    });
    return {
      key: newest.key,
      raw: newest.raw,
      savedAt: typeof newest.value.savedAt === "string" ? newest.value.savedAt : null,
      elements,
    };
  }, { expectedKey: expectedKey ?? null, prefix: AUTOSAVE_PREFIX });
}

async function waitForStoredDocument(
  page: Page,
  predicate: (snapshot: StoredDocumentSnapshot) => boolean,
  message: string,
  timeoutMilliseconds = 18_000,
  expectedKey?: string | null,
): Promise<StoredDocumentSnapshot> {
  const deadline = Date.now() + timeoutMilliseconds;
  let snapshot = await readStoredDocument(page, expectedKey);
  while (!predicate(snapshot) && Date.now() < deadline) {
    await page.waitForTimeout(150);
    snapshot = await readStoredDocument(page, expectedKey);
  }
  invariant(predicate(snapshot), message);
  return snapshot;
}

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(12_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator(".konvajs-content").first().waitFor({ state: "visible", timeout: 15_000 });
  const starter = page.locator('[data-studio-creative-starter="true"]');
  if (await starter.isVisible({ timeout: 250 }).catch(() => false)) {
    await starter.locator('[data-studio-quickstart-dismiss="true"]').click();
  }
}

async function activatePenAndWatercolor(
  page: Page,
  expectedState: "ready" | "failed" = "ready",
): Promise<void> {
  await page.keyboard.press("b");
  const mobileDock = page.locator('[data-studio-mobile-editing-dock="true"]');
  const mobileDockVisible = await mobileDock.isVisible({ timeout: 250 }).catch(() => false);
  const pickerSurface = mobileDockVisible
    ? await (async () => {
        const pen = mobileDock.getByRole("button", { name: /^(?:펜|Pen)$/u });
        if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
        const drawSheet = page.locator(`#${MOBILE_DRAW_SETTINGS_ID}`);
        if (await drawSheet.getAttribute("data-studio-mobile-sheet") !== "draw") {
          await pen.click();
        }
        await page.waitForFunction((id) => (
          document.getElementById(id)?.getAttribute("data-studio-mobile-sheet") === "draw"
        ), MOBILE_DRAW_SETTINGS_ID, { timeout: 8_000 });
        return drawSheet;
      })()
    : await (async () => {
        const toolbar = page.locator('[data-studio-draw-options="true"]');
        await toolbar.waitFor({ state: "visible", timeout: 8_000 });
        const pen = toolbar.getByRole("button", { name: "펜", exact: true });
        if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
        return toolbar;
      })();
  const catalogTrigger = pickerSurface.locator(
    mobileDockVisible
      ? '[data-studio-open-brush-library="true"]'
      : '[data-studio-brush-active-pill="true"]',
  );
  await catalogTrigger.waitFor({ state: "visible" });
  await catalogTrigger.click();
  const catalogue = page.locator('[data-studio-brush-catalog-session="true"]');
  await catalogue.waitFor({ state: "visible" });
  await catalogue.getByRole("searchbox", { name: "전체 브러시 검색" }).fill(BRUSH.id);
  await catalogue.getByRole("button", { name: `${BRUSH.name} 선택`, exact: true }).click();
  await catalogue.waitFor({ state: "detached" });
  await page.waitForFunction((expectedName) => (
    document.querySelector('[data-studio-brush-active-pill="true"]')
      ?.getAttribute("aria-label")
      ?.includes(expectedName) === true
  ), BRUSH.name);
  const controls = page.locator('[data-studio-living-ink-controls="true"]');
  await controls.waitFor({ state: "visible", timeout: 12_000 });
  const physicalMode = controls.getByRole("button", {
    name: "수채 번짐 물리 모드",
    exact: true,
  });
  if (await physicalMode.getAttribute("aria-pressed") !== "true") {
    await physicalMode.click();
  }
  try {
    await page.waitForFunction((state) => (
      document.querySelector('[data-studio-living-ink-controls="true"]')
        ?.getAttribute("data-studio-living-ink-state") === state
    ), expectedState, { timeout: 18_000 });
  } catch (cause) {
    const monitor = await readMonitor(page);
    const stored = await readStoredDocument(page);
    writeFileSync(
      join(SCRATCH, "positive-06-reopen-failed-monitor.json"),
      `${JSON.stringify(monitor, null, 2)}\n`,
    );
    writeFileSync(
      join(SCRATCH, "positive-06-reopen-failed-autosave.json"),
      stored.raw ?? `${JSON.stringify(stored, null, 2)}\n`,
    );
    await page.screenshot({
      path: join(SCRATCH, "positive-06-reopen-failed.png"),
      animations: "disabled",
    });
    throw new Error(
      `Living Ink controls did not become ${expectedState}: ${JSON.stringify({
        state: await controls.getAttribute("data-studio-living-ink-state"),
        text: (await controls.textContent())?.trim() ?? "",
        requests: monitor.requests.length,
        frames: monitor.frames.length,
        workerErrors: monitor.workerErrors,
        controlStates: monitor.controlStates,
      })}`,
      { cause },
    );
  }
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
  ), expected, { timeout: 15_000 });
  return page.locator('[data-studio-layer-row="true"]').count();
}

interface ScreenPoint { readonly x: number; readonly y: number }

async function authoritativePointerRoute(page: Page): Promise<readonly ScreenPoint[]> {
  const stage = page.locator(".konvajs-content").first();
  const box = await stage.boundingBox();
  const viewport = page.viewportSize();
  invariant(box && viewport, "Studio canvas bounds are unavailable");
  const left = Math.max(box.x + 95, viewport.width * 0.32);
  const right = Math.min(box.x + box.width - 95, viewport.width * 0.72);
  const centerY = Math.max(box.y + 175, viewport.height * 0.44);
  invariant(right - left >= 360, "Studio canvas is too narrow for the Living Ink route");
  const points = Array.from({ length: 81 }, (_, index) => {
    const progress = index / 80;
    return {
      x: left + (right - left) * progress,
      y: centerY
        + Math.sin(progress * Math.PI * 3.25) * 48
        + Math.sin(progress * Math.PI * 11) * 6,
    };
  });
  const misses = await page.evaluate((route) => route.flatMap((point) => (
    document.elementFromPoint(point.x, point.y)?.closest(".konvajs-content") ? [] : [point]
  )), points);
  invariant(misses.length === 0, `Living Ink route is covered by editor chrome: ${JSON.stringify(misses)}`);
  return points;
}

async function drawAuthoritativeRoute(
  page: Page,
  points: readonly ScreenPoint[],
  liveScreenshot: string,
): Promise<void> {
  const before = await readMonitor(page);
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  let released = false;
  try {
    for (const point of points.slice(1)) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(3);
    }
    try {
      await page.waitForFunction((watermark) => {
        const monitor = (globalThis as typeof globalThis & {
          __studioLivingInkIntegrationMonitor?: BrowserMonitorSnapshot;
        }).__studioLivingInkIntegrationMonitor;
        return Boolean(
          monitor
          && monitor.presentations.length > watermark.presentations
          && monitor.overlayDraws > watermark.overlayDraws
        );
      }, {
        presentations: before.presentations.length,
        overlayDraws: before.overlayDraws,
      }, { timeout: 18_000 });
    } catch (error) {
      const monitor = await readMonitor(page);
      await page.mouse.up().catch(() => undefined);
      released = true;
      await page.waitForTimeout(750);
      const stored = await readStoredDocument(page);
      writeFileSync(
        join(SCRATCH, "positive-00-live-timeout-monitor.json"),
        `${JSON.stringify(monitor, null, 2)}\n`,
      );
      writeFileSync(
        join(SCRATCH, "positive-00-live-timeout-autosave.json"),
        stored.raw ?? `${JSON.stringify(stored, null, 2)}\n`,
      );
      await page.screenshot({
        path: join(SCRATCH, "positive-00-live-timeout.png"),
        animations: "disabled",
      });
      throw new Error(
        `Living Ink produced no visible live presentation: ${JSON.stringify({
          livingInkInitializes: monitor.livingInkInitializes,
          livingInkReady: monitor.livingInkReady,
          requestCount: monitor.requests.length,
          frameCount: monitor.frames.length,
          presentationCount: monitor.presentations.length,
          overlayDraws: monitor.overlayDraws,
          workerErrors: monitor.workerErrors,
          competingSpecialistMessages: monitor.competingSpecialistMessages,
          pointerContacts: monitor.pointerContacts.map(pointerSampleCount),
        })}`,
        { cause: error },
      );
    }
    await page.screenshot({ path: liveScreenshot, animations: "disabled" });
    await page.mouse.up();
    released = true;
  } finally {
    if (!released) await page.mouse.up().catch(() => undefined);
  }
  await page.mouse.move(4, 4);
}

function pointerSampleCount(contact: PointerContactEvidence | undefined): number {
  return contact ? 1 + contact.moves.length : 0;
}

async function restoreAutosave(page: Page): Promise<number> {
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 15_000 });
  const banner = page.getByText("이전에 작성 중이던 임시저장 데이터가 있습니다.", { exact: false });
  await banner.waitFor({ state: "visible", timeout: 12_000 });
  // Reload creates a fresh in-page monitor. Record its sequence immediately before the user-owned
  // restore action so initial blank-document loading/ready states cannot satisfy replay evidence.
  const restoreSequenceWatermark = (await readMonitor(page)).sequence;
  await page.getByRole("button", { name: "복구하기", exact: true }).click();
  await banner.waitFor({ state: "detached", timeout: 12_000 });
  return restoreSequenceWatermark;
}

async function reloadStudioAfterDurableWriterRelease(
  page: Page,
  studioUrl: string,
): Promise<void> {
  log("unmounting Studio before fresh-document recovery proof");
  // A hard reload can terminate the document before React's async OPFS cleanup finishes, leaving
  // the old 30-second fencing record behind even though its browser context no longer edits. Move
  // through a shipped SPA route first so Studio unmounts while the document is still alive, and
  // prove both durable writers released their exact lease files before starting a fresh document.
  await page.evaluate(() => {
    // Stay inside the isolated Studio route family. Leaving for a public route intentionally
    // reloads the document to drop COOP/COEP, which would kill async writer cleanup mid-release.
    globalThis.history.pushState(
      {},
      "",
      "/studio/tools-companion?studio-living-ink-verifier-release=1",
    );
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.locator('[data-studio-editor="true"]').waitFor({
    state: "detached",
    timeout: 12_000,
  });
  const inspectDurableWriters = () => page.evaluate(async () => {
    type DirectoryWithEntries = FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    if (typeof navigator.storage?.getDirectory !== "function") {
      return { writerPaths: ["OPFS-unavailable"], recoveryLockCount: 0 };
    }
    type QueryableLockManager = LockManager & {
      query?: () => Promise<{
        held: Array<{ name?: string }>;
        pending: Array<{ name?: string }>;
      }>;
    };
    const lockManager = navigator.locks as QueryableLockManager | undefined;
    const lockSnapshot = await lockManager?.query?.();
    const recoveryLockCount = [
      ...(lockSnapshot?.held ?? []),
      ...(lockSnapshot?.pending ?? []),
    ].filter(
      ({ name }) => name?.startsWith("toonspectrum-opfs-recovery:") === true,
    ).length;
    const opfsRoot = await navigator.storage.getDirectory();
    const writerPaths: string[] = [];
    const pending: Array<{ directory: FileSystemDirectoryHandle; prefix: string }> = [{
      directory: opfsRoot,
      prefix: "",
    }];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) break;
      for await (const [name, handle] of (current.directory as DirectoryWithEntries).entries()) {
        const path = current.prefix ? `${current.prefix}/${name}` : name;
        if (handle.kind === "file" && name === "writer-lease.bin") {
          writerPaths.push(path);
        }
        if (handle.kind === "directory") {
          pending.push({ directory: handle as FileSystemDirectoryHandle, prefix: path });
        }
      }
    }
    return { writerPaths: writerPaths.sort(), recoveryLockCount };
  });
  let leaseFreeSince: number | null = null;
  let latestWriterState = await inspectDurableWriters();
  const releaseDeadline = Date.now() + 12_000;
  while (Date.now() < releaseDeadline) {
    latestWriterState = await inspectDurableWriters();
    if (
      latestWriterState.writerPaths.length === 0
      && latestWriterState.recoveryLockCount === 0
    ) {
      leaseFreeSince ??= Date.now();
      if (Date.now() - leaseFreeSince >= 1_500) break;
    } else {
      leaseFreeSince = null;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  invariant(
    leaseFreeSince !== null
      && Date.now() - leaseFreeSince >= 1_500
      && latestWriterState.writerPaths.length === 0
      && latestWriterState.recoveryLockCount === 0,
    `Studio durable writers did not release stably: ${JSON.stringify(latestWriterState)}`,
  );
  log("Studio durable writers stayed released for 1.5s; opening a fresh document");
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
}

function mutateAutosave(
  raw: string,
  corruption: StudioLivingInkFailClosedEvidence["corruption"],
): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const pages = Array.isArray(parsed.pagesList) ? parsed.pagesList : [];
  let changed = false;
  for (const page of pages) {
    if (!record(page) || !Array.isArray(page.elements)) continue;
    for (const element of page.elements) {
      if (!record(element) || !record(element.livingInkReceipt)) continue;
      const receipt = element.livingInkReceipt;
      if (receipt.kind !== "studio-living-ink/document-receipt") continue;
      if (corruption === "canonical-png-hash") {
        const current = receipt.canonicalPngSha256;
        receipt.canonicalPngSha256 = current === `sha256:${"d".repeat(64)}`
          ? `sha256:${"c".repeat(64)}`
          : `sha256:${"d".repeat(64)}`;
        changed = true;
      }
      if (corruption === "final-receipt-hash" && record(receipt.finalExecutionReceipt)) {
        const current = receipt.finalExecutionReceipt.displaySha256;
        receipt.finalExecutionReceipt.displaySha256 = current === `sha256:${"f".repeat(64)}`
          ? `sha256:${"e".repeat(64)}`
          : `sha256:${"f".repeat(64)}`;
        changed = true;
      }
      if (corruption === "journal-sequence" && Array.isArray(receipt.journal) && receipt.journal[0]) {
        const first = receipt.journal[0];
        if (record(first)) {
          first.sequence = 999;
          changed = true;
        }
      }
    }
  }
  invariant(changed, `could not inject ${corruption} corruption into Studio autosave`);
  return JSON.stringify(parsed);
}

async function runPositive(
  browser: Browser,
  studioUrl: string,
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<Readonly<{
  evidence: StudioLivingInkPositiveEvidence;
  autosaveKey: string;
  autosaveRaw: string;
  canonicalPngSha256: string;
  canonicalPngDataSha256: string;
}>> {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 1_000 } });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, "positive", studioUrl);
  const screenshotLive = join(SCRATCH, "positive-01-live.png");
  const screenshotBlank = join(SCRATCH, "positive-00-blank.png");
  const screenshotCommitted = join(SCRATCH, "positive-02-committed.png");
  const screenshotReloaded = join(SCRATCH, "positive-03-reloaded.png");
  const screenshotFixed = join(SCRATCH, "positive-04-fixed.png");
  const screenshotFixedAfterWater = join(SCRATCH, "positive-05-fixed-after-water.png");
  try {
    await installStudioMonitor(page);
    await prepareStudio(page, studioUrl);
    await activatePenAndWatercolor(page);
    await page.locator('[data-studio-living-ink-overlay="true"]').waitFor({ state: "attached" });
    await openLayerNavigator(page);
    const blankNativePageElementCount = await waitForLayerCount(page, 0);
    const stageBox = await page.locator(".konvajs-content").first().boundingBox();
    invariant(stageBox, "Studio canvas bounds are unavailable for the untouched-paper proof");
    const untouchedPaperPatch = Object.freeze({
      x: Math.floor(stageBox.x + 80),
      y: Math.floor(stageBox.y + 48),
      width: 160,
      height: 120,
    });
    await page.screenshot({ path: screenshotBlank, animations: "disabled" });
    const route = await authoritativePointerRoute(page);
    await drawAuthoritativeRoute(page, route, screenshotLive);
    await waitForLayerCount(page, 2);
    const committedStageBox = await page.locator(".konvajs-content").first().boundingBox();
    invariant(committedStageBox, "Studio canvas bounds disappeared after canonical handoff");
    const canonicalHandoffViewportMaxDelta = Math.max(
      Math.abs(stageBox.x - committedStageBox.x),
      Math.abs(stageBox.y - committedStageBox.y),
      Math.abs(stageBox.width - committedStageBox.width),
      Math.abs(stageBox.height - committedStageBox.height),
    );
    const canonicalHandoffSelectedLayerCount = await page.locator(
      '[data-studio-layer-row="true"][aria-selected="true"]',
    ).count();
    await page.waitForFunction(() => {
      const monitor = (globalThis as typeof globalThis & {
        __studioLivingInkIntegrationMonitor?: BrowserMonitorSnapshot;
      }).__studioLivingInkIntegrationMonitor;
      return Boolean(monitor && monitor.canonicalHandoffs.length > 0);
    }, undefined, { timeout: 18_000 });
    const committed = await waitForStoredDocument(
      page,
      (snapshot) => canonicalPair(snapshot) !== null && snapshot.elements.length === 2,
      "pointerup did not autosave one Living Ink canonical pair",
    );
    const committedPair = canonicalPair(committed);
    invariant(committedPair, "committed Living Ink pair is missing");
    invariant(committed.key && committed.raw, "committed autosave authority is missing");
    const receipt = committedPair.receipt;
    const storedCanonicalPngSha256 = pngDataUrlSha256(committedPair.image.src);
    invariant(storedCanonicalPngSha256, "stored canonical PNG data URL could not be hashed");
    const canonicalUntouchedAlpha = inspectCanonicalUntouchedAlpha(committedPair.image.src);
    await page.screenshot({ path: screenshotCommitted, animations: "disabled" });
    const untouchedPaperPatchDiff = compareScreenshotRgbPatch(
      screenshotBlank,
      screenshotCommitted,
      untouchedPaperPatch,
    );
    const preHistoryMonitor = await readMonitor(page);
    invariant(preHistoryMonitor.workerErrors.length === 0, `Living Ink Worker errors: ${preHistoryMonitor.workerErrors.join(", ")}`);

    await page.keyboard.press("Meta+z");
    const undoLayerCount = await waitForLayerCount(page, 0);
    const undone = await waitForStoredDocument(
      page,
      (snapshot) => snapshot.elements.length === 0,
      "Undo changed the layer navigator but did not remove the Living Ink pair from the stored model",
      18_000,
      committed.key,
    );
    await page.keyboard.press("Meta+Shift+z");
    const redoLayerCount = await waitForLayerCount(page, 2);
    const redone = await waitForStoredDocument(
      page,
      (snapshot) => canonicalPair(snapshot) !== null && snapshot.elements.length === 2,
      "Redo did not restore the Living Ink pair",
      18_000,
      committed.key,
    );
    const redonePair = canonicalPair(redone);
    invariant(redonePair, "redone Living Ink pair is missing");

    await reloadStudioAfterDurableWriterRelease(page, studioUrl);
    const restoreSequenceWatermark = await restoreAutosave(page);
    await openLayerNavigator(page);
    const reloadLayerCount = await waitForLayerCount(page, 2);
    const reloaded = await readStoredDocument(page, committed.key);
    const reloadedPair = canonicalPair(reloaded);
    invariant(reloadedPair, "reload did not preserve the flattened Living Ink pair");
    // Document recovery intentionally starts in selection mode. Re-enter the ordinary pen and
    // brush UI before asserting editable physical controls instead of reaching into React state.
    await activatePenAndWatercolor(page);
    const controls = page.locator('[data-studio-living-ink-controls="true"]');
    await controls.waitFor({ state: "visible", timeout: 12_000 });
    try {
      await page.waitForFunction((expected) => {
        const monitor = (globalThis as typeof globalThis & {
          __studioLivingInkIntegrationMonitor?: BrowserMonitorSnapshot;
        }).__studioLivingInkIntegrationMonitor;
        if (!monitor) return false;
        const acceptedFrame = monitor.frames.find((frame) => (
          frame.sequence > expected.watermark
          && frame.displaySha256 === expected.displaySha256
          && frame.operationSha256 === expected.operationSha256
        ));
        if (!acceptedFrame) return false;
        return monitor.controlStates.some((state) => (
          state.sequence > acceptedFrame.sequence
          && state.state === "ready"
          && !state.waterDisabled
          && !state.fixDisabled
          && !state.clearDisabled
        ));
      }, {
        watermark: restoreSequenceWatermark,
        displaySha256: receipt.displaySha256,
        operationSha256: receipt.operationSha256,
      }, { timeout: 18_000 });
    } catch (cause) {
      const failedMonitor = await readMonitor(page);
      writeFileSync(
        join(SCRATCH, "positive-03-replay-failed-monitor.json"),
        `${JSON.stringify(failedMonitor, null, 2)}\n`,
      );
      await page.screenshot({
        path: join(SCRATCH, "positive-03-replay-failed.png"),
        animations: "disabled",
      });
      throw new Error(
        `accepted replay frame did not unlock physical controls: ${JSON.stringify({
          watermark: restoreSequenceWatermark,
          displaySha256: receipt.displaySha256,
          operationSha256: receipt.operationSha256,
          frames: failedMonitor.frames,
          controlStates: failedMonitor.controlStates,
          workerErrors: failedMonitor.workerErrors,
        })}`,
        { cause },
      );
    }
    const waterButton = controls.getByRole("button", { name: "수채 번짐 물", exact: true });
    const fixButton = controls.locator('[data-studio-living-ink-fix="true"]');
    const clearButton = controls.locator('[data-studio-living-ink-clear="true"]');
    invariant(!(await waterButton.isDisabled()), "water stayed disabled after accepted replay");
    invariant(!(await fixButton.isDisabled()), "Fix stayed disabled after accepted replay");
    invariant(!(await clearButton.isDisabled()), "clear stayed disabled after accepted replay");
    const fixEnabledAfterReplay = !(await fixButton.isDisabled());
    await page.screenshot({ path: screenshotReloaded, animations: "disabled" });

    const reloadMonitor = await readMonitor(page);
    const replayAcceptedFrame = reloadMonitor.frames.find((frame) => (
      frame.sequence > restoreSequenceWatermark
      && frame.displaySha256 === receipt.displaySha256
      && frame.operationSha256 === receipt.operationSha256
    )) ?? null;
    const replayPreAcceptanceControls = replayAcceptedFrame
      ? reloadMonitor.controlStates.filter((state) => (
          state.sequence > restoreSequenceWatermark
          && state.sequence < replayAcceptedFrame.sequence
        ))
      : [];
    const replayPresenceBeforeAccepted = replayAcceptedFrame
      ? reloadMonitor.controlPresenceStates.findLast((state) => (
          state.sequence < replayAcceptedFrame.sequence
        )) ?? null
      : null;
    const replayControlsAbsentBeforeAcceptedFrame = Boolean(
      replayPresenceBeforeAccepted && !replayPresenceBeforeAccepted.present,
    );
    const replayReady = replayAcceptedFrame
      ? reloadMonitor.controlStates.filter((state) => (
          state.sequence > replayAcceptedFrame.sequence && state.state === "ready"
        ))
      : [];
    const contact = preHistoryMonitor.pointerContacts[0];
    const workerFinal = preHistoryMonitor.frames.findLast((frame) => (
      frame.displaySha256 === receipt.displaySha256
      && frame.operationSha256 === receipt.operationSha256
    ));
    // A long native route legitimately presents several interactive frames. Bind evidence to the
    // final Worker hashes persisted in the canonical receipt instead of accidentally comparing
    // the very first live preview against the pointer-up result.
    const handoff = preHistoryMonitor.canonicalHandoffs.findLast((candidate) => (
      candidate.pngSha256 === receipt.canonicalPngSha256
    )) ?? null;
    const firstPresentation = preHistoryMonitor.presentations.find((candidate) => (
      candidate.routeKey === receipt.routeKey
    )) ?? null;
    const physicalFirstPixelLatencyMs = contact && firstPresentation
      ? Math.max(0, firstPresentation.atMs - contact.downAtMs)
      : -1;
    const physicalCanonicalHandoffLatencyMs = contact?.upAtMs !== null
      && contact?.upAtMs !== undefined
      && handoff
      ? Math.max(0, handoff.atMs - contact.upAtMs)
      : -1;
    const presentation = preHistoryMonitor.presentations.findLast((candidate) => (
      candidate.routeKey === receipt.routeKey
      && candidate.displaySha256 === receipt.displaySha256
      && candidate.revision === workerFinal?.revision
      && (!handoff || candidate.sequence < handoff.sequence)
    )) ?? null;
    const source = committedPair.sources[0];
    const presentationBeforeCanonicalHandoff = Boolean(
      presentation && handoff && presentation.sequence < handoff.sequence,
    );

    await fixButton.click();
    const fixed = await waitForStoredDocument(
      page,
      (snapshot) => {
        const pair = canonicalPair(snapshot);
        return Boolean(
          pair
          && pair.receipt.routeKey !== reloadedPair.receipt.routeKey
          && pair.receipt.journalKinds.at(-1) === "fix"
        );
      },
      "Fix did not commit one canonical Living Ink action",
      18_000,
      committed.key,
    );
    const fixedPair = canonicalPair(fixed);
    invariant(fixedPair, "Fix removed the canonical Living Ink pair");
    const fixedPngSha256 = pngDataUrlSha256(fixedPair.image.src);
    invariant(fixedPngSha256, "fixed canonical PNG could not be hashed");
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-studio-living-ink-controls="true"]');
      const fix = root?.querySelector<HTMLButtonElement>('[data-studio-living-ink-fix="true"]');
      return root?.getAttribute("data-studio-living-ink-state") === "ready" && fix?.disabled === false;
    }, undefined, { timeout: 18_000 });
    await page.screenshot({ path: screenshotFixed, animations: "disabled" });

    await page.keyboard.press("Meta+z");
    const fixUndone = await waitForStoredDocument(
      page,
      (snapshot) => JSON.stringify(canonicalPair(snapshot)?.receipt) === JSON.stringify(reloadedPair.receipt),
      "Undo did not restore the exact pre-Fix receipt",
      18_000,
      committed.key,
    );
    await page.keyboard.press("Meta+Shift+z");
    const fixRedone = await waitForStoredDocument(
      page,
      (snapshot) => JSON.stringify(canonicalPair(snapshot)?.receipt) === JSON.stringify(fixedPair.receipt),
      "Redo did not restore the exact Fix receipt",
      18_000,
      committed.key,
    );
    await page.waitForFunction(() => (
      document.querySelector('[data-studio-living-ink-controls="true"]')
        ?.getAttribute("data-studio-living-ink-state") === "ready"
    ), undefined, { timeout: 18_000 });

    await waterButton.click();
    const waterModeSelectableAfterReplay = await waterButton.getAttribute("aria-pressed") === "true";
    const fixedWaterRoute = await authoritativePointerRoute(page);
    await drawAuthoritativeRoute(page, fixedWaterRoute, screenshotFixedAfterWater);
    const fixedAfterWater = await waitForStoredDocument(
      page,
      (snapshot) => {
        const pair = canonicalPair(snapshot);
        const fixIndex = pair?.receipt.journalKinds.lastIndexOf("fix") ?? -1;
        const waterIndex = pair?.receipt.journalKinds.lastIndexOf("water") ?? -1;
        return Boolean(
          pair
          && snapshot.elements.length === 3
          && fixIndex >= 0
          && waterIndex > fixIndex
          && pair.receipt.journalKinds.at(-1) === "advance"
        );
      },
      "Water after Fix did not commit through the canonical Living Ink route",
      18_000,
      committed.key,
    );
    // Selecting the brush restores the property inspector by design. Re-open Layers only after
    // autosave proves the canonical action finished, then verify the same three stored elements
    // are represented in the navigator instead of mistaking a hidden tab for an empty document.
    await openLayerNavigator(page);
    await waitForLayerCount(page, 3);
    const fixedAfterWaterPair = canonicalPair(fixedAfterWater);
    invariant(fixedAfterWaterPair, "Water after Fix removed the canonical Living Ink pair");
    const fixedAfterWaterPngSha256 = pngDataUrlSha256(fixedAfterWaterPair.image.src);
    invariant(fixedAfterWaterPngSha256, "Water-after-Fix canonical PNG could not be hashed");
    await page.screenshot({ path: screenshotFixedAfterWater, animations: "disabled" });

    await page.keyboard.press("Meta+z");
    await waitForLayerCount(page, 2);
    const fixedWaterUndone = await waitForStoredDocument(
      page,
      (snapshot) => JSON.stringify(canonicalPair(snapshot)?.receipt) === JSON.stringify(fixedPair.receipt),
      "Undo after fixed-pigment Water did not restore the exact Fix receipt",
      18_000,
      committed.key,
    );
    await page.keyboard.press("Meta+Shift+z");
    await waitForLayerCount(page, 3);
    const fixedWaterRedone = await waitForStoredDocument(
      page,
      (snapshot) => JSON.stringify(canonicalPair(snapshot)?.receipt) === JSON.stringify(fixedAfterWaterPair.receipt),
      "Redo after fixed-pigment Water did not restore its exact receipt",
      18_000,
      committed.key,
    );

    await reloadStudioAfterDurableWriterRelease(page, studioUrl);
    await restoreAutosave(page);
    await openLayerNavigator(page);
    await waitForLayerCount(page, 3);
    const fixedWaterReloaded = await readStoredDocument(page, committed.key);
    const fixedWaterReloadedPair = canonicalPair(fixedWaterReloaded);
    invariant(fixedWaterReloadedPair, "reload removed the fixed-pigment Water receipt");
    return {
      evidence: {
        blankNativePageElementCount: blankNativePageElementCount as 0,
        brushId: BRUSH.id,
        workerInitializeCount: preHistoryMonitor.livingInkInitializes,
        workerReadyCount: preHistoryMonitor.livingInkReady,
        depositOperationCount: preHistoryMonitor.requests.filter(({ operationKind }) => (
          operationKind === "ink" || operationKind === "water"
        )).length,
        advanceOperationCount: preHistoryMonitor.requests.filter(({ operationKind }) => operationKind === "advance").length,
        competingSpecialistMessageCount: preHistoryMonitor.competingSpecialistMessages.length,
        trustedPointerSampleCount: pointerSampleCount(contact),
        coalescedApiCallCount: contact?.coalescedCalls ?? 0,
        coalescedSampleCount: contact?.coalescedSamples ?? 0,
        persistedSourcePointCount: source?.pointCount ?? 0,
        strictRouteKey: receipt.routeKey,
        presentationReceipt: presentation,
        canonicalHandoffReceipt: handoff,
        overlayDrawCount: preHistoryMonitor.overlayDraws,
        presentationBeforeCanonicalHandoff,
        canonicalPairElementCount: committed.elements.length,
        hiddenSourceCount: committedPair.sources.filter(({ hidden }) => hidden).length,
        visibleCanonicalPngCount: committed.elements.filter((element) => (
          element.type === "image" && !element.hidden && element.src?.startsWith("data:image/png;base64,")
        )).length,
        canonicalReceiptCount: committed.elements.filter((element) => (
          exactLivingInkReceipt(element.livingInkReceipt) !== null
        )).length,
        storedCanonicalPngHashMatched: storedCanonicalPngSha256 === receipt.canonicalPngSha256,
        workerFinalHashMatched: Boolean(workerFinal && presentation && handoff)
          && presentation?.displaySha256 === receipt.displaySha256
          && handoff?.pngSha256 === receipt.canonicalPngSha256,
        physicalFirstPixelLatencyMs,
        physicalCanonicalHandoffLatencyMs,
        untouchedPaperPatchChangedPixels: untouchedPaperPatchDiff.changedPixels,
        untouchedPaperPatchMaxChannelDelta: untouchedPaperPatchDiff.maxChannelDelta,
        canonicalUntouchedAlphaSampleCount: canonicalUntouchedAlpha.sampleCount,
        canonicalUntouchedNonTransparentPixels: canonicalUntouchedAlpha.nonTransparentPixels,
        canonicalUntouchedMaxAlpha: canonicalUntouchedAlpha.maxAlpha,
        canonicalHandoffSelectedLayerCount,
        canonicalHandoffViewportMaxDelta,
        undoLayerCount,
        undoStoredElementCount: undone.elements.length,
        redoLayerCount,
        reloadLayerCount,
        redoReceiptPreserved: JSON.stringify(redonePair.receipt) === JSON.stringify(receipt),
        reloadReceiptPreserved: JSON.stringify(reloadedPair.receipt) === JSON.stringify(receipt),
        replayAcceptedFrameObserved: Boolean(replayAcceptedFrame),
        replayPreAcceptanceControlStateCount: replayPreAcceptanceControls.length,
        replayControlsAbsentBeforeAcceptedFrame,
        replayControlsFailClosedBeforeAcceptedFrame:
          Boolean(replayAcceptedFrame)
          && replayPreAcceptanceControls.every(
            ({ waterDisabled, fixDisabled, clearDisabled }) => (
              waterDisabled && fixDisabled && clearDisabled
            ),
          )
          && (
            replayControlsAbsentBeforeAcceptedFrame
            || replayPreAcceptanceControls.length > 0
          ),
        physicsReadyAfterAcceptedHash: Boolean(replayAcceptedFrame) && replayReady.some(({ waterDisabled, fixDisabled, clearDisabled }) => (
          !waterDisabled && !fixDisabled && !clearDisabled
        )),
        waterModeSelectableAfterReplay,
        fixEnabledAfterReplay,
        fixJournalCommitted: fixedPair.receipt.journalKinds.at(-1) === "fix",
        fixCanonicalPngHashMatched: fixedPngSha256 === fixedPair.receipt.canonicalPngSha256,
        fixUndoRestoredPriorReceipt:
          JSON.stringify(canonicalPair(fixUndone)?.receipt) === JSON.stringify(reloadedPair.receipt),
        fixRedoRestoredReceipt:
          JSON.stringify(canonicalPair(fixRedone)?.receipt) === JSON.stringify(fixedPair.receipt),
        waterAfterFixJournalCommitted:
          fixedAfterWaterPair.receipt.journalKinds.lastIndexOf("water")
            > fixedAfterWaterPair.receipt.journalKinds.lastIndexOf("fix"),
        fixedWaterCanonicalPngHashMatched:
          fixedAfterWaterPngSha256 === fixedAfterWaterPair.receipt.canonicalPngSha256,
        fixedPigmentInvariantGate: FIXED_PIGMENT_INVARIANT_GATE,
        fixedWaterUndoRestoredFixReceipt:
          JSON.stringify(canonicalPair(fixedWaterUndone)?.receipt) === JSON.stringify(fixedPair.receipt),
        fixedWaterRedoRestoredReceipt:
          JSON.stringify(canonicalPair(fixedWaterRedone)?.receipt) === JSON.stringify(fixedAfterWaterPair.receipt),
        fixedWaterReloadReceiptPreserved:
          JSON.stringify(fixedWaterReloadedPair.receipt) === JSON.stringify(fixedAfterWaterPair.receipt),
        screenshotLive,
        screenshotBlank,
        screenshotCommitted,
        screenshotReloaded,
        screenshotFixed,
        screenshotFixedAfterWater,
      },
      autosaveKey: committed.key,
      autosaveRaw: committed.raw,
      canonicalPngSha256: receipt.canonicalPngSha256,
      canonicalPngDataSha256: storedCanonicalPngSha256,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

async function runFailClosed(
  browser: Browser,
  studioUrl: string,
  seed: Readonly<{
    key: string;
    raw: string;
    canonicalPngSha256: string;
    canonicalPngDataSha256: string;
  }>,
  corruption: StudioLivingInkFailClosedEvidence["corruption"],
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioLivingInkFailClosedEvidence> {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 1_000 } });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, corruption, studioUrl);
  const screenshot = join(SCRATCH, `fail-closed-${corruption}.png`);
  try {
    await installStudioMonitor(page, {
      key: seed.key,
      raw: mutateAutosave(seed.raw, corruption),
    });
    await prepareStudio(page, studioUrl);
    await restoreAutosave(page);
    // Recovery intentionally returns to selection mode. Re-enter the same shipped pen/brush UI
    // used by the positive route before asserting fail-closed state; otherwise the specialist
    // controls are correctly absent and this verifier only measures a hidden-panel timeout.
    await activatePenAndWatercolor(page, "failed");
    await openLayerNavigator(page);
    await waitForLayerCount(page, 2);
    const controls = page.locator('[data-studio-living-ink-controls="true"]');
    await controls.waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForFunction(() => (
      document.querySelector('[data-studio-living-ink-controls="true"]')
        ?.getAttribute("data-studio-living-ink-state") === "failed"
    ), undefined, { timeout: 18_000 });
    const state = await controls.getAttribute("data-studio-living-ink-state") ?? "";
    const waterButton = controls.getByRole("button", { name: "수채 번짐 물", exact: true });
    const fixButton = controls.locator('[data-studio-living-ink-fix="true"]');
    const clearButton = controls.locator('[data-studio-living-ink-clear="true"]');
    const stored = await readStoredDocument(page, seed.key);
    const pair = canonicalPair(stored);
    invariant(pair, `${corruption}: flattened canonical pair disappeared`);
    await page.screenshot({ path: screenshot, animations: "disabled" });
    return {
      corruption,
      state,
      visibleCanonicalPngCount: stored.elements.filter((element) => (
        element.type === "image" && !element.hidden && element.src?.startsWith("data:image/png;base64,")
      )).length,
      hiddenSourceCount: pair.sources.filter(({ hidden }) => hidden).length,
      canonicalPngSha256Preserved: pair.receipt.canonicalPngSha256 === seed.canonicalPngSha256,
      canonicalPngBytesPreserved: pngDataUrlSha256(pair.image.src) === seed.canonicalPngDataSha256,
      waterDisabled: await waterButton.isDisabled(),
      fixDisabled: await fixButton.isDisabled(),
      clearDisabled: await clearButton.isDisabled(),
      screenshot,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

async function runMobile(
  browser: Browser,
  studioUrl: string,
  aggregateDiagnostics: BrowserDiagnostics,
): Promise<StudioLivingInkMobileEvidence> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const diagnostics = collectBrowserDiagnostics(page, "mobile", studioUrl);
  const screenshot = join(SCRATCH, "mobile-390x844.png");
  try {
    await installStudioMonitor(page);
    await prepareStudio(page, studioUrl);
    await activatePenAndWatercolor(page);
    const controls = page.locator('[data-studio-living-ink-controls="true"]');
    await controls.scrollIntoViewIfNeeded();
    const metrics = await controls.evaluate((root) => {
      const labels = [
        "수채 번짐 물리 모드",
        "수채 번짐 안료",
        "수채 번짐 물",
        "수채 번짐 정착",
        "수채 번짐 지우기",
      ];
      const viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight };
      const nodes = labels.flatMap((label) => {
        const node = root.querySelector<HTMLElement>(`[aria-label="${label}"]`);
        return node ? [node] : [];
      });
      const boxes = nodes.map((node) => node.getBoundingClientRect());
      const rootBox = root.getBoundingClientRect();
      return {
        coarsePointer: globalThis.matchMedia("(pointer: coarse)").matches,
        visible: rootBox.width > 0 && rootBox.height > 0,
        withinViewport: rootBox.left >= 0
          && rootBox.top >= 0
          && rootBox.right <= viewport.width
          && rootBox.bottom <= viewport.height,
        minimumWidth: boxes.length > 0 ? Math.min(...boxes.map(({ width }) => width)) : 0,
        minimumHeight: boxes.length > 0 ? Math.min(...boxes.map(({ height }) => height)) : 0,
        state: root.dataset.studioLivingInkState ?? "",
      };
    });
    await page.screenshot({ path: screenshot, animations: "disabled" });
    return {
      viewport: "390x844",
      coarsePointer: metrics.coarsePointer,
      controlsVisible: metrics.visible,
      controlsWithinViewport: metrics.withinViewport,
      minimumControlWidth: metrics.minimumWidth,
      minimumControlHeight: metrics.minimumHeight,
      state: metrics.state,
      screenshot,
    };
  } finally {
    mergeDiagnostics(aggregateDiagnostics, diagnostics);
    await context.close();
  }
}

function prepareScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const name of readdirSync(SCRATCH)) {
    if (!/^(?:positive|fail-closed|mobile|studio-living-ink-integration).*(?:\.png|\.json|\.log)$/u.test(name)) {
      continue;
    }
    try {
      unlinkSync(join(SCRATCH, name));
    } catch {
      // Keep going; a new artifact write will still fail loudly if the file is locked.
    }
  }
}

async function main(): Promise<void> {
  prepareScratch();
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  if (!externalOrigin) {
    invariant(
      existsSync(join(DIST_DIR, "index.html")),
      "dist/index.html is missing; build once before running the Living Ink production verifier",
    );
  }
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
    const positive = await runPositive(browser, studioUrl, diagnostics);
    log("positive native-pointer, canonical handoff, history, and accepted replay observed");
    const corruptedReceipt = await runFailClosed(
      browser,
      studioUrl,
      {
        key: positive.autosaveKey,
        raw: positive.autosaveRaw,
        canonicalPngSha256: positive.canonicalPngSha256,
        canonicalPngDataSha256: positive.canonicalPngDataSha256,
      },
      "final-receipt-hash",
      diagnostics,
    );
    const corruptedJournal = await runFailClosed(
      browser,
      studioUrl,
      {
        key: positive.autosaveKey,
        raw: positive.autosaveRaw,
        canonicalPngSha256: positive.canonicalPngSha256,
        canonicalPngDataSha256: positive.canonicalPngDataSha256,
      },
      "journal-sequence",
      diagnostics,
    );
    const corruptedCanonicalPng = await runFailClosed(
      browser,
      studioUrl,
      {
        key: positive.autosaveKey,
        raw: positive.autosaveRaw,
        canonicalPngSha256: positive.canonicalPngSha256,
        canonicalPngDataSha256: positive.canonicalPngDataSha256,
      },
      "canonical-png-hash",
      diagnostics,
    );
    log("corrupted final receipt, journal, and canonical PNG hash preserved PNG pixels and failed closed");
    const mobile = await runMobile(browser, studioUrl, diagnostics);
    const candidate = {
      status: "ok",
      schemaVersion: STUDIO_LIVING_INK_INTEGRATION_REPORT_SCHEMA_VERSION,
      execution: "vite-production-preview-shipped-studio-native-pointer",
      positive: positive.evidence,
      corruptedReceipt,
      corruptedJournal,
      corruptedCanonicalPng,
      mobile,
      diagnostics,
      issues: [],
      evidenceDirectory: SCRATCH,
    } as const satisfies StudioLivingInkIntegrationResult;
    const issues = validateStudioLivingInkIntegrationResult(candidate);
    const result: StudioLivingInkIntegrationResult = {
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
