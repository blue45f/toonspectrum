/**
 * Production-preview vertical-slice gate for Hybrid DCC inside the shipped `/studio` UI.
 *
 * The verifier starts from a blank Studio document and uses only visible product controls:
 * Hybrid DCC entry -> primitive -> object/face selection -> numeric TRS -> Undo/Redo -> OPFS
 * autosave -> real reload/recovery -> verified GLB Worker handoff -> BG3D -> Hybrid DCC reopen.
 * Browser-side observation is limited to diagnostics, the public OPFS browser API, and a passive
 * Worker proxy which records the request/response caused by the shipped handoff button. It never
 * imports or calls a Studio implementation module from `page.evaluate`.
 *
 * This file never builds the application. Run it after a known-good `dist` exists:
 *   pnpm exec tsx scripts/verify-studio-hybrid-dcc-integration.mts
 * Reuse an already-running production preview:
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:5199 \
 *     pnpm exec tsx scripts/verify-studio-hybrid-dcc-integration.mts
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
  type Locator,
  type Page,
} from "playwright";

import {
  findFreePort,
  stopChildProcess,
  waitForServer,
} from "./lib/studio-verify-preview-harness.mjs";

export const STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION = 2 as const;

const SCRATCH =
  process.env.TOONSPECTRUM_HYBRID_DCC_VERIFY_DIR
  ?? process.env.TOONSPECTRUM_VERIFY_DIR
  ?? join(tmpdir(), "toonspectrum-studio-hybrid-dcc-integration");
const LOG_PATH = join(SCRATCH, "studio-hybrid-dcc-integration.log");
const REPORT_PATH = join(SCRATCH, "studio-hybrid-dcc-integration.json");
const QUICKSTART_KEY = "toonspectrum-studio-quick-start-dismissed";
const MOBILE_HINT_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const UI_DENSITY_KEY = "toonspectrum-studio-ui-density:v1";
const HYBRID_DCC_OPFS_ROOT = "toonspectrum-hybrid-dcc-v1";
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_MINIMUM_BYTES = 20;
const GLB_RESPONSE_BUDGET_BYTES = 100 * 1024 * 1024;
const GLB_MAX_REPORT_ISSUES = 4_096;
const GLB_MAX_ISSUE_IDS = 1_024;
const TARGET_TRANSFORM = Object.freeze({
  position: [2.25, 0, 0] as const,
  rotationDeg: [0, 30, 0] as const,
  scale: [1, 1, 1.5] as const,
});
const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
] as const;

type Vec3 = readonly [number, number, number];

export interface StudioHybridDccBrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly consoleWarnings: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly fiveHundredResponses: string[];
}

export interface StudioHybridDccOpfsFileEvidence {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: `sha256:${string}`;
}

export interface StudioHybridDccTransformEvidence {
  readonly position: Vec3;
  readonly rotationDeg: Vec3;
  readonly scale: Vec3;
}

export interface StudioHybridDccBlankEvidence {
  readonly studioEditorVisible: boolean;
  readonly nativeLayerCount: number;
  readonly entrySelector: "[data-studio-hybrid-dcc-open=\"true\"]";
  readonly entryVisible: boolean;
  readonly dialogVisible: boolean;
  readonly initialAssetCount: number;
  readonly initialActiveAssetId: "none";
  readonly blankViewportVisible: boolean;
  readonly screenshot: string;
}

export interface StudioHybridDccSelectionEvidence {
  readonly assetId: string;
  readonly assetCount: number;
  readonly outlinerIdentityVisible: boolean;
  readonly viewportVisible: boolean;
  readonly webglContextLost: boolean;
  readonly objectSelectionMode: string;
  readonly objectSelectionSummary: string;
  readonly componentSelectionMode: string;
  readonly componentSelectedElementCount: number;
  readonly componentSelectionSummary: string;
  readonly trustedCanvasPointerAttempts: number;
  readonly screenshot: string;
}

export interface StudioHybridDccTrsHistoryEvidence {
  readonly assetId: string;
  readonly before: StudioHybridDccTransformEvidence;
  readonly edited: StudioHybridDccTransformEvidence;
  readonly afterOneUndo: StudioHybridDccTransformEvidence;
  readonly afterOneRedo: StudioHybridDccTransformEvidence;
  readonly undoEnabled: boolean;
  readonly redoEnabledAfterUndo: boolean;
  readonly stableIdThroughHistory: boolean;
  readonly screenshot: string;
}

export interface StudioHybridDccPersistenceEvidence {
  readonly opfsGetDirectoryAvailable: boolean;
  readonly webLocksAvailable: boolean;
  readonly redoBaselineSequence: number;
  readonly redoPersistedSequence: number;
  readonly redoReceiptSourceHash: `sha256:${string}`;
  readonly redoReceiptDocumentStateHash: string;
  readonly redoWorkspaceStateHash: string;
  readonly filesBeforeRedo: readonly StudioHybridDccOpfsFileEvidence[];
  readonly freshRedoFileCount: number;
  readonly statusBeforeReload: string;
  readonly filesBeforeReload: readonly StudioHybridDccOpfsFileEvidence[];
  readonly totalBytesBeforeReload: number;
  readonly pageReloadObserved: boolean;
  readonly navigationType: string;
  readonly recoveryStatus: string;
  readonly recoveredAssetId: string;
  readonly recoveredTransform: StudioHybridDccTransformEvidence;
  readonly filesAfterReload: readonly StudioHybridDccOpfsFileEvidence[];
  readonly unchangedDurableFileCount: number;
  readonly screenshot: string;
}

export interface StudioHybridDccGlbWorkerPayloadEvidence {
  readonly assetId: string | null;
  readonly sourceRevision: number | null;
  readonly sourceHash: string | null;
  readonly packedByteLength: number;
}

export interface StudioHybridDccGlbWorkerRequestEvidence {
  readonly constructorIndex: number;
  readonly workerUrl: string;
  readonly workerName: string | null;
  readonly version: number | null;
  readonly kind: string | null;
  readonly requestId: number | null;
  readonly inputTransport: string | null;
  readonly maxResponseBytes: number | null;
  readonly transferCount: number;
  readonly payloads: readonly StudioHybridDccGlbWorkerPayloadEvidence[];
}

export interface StudioHybridDccGlbWorkerItemEvidence {
  readonly ok: boolean;
  readonly byteLength: number;
  readonly magic: number | null;
  readonly version: number | null;
  readonly declaredLength: number | null;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly reportStatus: string | null;
  readonly errorCount: number;
  readonly lossCount: number;
  readonly warningCount: number;
  readonly issueCount: number;
  readonly maxIssueIdListLength: number;
  readonly metricsGlbByteLength: number | null;
  readonly metricsTriangleCount: number | null;
  readonly metricsVertexCount: number | null;
  readonly sourceAssetId: string | null;
  readonly sourceRevision: number | null;
  readonly sourceHash: string | null;
}

export interface StudioHybridDccGlbWorkerResponseEvidence {
  readonly constructorIndex: number;
  readonly version: number | null;
  readonly kind: string | null;
  readonly requestId: number | null;
  readonly code: string | null;
  readonly totalByteLength: number;
  readonly items: readonly StudioHybridDccGlbWorkerItemEvidence[];
}

export interface StudioHybridDccGlbWorkerEvidence {
  readonly requestCount: number;
  readonly responseCount: number;
  readonly workerErrorCount: number;
  readonly terminationCount: number;
  readonly request: StudioHybridDccGlbWorkerRequestEvidence | null;
  readonly response: StudioHybridDccGlbWorkerResponseEvidence | null;
}

export interface StudioHybridDccBg3dEvidence {
  readonly handoffButtonVisible: boolean;
  readonly dialogVisible: boolean;
  readonly sourceAssetIdentityVisible: boolean;
  readonly sourceAssetId: string;
  readonly hybridDccReopened: boolean;
  readonly reopenedAssetId: string;
  readonly reopenedTransform: StudioHybridDccTransformEvidence;
  readonly renderedFraming: StudioHybridDccRenderedFramingEvidence;
  readonly screenshotHandoff: string;
  readonly screenshotReopened: string;
}

export interface StudioHybridDccRenderedFramingEvidence {
  readonly width: number;
  readonly height: number;
  readonly subjectPixelCount: number;
  readonly subjectPixelRatio: number;
  readonly bounds: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly minimumEdgeMarginRatio: number;
  readonly fullyInsideViewport: boolean;
}

export interface StudioHybridDccBlockedEvidence {
  readonly boundary: string;
  readonly message: string;
}

export interface StudioHybridDccIntegrationResult {
  readonly status: "ok" | "failed" | "blocked";
  readonly schemaVersion: typeof STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION;
  readonly execution: "vite-production-preview-shipped-studio-ui";
  readonly route: "/studio";
  readonly blank: StudioHybridDccBlankEvidence | null;
  readonly selection: StudioHybridDccSelectionEvidence | null;
  readonly trsHistory: StudioHybridDccTrsHistoryEvidence | null;
  readonly persistence: StudioHybridDccPersistenceEvidence | null;
  readonly workerExport: StudioHybridDccGlbWorkerEvidence | null;
  readonly bg3d: StudioHybridDccBg3dEvidence | null;
  readonly diagnostics: StudioHybridDccBrowserDiagnostics;
  readonly blocker: StudioHybridDccBlockedEvidence | null;
  readonly issues: readonly string[];
  readonly evidenceDirectory: string;
}

interface MutableWorkerMonitor {
  readonly constructors: Array<{
    readonly constructorIndex: number;
    readonly workerUrl: string;
    readonly workerName: string | null;
  }>;
  readonly requests: StudioHybridDccGlbWorkerRequestEvidence[];
  readonly responses: StudioHybridDccGlbWorkerResponseEvidence[];
  readonly errors: Array<{ readonly constructorIndex: number; readonly type: string }>;
  readonly terminations: Array<{ readonly constructorIndex: number }>;
}

interface MutableRunEvidence {
  blank?: StudioHybridDccBlankEvidence;
  selection?: StudioHybridDccSelectionEvidence;
  trsHistory?: StudioHybridDccTrsHistoryEvidence;
  persistence?: StudioHybridDccPersistenceEvidence;
  workerExport?: StudioHybridDccGlbWorkerEvidence;
  bg3d?: StudioHybridDccBg3dEvidence;
}

class StudioHybridDccVerifierBlockedError extends Error {
  constructor(
    readonly boundary: string,
    message: string,
  ) {
    super(message);
    this.name = "StudioHybridDccVerifierBlockedError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function integer(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function vec3(value: unknown): value is Vec3 {
  return array(value) && value.length === 3 && value.every(finite);
}

function sameNumber(left: number, right: number, tolerance = 1e-3): boolean {
  return Math.abs(left - right) <= tolerance;
}

function sameVec3(left: unknown, right: Vec3): boolean {
  return vec3(left) && left.every((component, index) => sameNumber(component, right[index]!));
}

function sameTransform(left: unknown, right: StudioHybridDccTransformEvidence): boolean {
  return record(left)
    && sameVec3(left.position, right.position)
    && sameVec3(left.rotationDeg, right.rotationDeg)
    && sameVec3(left.scale, right.scale);
}

function screenshotPath(value: unknown): boolean {
  return string(value) && value.endsWith(".png") && value.length > 4;
}

function opfsFileEvidence(value: unknown): value is StudioHybridDccOpfsFileEvidence {
  return record(value)
    && string(value.path)
    && value.path.startsWith(`${HYBRID_DCC_OPFS_ROOT}/`)
    && integer(value.byteLength, 1)
    && string(value.sha256)
    && /^sha256:[a-f0-9]{64}$/u.test(value.sha256);
}

function opfsFileEvidenceArray(
  value: unknown,
): value is StudioHybridDccOpfsFileEvidence[] {
  return array(value)
    && value.every(opfsFileEvidence)
    && new Set(value.map((file) => file.path)).size === value.length;
}

/** Pure policy gate: incomplete, blocked, fallback, or browser-diagnostic evidence is rejected. */
export function validateStudioHybridDccIntegrationResult(candidate: unknown): string[] {
  const issues: string[] = [];
  if (!record(candidate)) return ["integration result is not an object"];
  if (candidate.status !== "ok") issues.push("integration run did not report ok");
  if (candidate.schemaVersion !== STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION) {
    issues.push("integration report schema version is invalid");
  }
  if (candidate.execution !== "vite-production-preview-shipped-studio-ui") {
    issues.push("integration run did not use the shipped production-preview Studio UI");
  }
  if (candidate.route !== "/studio") {
    issues.push("integration run did not exercise the real /studio route");
  }
  if (record(candidate.blocker)) {
    issues.push(`blocked UI boundary: ${String(candidate.blocker.boundary ?? "unknown")}`);
  } else if (candidate.blocker !== null) {
    issues.push("blocker evidence is malformed");
  }

  const blank = candidate.blank;
  if (!record(blank)) {
    issues.push("blank Studio and Hybrid DCC entry evidence is missing");
  } else if (
    blank.studioEditorVisible !== true
    || blank.nativeLayerCount !== 0
    || blank.entrySelector !== '[data-studio-hybrid-dcc-open="true"]'
    || blank.entryVisible !== true
    || blank.dialogVisible !== true
    || blank.initialAssetCount !== 0
    || blank.initialActiveAssetId !== "none"
    || blank.blankViewportVisible !== true
    || !screenshotPath(blank.screenshot)
  ) {
    issues.push("scenario did not enter blank Studio and open Hybrid DCC through shipped UI");
  }

  const selection = candidate.selection;
  if (!record(selection)) {
    issues.push("object/component selection evidence is missing");
  } else if (
    !string(selection.assetId)
    || selection.assetId.length === 0
    || selection.assetId === "none"
    || selection.assetCount !== 1
    || selection.outlinerIdentityVisible !== true
    || selection.viewportVisible !== true
    || selection.webglContextLost !== false
    || selection.objectSelectionMode !== "object"
    || selection.objectSelectionSummary !== "오브젝트 편집"
    || selection.componentSelectionMode !== "face"
    || !integer(selection.componentSelectedElementCount, 1)
    || selection.componentSelectionSummary !== `면 ${selection.componentSelectedElementCount}개 선택`
    || !integer(selection.trustedCanvasPointerAttempts, 1)
    || selection.trustedCanvasPointerAttempts > 9
    || !screenshotPath(selection.screenshot)
  ) {
    issues.push("primitive identity and visible object/face selection were not proven by UI input");
  }

  const trs = candidate.trsHistory;
  const initialTransform: StudioHybridDccTransformEvidence = {
    position: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const targetTransform: StudioHybridDccTransformEvidence = TARGET_TRANSFORM;
  const undoneTransform: StudioHybridDccTransformEvidence = {
    ...TARGET_TRANSFORM,
    scale: [1, 1, 1],
  };
  if (!record(trs)) {
    issues.push("TRS and one-step Undo/Redo evidence is missing");
  } else if (
    !record(selection)
    || trs.assetId !== selection.assetId
    || !sameTransform(trs.before, initialTransform)
    || !sameTransform(trs.edited, targetTransform)
    || !sameTransform(trs.afterOneUndo, undoneTransform)
    || !sameTransform(trs.afterOneRedo, targetTransform)
    || trs.undoEnabled !== true
    || trs.redoEnabledAfterUndo !== true
    || trs.stableIdThroughHistory !== true
    || !screenshotPath(trs.screenshot)
  ) {
    issues.push("numeric TRS edit and exactly one Undo/Redo did not preserve object identity");
  }

  const persistence = candidate.persistence;
  if (!record(persistence)) {
    issues.push("native OPFS autosave and real reload/recovery evidence is missing");
  } else {
    const redoBaselineFiles = opfsFileEvidenceArray(persistence.filesBeforeRedo)
      ? persistence.filesBeforeRedo
      : null;
    const beforeFiles = opfsFileEvidenceArray(persistence.filesBeforeReload)
      ? persistence.filesBeforeReload
      : null;
    const afterFiles = opfsFileEvidenceArray(persistence.filesAfterReload)
      ? persistence.filesAfterReload
      : null;
    const beforeBytes = (beforeFiles ?? []).reduce(
      (total, file) => total + file.byteLength,
      0,
    );
    const filesValid = redoBaselineFiles !== null
      && beforeFiles !== null
      && beforeFiles.length > 0
      && afterFiles !== null
      && afterFiles.length > 0;
    const expectedFreshFileCount = redoBaselineFiles && beforeFiles
      ? countStudioHybridDccFreshOpfsFiles(redoBaselineFiles, beforeFiles)
      : -1;
    if (
      persistence.opfsGetDirectoryAvailable !== true
      || persistence.webLocksAvailable !== true
      || !integer(persistence.redoBaselineSequence)
      || !integer(persistence.redoPersistedSequence, persistence.redoBaselineSequence + 1)
      || !string(persistence.redoReceiptSourceHash)
      || !/^sha256:[a-f0-9]{64}$/u.test(persistence.redoReceiptSourceHash)
      || !string(persistence.redoReceiptDocumentStateHash)
      || persistence.redoReceiptDocumentStateHash !== persistence.redoWorkspaceStateHash
      || !integer(persistence.freshRedoFileCount, 1)
      || persistence.freshRedoFileCount !== expectedFreshFileCount
      || persistence.statusBeforeReload !== "saved"
      || persistence.pageReloadObserved !== true
      || persistence.navigationType !== "reload"
      || persistence.recoveryStatus !== "saved"
      || !record(selection)
      || persistence.recoveredAssetId !== selection.assetId
      || !sameTransform(persistence.recoveredTransform, targetTransform)
      || !filesValid
      || persistence.totalBytesBeforeReload !== beforeBytes
      || persistence.unchangedDurableFileCount !== beforeFiles?.length
      || !screenshotPath(persistence.screenshot)
    ) {
      issues.push("OPFS autosave did not survive an actual page reload with stable ID and TRS");
    }
  }

  const worker = candidate.workerExport;
  if (!record(worker)) {
    issues.push("GLB Worker export evidence is missing");
  } else {
    const request = worker.request;
    const response = worker.response;
    const payloads = record(request) && array(request.payloads) ? request.payloads : [];
    const items = record(response) && array(response.items) ? response.items : [];
    const payload = payloads.length === 1 && record(payloads[0]) ? payloads[0] : null;
    const item = items.length === 1 && record(items[0]) ? items[0] : null;
    if (
      worker.requestCount !== 1
      || worker.responseCount !== 1
      || worker.workerErrorCount !== 0
      || !integer(worker.terminationCount, 1)
      || !record(request)
      || !record(response)
      || request.kind !== "export-batch"
      || request.version !== 2
      || request.inputTransport !== "transferable-packed-soa-v1"
      || request.maxResponseBytes !== GLB_RESPONSE_BUDGET_BYTES
      || !integer(request.transferCount, 1)
      || !string(request.workerUrl)
      || !request.workerUrl.includes("worker")
      || !payload
      || !record(selection)
      || payload.assetId !== selection.assetId
      || !integer(payload.sourceRevision)
      || !string(payload.sourceHash)
      || !integer(payload.packedByteLength, 1)
      || response.kind !== "result"
      || response.version !== 2
      || response.requestId !== request.requestId
      || response.code !== null
      || !item
      || item.ok !== true
      || !integer(item.byteLength, GLB_MINIMUM_BYTES + 1)
      || item.byteLength > GLB_RESPONSE_BUDGET_BYTES
      || item.magic !== GLB_MAGIC
      || item.version !== GLB_VERSION
      || item.declaredLength !== item.byteLength
      || item.mimeType !== "model/gltf-binary"
      || !string(item.fileName)
      || !item.fileName.toLowerCase().endsWith(".glb")
      || item.reportStatus !== "exported"
      || item.errorCount !== 0
      || !integer(item.lossCount)
      || !integer(item.warningCount)
      || !integer(item.issueCount)
      || item.issueCount > GLB_MAX_REPORT_ISSUES
      || !integer(item.maxIssueIdListLength)
      || item.maxIssueIdListLength > GLB_MAX_ISSUE_IDS
      || item.metricsGlbByteLength !== item.byteLength
      || !integer(item.metricsTriangleCount, 1)
      || !integer(item.metricsVertexCount, 1)
      || item.sourceAssetId !== selection.assetId
      || item.sourceRevision !== payload.sourceRevision
      || item.sourceHash !== payload.sourceHash
      || response.totalByteLength !== item.byteLength
    ) {
      issues.push("shipped BG3D handoff did not prove a bounded nonempty GLB Worker response");
    }
  }

  const bg3d = candidate.bg3d;
  if (!record(bg3d)) {
    issues.push("BG3D handoff and Hybrid DCC reopen evidence is missing");
  } else {
    const framing = bg3d.renderedFraming;
    const bounds = record(framing) ? framing.bounds : null;
    const framingValid = record(framing)
      && integer(framing.width, 64)
      && integer(framing.height, 64)
      && integer(framing.subjectPixelCount, 100)
      && finite(framing.subjectPixelRatio)
      && framing.subjectPixelRatio >= 0.005
      && framing.subjectPixelRatio <= 0.45
      && record(bounds)
      && integer(bounds.left)
      && integer(bounds.top)
      && integer(bounds.right)
      && integer(bounds.bottom)
      && bounds.left < bounds.right
      && bounds.top < bounds.bottom
      && bounds.right < framing.width
      && bounds.bottom < framing.height
      && finite(framing.minimumEdgeMarginRatio)
      && framing.minimumEdgeMarginRatio >= 0.02
      && framing.fullyInsideViewport === true;
    if (
      !record(selection)
      || bg3d.handoffButtonVisible !== true
      || bg3d.dialogVisible !== true
      || bg3d.sourceAssetIdentityVisible !== true
      || bg3d.sourceAssetId !== selection.assetId
      || bg3d.hybridDccReopened !== true
      || bg3d.reopenedAssetId !== selection.assetId
      || !sameTransform(bg3d.reopenedTransform, targetTransform)
      || !framingValid
      || !screenshotPath(bg3d.screenshotHandoff)
      || !screenshotPath(bg3d.screenshotReopened)
    ) {
      issues.push("BG3D did not visibly frame the asset or DCC reopen changed stable identity/TRS");
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

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  appendFileSync(LOG_PATH, `${line}\n`);
  console.log(line);
}

function block(boundary: string, message: string): never {
  throw new StudioHybridDccVerifierBlockedError(boundary, message);
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

function expectedStudioHybridDccHeadlessGpuWarning(message: string, studioUrl: URL): boolean {
  const sourceSeparator = message.lastIndexOf(" @ ");
  if (sourceSeparator < 0) return false;
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(message.slice(sourceSeparator + 3));
  } catch {
    return false;
  }
  if (
    sourceUrl.origin !== studioUrl.origin
    || sourceUrl.hash !== ""
    || !/^\/studio(?:\/3d\/dcc\/(?:model|build|cad|sculpt|material|shot))?$/u.test(
      sourceUrl.pathname,
    )
  ) return false;
  const diagnostic = message.slice(0, sourceSeparator);
  if (diagnostic === "No available adapters.") return true;
  return /^\[\.WebGL-0x[0-9A-Fa-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/u
    .test(diagnostic);
}

export function normalizeStudioHybridDccHeadlessGpuDiagnostics(
  diagnostics: StudioHybridDccBrowserDiagnostics,
  studioUrl: string,
  productPathSucceeded: boolean,
): StudioHybridDccBrowserDiagnostics {
  if (!productPathSucceeded) return {
    consoleErrors: [...diagnostics.consoleErrors],
    consoleWarnings: [...diagnostics.consoleWarnings],
    pageErrors: [...diagnostics.pageErrors],
    requestFailures: [...diagnostics.requestFailures],
    fiveHundredResponses: [...diagnostics.fiveHundredResponses],
  };
  let pageUrl: URL;
  try {
    pageUrl = new URL(studioUrl);
  } catch {
    return diagnostics;
  }
  return {
    consoleErrors: [...diagnostics.consoleErrors],
    consoleWarnings: diagnostics.consoleWarnings.filter((message) => (
      !expectedStudioHybridDccHeadlessGpuWarning(message, pageUrl)
    )),
    pageErrors: [...diagnostics.pageErrors],
    requestFailures: [...diagnostics.requestFailures],
    fiveHundredResponses: [...diagnostics.fiveHundredResponses],
  };
}

function collectBrowserDiagnostics(
  page: Page,
  studioUrl: string,
): StudioHybridDccBrowserDiagnostics {
  const diagnostics: StudioHybridDccBrowserDiagnostics = {
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
    target.push(message);
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`;
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) diagnostics.requestFailures.push(message);
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    const message = `${response.status()} ${response.url()}`;
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) {
      diagnostics.fiveHundredResponses.push(message);
    }
  });
  return diagnostics;
}

async function installStudioStateAndWorkerMonitor(page: Page): Promise<void> {
  await page.addInitScript(({ mobileHintKey, quickstartKey, uiDensityKey }) => {
    type WorkerConstructorRecord = MutableWorkerMonitor["constructors"][number];
    const scope = globalThis as typeof globalThis & {
      __name?: (target: unknown, name: string) => unknown;
      __studioHybridDccIntegrationWorkerMonitor?: MutableWorkerMonitor;
    };
    // `tsx` preserves names for callbacks nested inside this Playwright init function by emitting
    // `__name(...)`. The browser document does not own that Node-side helper, so provide the
    // identity-only equivalent before the passive Worker proxy's callbacks can execute.
    if (typeof scope.__name !== "function") {
      Object.defineProperty(scope, "__name", {
        configurable: true,
        writable: true,
        value(target: unknown) {
          return target;
        },
      });
    }
    const monitor: MutableWorkerMonitor = {
      constructors: [],
      requests: [],
      responses: [],
      errors: [],
      terminations: [],
    };
    scope.__studioHybridDccIntegrationWorkerMonitor = monitor;
    try {
      window.localStorage.setItem(quickstartKey, "1");
      window.localStorage.setItem(mobileHintKey, "1");
      window.localStorage.setItem(uiDensityKey, "compact");
    } catch {
      // Visible UI assertions remain fail-closed if browser storage is unavailable.
    }

    const nativeWorker = globalThis.Worker;
    if (typeof nativeWorker !== "function") return;
    const instrumentedWorker = new Proxy(nativeWorker, {
      construct(target, argumentsList) {
        const worker = Reflect.construct(target, argumentsList, target) as Worker;
        const options = argumentsList[1] && typeof argumentsList[1] === "object"
          ? argumentsList[1] as Record<string, unknown>
          : {};
        const constructorRecord: WorkerConstructorRecord = {
          constructorIndex: monitor.constructors.length,
          workerUrl: String(argumentsList[0] ?? ""),
          workerName: typeof options.name === "string" ? options.name : null,
        };
        monitor.constructors.push(constructorRecord);
        const matchingRequestIds = new Set<number>();
        const mutableWorker = worker as unknown as {
          postMessage(message: unknown, transferOrOptions?: unknown): void;
          terminate(): void;
        };
        const nativePostMessage = mutableWorker.postMessage.bind(worker);
        const nativeTerminate = mutableWorker.terminate.bind(worker);
        mutableWorker.postMessage = (message: unknown, transferOrOptions?: unknown): void => {
          if (message && typeof message === "object" && !Array.isArray(message)) {
            const value = message as Record<string, unknown>;
            if (value.kind === "export-batch" && Array.isArray(value.payloads)) {
              const requestId = typeof value.requestId === "number" ? value.requestId : null;
              if (requestId !== null) matchingRequestIds.add(requestId);
              const transferCount = Array.isArray(transferOrOptions)
                ? transferOrOptions.length
                : transferOrOptions && typeof transferOrOptions === "object"
                  && Array.isArray((transferOrOptions as Record<string, unknown>).transfer)
                  ? ((transferOrOptions as Record<string, unknown>).transfer as unknown[]).length
                  : 0;
              monitor.requests.push({
                constructorIndex: constructorRecord.constructorIndex,
                workerUrl: constructorRecord.workerUrl,
                workerName: constructorRecord.workerName,
                version: typeof value.version === "number" ? value.version : null,
                kind: typeof value.kind === "string" ? value.kind : null,
                requestId,
                inputTransport: typeof value.inputTransport === "string"
                  ? value.inputTransport
                  : null,
                maxResponseBytes: typeof value.maxResponseBytes === "number"
                  ? value.maxResponseBytes
                  : null,
                transferCount,
                payloads: value.payloads.map((payload) => {
                  const item = payload && typeof payload === "object" && !Array.isArray(payload)
                    ? payload as Record<string, unknown>
                    : {};
                  const manifest = item.manifest && typeof item.manifest === "object"
                    && !Array.isArray(item.manifest)
                    ? item.manifest as Record<string, unknown>
                    : {};
                  return {
                    assetId: typeof manifest.assetId === "string" ? manifest.assetId : null,
                    sourceRevision: typeof manifest.sourceRevision === "number"
                      ? manifest.sourceRevision
                      : null,
                    sourceHash: typeof manifest.sourceHash === "string"
                      ? manifest.sourceHash
                      : null,
                    packedByteLength: item.buffer instanceof ArrayBuffer
                      ? item.buffer.byteLength
                      : 0,
                  };
                }),
              });
            }
          }
          if (transferOrOptions === undefined) nativePostMessage(message);
          else nativePostMessage(message, transferOrOptions);
        };
        mutableWorker.terminate = (): void => {
          if (matchingRequestIds.size > 0) {
            monitor.terminations.push({ constructorIndex: constructorRecord.constructorIndex });
          }
          nativeTerminate();
        };
        worker.addEventListener("message", (event: MessageEvent<unknown>) => {
          if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
          const value = event.data as Record<string, unknown>;
          const requestId = typeof value.requestId === "number" ? value.requestId : null;
          if (requestId === null || !matchingRequestIds.has(requestId)) return;
          const rawResults = Array.isArray(value.results) ? value.results : [];
          monitor.responses.push({
            constructorIndex: constructorRecord.constructorIndex,
            version: typeof value.version === "number" ? value.version : null,
            kind: typeof value.kind === "string" ? value.kind : null,
            requestId,
            code: typeof value.code === "string" ? value.code : null,
            totalByteLength: typeof value.totalByteLength === "number"
              ? value.totalByteLength
              : 0,
            items: rawResults.map((rawResult) => {
              const result = rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
                ? rawResult as Record<string, unknown>
                : {};
              const bytes = result.bytes instanceof ArrayBuffer ? result.bytes : null;
              const header = bytes && bytes.byteLength >= 12 ? new DataView(bytes, 0, 12) : null;
              const report = result.report && typeof result.report === "object"
                && !Array.isArray(result.report)
                ? result.report as Record<string, unknown>
                : {};
              const metrics = result.metrics && typeof result.metrics === "object"
                && !Array.isArray(result.metrics)
                ? result.metrics as Record<string, unknown>
                : {};
              const source = report.source && typeof report.source === "object"
                && !Array.isArray(report.source)
                ? report.source as Record<string, unknown>
                : {};
              const errors = Array.isArray(report.errors) ? report.errors : [];
              const losses = Array.isArray(report.losses) ? report.losses : [];
              const warnings = Array.isArray(report.warnings) ? report.warnings : [];
              const issueList = Array.isArray(report.issues) ? report.issues : [];
              let maxIssueIdListLength = 0;
              for (const issue of issueList) {
                if (!issue || typeof issue !== "object" || Array.isArray(issue)) continue;
                const issueRecord = issue as Record<string, unknown>;
                for (const key of ["vertexIds", "halfEdgeIds", "faceIds"]) {
                  const ids = issueRecord[key];
                  if (Array.isArray(ids)) maxIssueIdListLength = Math.max(maxIssueIdListLength, ids.length);
                }
              }
              return {
                ok: result.ok === true,
                byteLength: bytes?.byteLength ?? 0,
                magic: header?.getUint32(0, true) ?? null,
                version: header?.getUint32(4, true) ?? null,
                declaredLength: header?.getUint32(8, true) ?? null,
                fileName: typeof result.fileName === "string" ? result.fileName : null,
                mimeType: typeof result.mimeType === "string" ? result.mimeType : null,
                reportStatus: typeof report.status === "string" ? report.status : null,
                errorCount: errors.length,
                lossCount: losses.length,
                warningCount: warnings.length,
                issueCount: issueList.length,
                maxIssueIdListLength,
                metricsGlbByteLength: typeof metrics.glbByteLength === "number"
                  ? metrics.glbByteLength
                  : null,
                metricsTriangleCount: typeof metrics.triangleCount === "number"
                  ? metrics.triangleCount
                  : typeof metrics.triangles === "number"
                    ? metrics.triangles
                    : null,
                metricsVertexCount: typeof metrics.outputVertexCount === "number"
                  ? metrics.outputVertexCount
                  : typeof metrics.vertices === "number"
                    ? metrics.vertices
                    : null,
                sourceAssetId: typeof source.assetId === "string" ? source.assetId : null,
                sourceRevision: typeof source.sourceRevision === "number"
                  ? source.sourceRevision
                  : null,
                sourceHash: typeof source.sourceHash === "string" ? source.sourceHash : null,
              };
            }),
          });
        });
        const recordWorkerError = (type: string) => {
          if (matchingRequestIds.size > 0) {
            monitor.errors.push({ constructorIndex: constructorRecord.constructorIndex, type });
          }
        };
        worker.addEventListener("error", () => recordWorkerError("error"));
        worker.addEventListener("messageerror", () => recordWorkerError("messageerror"));
        return worker;
      },
    });
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      writable: true,
      value: instrumentedWorker,
    });
  }, {
    mobileHintKey: MOBILE_HINT_KEY,
    quickstartKey: QUICKSTART_KEY,
    uiDensityKey: UI_DENSITY_KEY,
  });
}

/**
 * Vite's static preview falls back to `index.html` for `/api/auth/session`. That HTML-shaped 200
 * response is intentionally treated as an indeterminate cookie session by SessionProvider, so the
 * user-scoped OPFS recovery gate must remain closed. Give this unauthenticated production-preview
 * verifier an authoritative unauthenticated session response before
 * navigating to Studio. This is an auth transport fixture only; OPFS, Web Locks, Workers, reload,
 * and every Hybrid DCC interaction below continue to execute in the shipped browser runtime.
 */
async function installStudioGuestSessionBoundary(page: Page): Promise<void> {
  await page.route("**/api/auth/session", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ authenticated: false, user: null }),
    });
  });
}

async function readWorkerMonitor(page: Page): Promise<MutableWorkerMonitor> {
  return page.evaluate(() => {
    const monitor = (globalThis as typeof globalThis & {
      __studioHybridDccIntegrationWorkerMonitor?: MutableWorkerMonitor;
    }).__studioHybridDccIntegrationWorkerMonitor;
    if (!monitor) throw new Error("Hybrid DCC Worker monitor is unavailable");
    return structuredClone(monitor);
  });
}

async function readHybridDccOpfsFiles(page: Page): Promise<readonly StudioHybridDccOpfsFileEvidence[]> {
  const files = await page.evaluate(async (rootName) => {
    type DirectoryWithEntries = FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    const storage = navigator.storage;
    if (typeof storage?.getDirectory !== "function") return [];
    const root = await storage.getDirectory();
    const output: Array<{ path: string; byteLength: number; sha256: `sha256:${string}` }> = [];
    const pending: Array<{ directory: FileSystemDirectoryHandle; prefix: string }> = [{
      directory: root,
      prefix: "",
    }];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) break;
      for await (const [name, handle] of (current.directory as DirectoryWithEntries).entries()) {
        const path = current.prefix ? `${current.prefix}/${name}` : name;
        if (handle.kind === "directory") {
          pending.push({ directory: handle as FileSystemDirectoryHandle, prefix: path });
          continue;
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        const bytes = await file.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        let digestHex = "";
        for (const value of digest) digestHex += value.toString(16).padStart(2, "0");
        output.push({
          path,
          byteLength: file.size,
          sha256: `sha256:${digestHex}`,
        });
      }
    }
    return output
      .filter(({ path }) => path.startsWith(`${rootName}/`))
      .sort((left, right) => left.path.localeCompare(right.path));
  }, HYBRID_DCC_OPFS_ROOT);
  return files;
}

function studioHybridDccOpfsFileIdentity(file: StudioHybridDccOpfsFileEvidence): string {
  return `${file.path}\u0000${file.byteLength}\u0000${file.sha256}`;
}

export function countStudioHybridDccFreshOpfsFiles(
  baseline: readonly StudioHybridDccOpfsFileEvidence[],
  candidate: readonly StudioHybridDccOpfsFileEvidence[],
): number {
  const baselineIdentity = new Set(baseline.map(studioHybridDccOpfsFileIdentity));
  return candidate.reduce((count, file) => (
    baselineIdentity.has(studioHybridDccOpfsFileIdentity(file)) ? count : count + 1
  ), 0);
}

async function prepareStudio(page: Page, studioUrl: string): Promise<void> {
  page.setDefaultTimeout(12_000);
  await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 20_000 });
  const quickstart = page.locator('[data-studio-creative-starter="true"]');
  if (await quickstart.isVisible().catch(() => false)) {
    await quickstart.locator('[data-studio-quickstart-dismiss="true"]').click();
  }
}

async function countVisibleNativeLayers(page: Page): Promise<number> {
  const navigator = page.getByTestId("studio-inspector-navigator");
  await navigator.waitFor({ state: "visible", timeout: 10_000 });
  const layers = navigator.locator('[data-studio-inspector-primary-tab="layers"]');
  if (await layers.getAttribute("aria-selected") !== "true") await layers.click();
  return page.locator('[data-studio-layer-row="true"]').count();
}

async function visibleOrBlock(locator: Locator, boundary: string, message: string): Promise<void> {
  if (!await locator.waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false)) block(boundary, message);
}

async function readNeutralBg3dSubjectFraming(
  page: Page,
  canvas: Locator,
): Promise<StudioHybridDccRenderedFramingEvidence> {
  const screenshot = await canvas.screenshot({ animations: "disabled" });
  const base64 = screenshot.toString("base64");
  return page.evaluate(async ({ encoded }) => {
    const response = await fetch(`data:image/png;base64,${encoded}`);
    const bitmap = await createImageBitmap(await response.blob());
    const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not inspect the BG3D viewport screenshot");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    const totalPixels = surface.width * surface.height;
    const candidateMask = new Uint8Array(totalPixels);
    // The verifier inserts the bundled neutral unit cube into a bright blank scene. Sampling the
    // canvas itself makes a clipped/inside-camera regression observable. The canvas screenshot can
    // also contain a one-pixel neutral focus/border ring, so retain only the largest connected
    // neutral component instead of allowing disconnected chrome to expand the subject bounds.
    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const pixelIndex = y * surface.width + x;
        const offset = pixelIndex * 4;
        const red = pixels[offset]! / 255;
        const green = pixels[offset + 1]! / 255;
        const blue = pixels[offset + 2]! / 255;
        const alpha = pixels[offset + 3]! / 255;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (alpha < 0.98 || luminance < 0.18 || luminance > 0.62 || channelSpread > 0.08) continue;
        candidateMask[pixelIndex] = 1;
      }
    }

    const visited = new Uint8Array(totalPixels);
    const componentQueue = new Int32Array(totalPixels);
    let subjectPixelCount = 0;
    let left = surface.width;
    let top = surface.height;
    let right = -1;
    let bottom = -1;
    for (let seed = 0; seed < totalPixels; seed += 1) {
      if (candidateMask[seed] === 0 || visited[seed] !== 0) continue;
      let head = 0;
      let tail = 1;
      let componentCount = 0;
      let componentLeft = surface.width;
      let componentTop = surface.height;
      let componentRight = -1;
      let componentBottom = -1;
      componentQueue[0] = seed;
      visited[seed] = 1;
      while (head < tail) {
        const current = componentQueue[head]!;
        head += 1;
        const x = current % surface.width;
        const y = Math.floor(current / surface.width);
        componentCount += 1;
        componentLeft = Math.min(componentLeft, x);
        componentTop = Math.min(componentTop, y);
        componentRight = Math.max(componentRight, x);
        componentBottom = Math.max(componentBottom, y);
        const neighbors = [
          x > 0 ? current - 1 : -1,
          x + 1 < surface.width ? current + 1 : -1,
          y > 0 ? current - surface.width : -1,
          y + 1 < surface.height ? current + surface.width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || candidateMask[neighbor] === 0 || visited[neighbor] !== 0) continue;
          visited[neighbor] = 1;
          componentQueue[tail] = neighbor;
          tail += 1;
        }
      }
      if (componentCount <= subjectPixelCount) continue;
      subjectPixelCount = componentCount;
      left = componentLeft;
      top = componentTop;
      right = componentRight;
      bottom = componentBottom;
    }
    const hasSubject = subjectPixelCount > 0 && right >= left && bottom >= top;
    const horizontalMargin = hasSubject
      ? Math.min(left, surface.width - 1 - right) / surface.width
      : 0;
    const verticalMargin = hasSubject
      ? Math.min(top, surface.height - 1 - bottom) / surface.height
      : 0;
    const minimumEdgeMarginRatio = Math.min(horizontalMargin, verticalMargin);
    return {
      width: surface.width,
      height: surface.height,
      subjectPixelCount,
      subjectPixelRatio: totalPixels > 0 ? subjectPixelCount / totalPixels : 0,
      bounds: { left, top, right, bottom },
      minimumEdgeMarginRatio,
      fullyInsideViewport: hasSubject && minimumEdgeMarginRatio >= 0.02,
    };
  }, { encoded: base64 });
}

async function openProjectActions(page: Page): Promise<Locator> {
  const menu = page.locator('[data-studio-project-actions-menu="true"]');
  if (await menu.isVisible().catch(() => false)) return menu;
  const trigger = page.getByRole("button", { name: "프로젝트 작업", exact: true });
  await visibleOrBlock(
    trigger,
    "project-actions-trigger",
    "Shipped Studio project-actions trigger is not visible",
  );
  await trigger.click();
  await visibleOrBlock(
    menu,
    "project-actions-menu",
    "Shipped Studio project-actions portal did not open",
  );
  return menu;
}

async function openHybridDcc(page: Page): Promise<Locator> {
  const dialog = page.locator('[data-studio-hybrid-dcc-dialog="true"]');
  const panel = dialog.locator('[data-studio-hybrid-dcc-panel="true"]');
  // A real reload preserves the route-owned DCC surface. Reuse that already-visible shipped
  // workspace instead of requiring the canvas-only project menu to exist on the DCC route.
  if (await panel.isVisible().catch(() => false)) return panel;
  const currentPath = new URL(page.url()).pathname;
  if (/^\/studio\/3d\/dcc\/(?:model|build|cad|sculpt|material|shot)$/u.test(currentPath)) {
    if (await panel.waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false)) return panel;
    const recoveryGate = dialog.locator('[data-studio-hybrid-dcc-recovery-gate="true"]');
    const detail = await recoveryGate.textContent().catch(() => null);
    block(
      "hybrid-dcc-recovery-gate",
      detail?.trim() || "Route-owned Hybrid DCC panel never passed recovery after reload",
    );
  }
  const projectActions = await openProjectActions(page);
  const entry = projectActions.locator('[data-studio-hybrid-dcc-open="true"]');
  await visibleOrBlock(
    entry,
    "hybrid-dcc-entry",
    "Hybrid DCC entry is not visible inside the shipped project-actions portal",
  );
  await entry.scrollIntoViewIfNeeded();
  await entry.click();
  await visibleOrBlock(dialog, "hybrid-dcc-dialog", "Hybrid DCC dialog did not open from its UI entry");
  if (!await panel.waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false)) {
    const recoveryGate = dialog.locator('[data-studio-hybrid-dcc-recovery-gate="true"]');
    const detail = await recoveryGate.textContent().catch(() => null);
    block("hybrid-dcc-recovery-gate", detail?.trim() || "Hybrid DCC panel never passed recovery");
  }
  return panel;
}

function numberAttribute(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function readTransform(panel: Locator): Promise<StudioHybridDccTransformEvidence> {
  const values = await Promise.all([
    "위치 X", "위치 Y", "위치 Z",
    "회전 X", "회전 Y", "회전 Z",
    "크기 X", "크기 Y", "크기 Z",
  ].map(async (name) => Number(await panel.getByRole("spinbutton", { name, exact: true }).inputValue())));
  if (values.some((value) => !Number.isFinite(value))) {
    block("trs-inspector", `TRS inspector contains a non-finite value: ${JSON.stringify(values)}`);
  }
  return {
    position: values.slice(0, 3) as [number, number, number],
    rotationDeg: values.slice(3, 6) as [number, number, number],
    scale: values.slice(6, 9) as [number, number, number],
  };
}

async function waitForTransformField(page: Page, name: string, value: number): Promise<void> {
  await page.waitForFunction(({ accessibleName, expected }) => {
    const input = [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')]
      .find((candidate) => candidate.getAttribute("aria-label") === accessibleName);
    return Boolean(input && Number.isFinite(input.valueAsNumber)
      && Math.abs(input.valueAsNumber - expected) <= 1e-3
      // `value` changes immediately when Playwright fills the uncontrolled input. `defaultValue`
      // changes only after the workspace command commits and the state-hash-keyed fieldset remounts.
      && Math.abs(Number(input.defaultValue) - expected) <= 1e-3
      && document.querySelector('[data-studio-hybrid-dcc-viewport="true"]')
        ?.getAttribute("data-editing-disabled") === "false");
  }, { accessibleName: name, expected: value }, { timeout: 10_000 });
}

async function commitTransformField(
  page: Page,
  panel: Locator,
  name: string,
  value: number,
): Promise<void> {
  const input = panel.getByRole("spinbutton", { name, exact: true });
  await input.scrollIntoViewIfNeeded();
  await input.fill(String(value));
  await input.press("Enter");
  await waitForTransformField(page, name, value);
}

async function selectVisibleFace(page: Page, panel: Locator): Promise<number> {
  const faceMode = panel.getByRole("button", { name: "면 선택 모드 (3)", exact: true });
  await visibleOrBlock(faceMode, "component-selection-control", "Face selection control is not visible");
  await faceMode.click();
  const viewport = panel.locator('[data-studio-hybrid-dcc-viewport="true"]');
  await viewport.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    document.querySelector('[data-studio-hybrid-dcc-viewport="true"]')
      ?.getAttribute("data-selection-mode") === "face"
  ));
  // React Three Fiber currently consumes Canvas a11y props without forwarding them to its
  // generated DOM canvas, so scope the real Three renderer by its shipped viewport and engine tag.
  const canvas = viewport.locator(
    'canvas[aria-label="편집 메시 3D 렌더"], canvas[data-engine^="three.js"]',
  );
  if (!await canvas.waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)) {
    const contextLost = await viewport.getAttribute("data-context-lost");
    block(
      "component-selection-webgl",
      `Real Hybrid DCC mesh canvas is unavailable (context-lost=${contextLost ?? "unknown"})`,
    );
  }
  // The canvas can be attached one React commit before its geometry resource is materialized.
  await page.waitForTimeout(400);
  const bounds = await canvas.boundingBox();
  if (!bounds) block("component-selection-canvas", "Hybrid DCC canvas has no pointer bounds");
  const offsets = [
    [0, 0], [-24, 0], [24, 0], [0, -24], [0, 24],
    [-42, -24], [42, -24], [-42, 24], [42, 24],
  ] as const;
  let attempts = 0;
  for (const [offsetX, offsetY] of offsets) {
    attempts += 1;
    await page.mouse.click(
      bounds.x + bounds.width / 2 + offsetX,
      bounds.y + bounds.height / 2 + offsetY,
    );
    await page.waitForTimeout(120);
    const selected = numberAttribute(await viewport.getAttribute("data-selected-elements"));
    if (Number.isSafeInteger(selected) && selected > 0) return attempts;
  }
  const logText = await panel.locator('[data-studio-hybrid-dcc-log="true"]').textContent();
  block(
    "component-selection-ray-hit",
    `Shipped face-selection UI produced no visible component selection: ${logText?.trim() ?? "no log"}`,
  );
}

interface StudioHybridDccPersistenceAnchor {
  readonly sequence: number;
  readonly files: readonly StudioHybridDccOpfsFileEvidence[];
}

interface StudioHybridDccFreshPersistenceReceipt {
  readonly status: string;
  readonly sequence: number;
  readonly sourceHash: `sha256:${string}`;
  readonly documentStateHash: string;
  readonly files: readonly StudioHybridDccOpfsFileEvidence[];
  readonly freshFileCount: number;
}

async function readPersistenceAnchor(
  page: Page,
  panel: Locator,
): Promise<StudioHybridDccPersistenceAnchor> {
  const status = panel.locator('[data-studio-hybrid-dcc-persistence]');
  await status.waitFor({ state: "visible", timeout: 12_000 });
  const rawSequence = await status.getAttribute(
    "data-studio-hybrid-dcc-persistence-sequence",
  );
  const parsedSequence = Number(rawSequence);
  return {
    sequence: Number.isSafeInteger(parsedSequence) && parsedSequence >= 0 ? parsedSequence : 0,
    files: await readHybridDccOpfsFiles(page),
  };
}

async function waitForFreshSavedPersistence(
  page: Page,
  panel: Locator,
  anchor: StudioHybridDccPersistenceAnchor,
  expectedDocumentStateHash: string,
): Promise<StudioHybridDccFreshPersistenceReceipt> {
  const status = panel.locator('[data-studio-hybrid-dcc-persistence]');
  await page.waitForFunction(({ baselineSequence, expectedHash }) => {
    const node = document.querySelector('[data-studio-hybrid-dcc-persistence]');
    if (!node || node.getAttribute("data-studio-hybrid-dcc-persistence") !== "saved") {
      return false;
    }
    const sequence = Number(
      node.getAttribute("data-studio-hybrid-dcc-persistence-sequence"),
    );
    return Number.isSafeInteger(sequence)
      && sequence > baselineSequence
      && node.getAttribute("data-studio-hybrid-dcc-persistence-document-state-hash")
        === expectedHash;
  }, {
    baselineSequence: anchor.sequence,
    expectedHash: expectedDocumentStateHash,
  }, { timeout: 18_000 })
    .catch(async () => {
      const value = await status.getAttribute("data-studio-hybrid-dcc-persistence");
      const sequence = await status.getAttribute(
        "data-studio-hybrid-dcc-persistence-sequence",
      );
      const documentStateHash = await status.getAttribute(
        "data-studio-hybrid-dcc-persistence-document-state-hash",
      );
      block(
        "opfs-autosave-generation",
        "Hybrid DCC did not publish a fresh durable Redo receipt "
          + `(status=${value ?? "missing"}, sequence=${sequence ?? "missing"}, `
          + `document=${documentStateHash ?? "missing"}, expected=${expectedDocumentStateHash})`,
      );
    });
  const statusValue = await status.getAttribute("data-studio-hybrid-dcc-persistence")
    ?? "missing";
  const sequence = Number(await status.getAttribute(
    "data-studio-hybrid-dcc-persistence-sequence",
  ));
  const sourceHash = await status.getAttribute(
    "data-studio-hybrid-dcc-persistence-source-hash",
  );
  const documentStateHash = await status.getAttribute(
    "data-studio-hybrid-dcc-persistence-document-state-hash",
  );
  const files = await readHybridDccOpfsFiles(page);
  const freshFileCount = countStudioHybridDccFreshOpfsFiles(anchor.files, files);
  if (
    !Number.isSafeInteger(sequence)
    || sequence <= anchor.sequence
    || !sourceHash
    || !/^sha256:[a-f0-9]{64}$/u.test(sourceHash)
    || documentStateHash !== expectedDocumentStateHash
    || freshFileCount < 1
  ) {
    block(
      "opfs-autosave-receipt",
      "Fresh Redo receipt did not match a new durable OPFS generation "
        + `(sequence=${sequence}, baseline=${anchor.sequence}, fresh-files=${freshFileCount})`,
    );
  }
  return {
    status: statusValue,
    sequence,
    sourceHash: sourceHash as `sha256:${string}`,
    documentStateHash,
    files,
    freshFileCount,
  };
}

async function runVerticalSlice(
  page: Page,
  studioUrl: string,
  evidence: MutableRunEvidence,
): Promise<void> {
  const screenshotBlank = join(SCRATCH, "01-blank-hybrid-dcc.png");
  const screenshotSelection = join(SCRATCH, "02-component-selection.png");
  const screenshotTrs = join(SCRATCH, "03-trs-redo-saved.png");
  const screenshotRecovered = join(SCRATCH, "04-reloaded-recovered.png");
  const screenshotBg3d = join(SCRATCH, "05-bg3d-handoff.png");
  const screenshotReopened = join(SCRATCH, "06-hybrid-dcc-reopened.png");

  await prepareStudio(page, studioUrl);
  const editor = page.locator('[data-studio-editor="true"]');
  const nativeLayerCount = await countVisibleNativeLayers(page);
  const panel = await openHybridDcc(page);
  const stats = panel.locator('[data-studio-hybrid-dcc-stats="true"]');
  const viewport = panel.locator('[data-studio-hybrid-dcc-viewport="true"]');
  const initialAssetCount = numberAttribute(await stats.getAttribute("data-assets"));
  const initialActiveAssetId = await stats.getAttribute("data-active");
  const blankViewportVisible = await viewport.getByText("3D 작업대가 비어 있습니다.", { exact: true })
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  await page.screenshot({ path: screenshotBlank, animations: "disabled" });
  evidence.blank = {
    studioEditorVisible: await editor.isVisible(),
    nativeLayerCount,
    entrySelector: '[data-studio-hybrid-dcc-open="true"]',
    entryVisible: true,
    dialogVisible: true,
    initialAssetCount,
    initialActiveAssetId: initialActiveAssetId === "none" ? "none" : block(
      "blank-hybrid-dcc-workspace",
      `Hybrid DCC did not start blank (active=${initialActiveAssetId ?? "missing"})`,
    ),
    blankViewportVisible,
    screenshot: screenshotBlank,
  };
  if (nativeLayerCount !== 0 || initialAssetCount !== 0 || !blankViewportVisible) {
    block(
      "blank-studio",
      `Blank precondition failed (layers=${nativeLayerCount}, assets=${initialAssetCount}, viewport=${blankViewportVisible})`,
    );
  }

  const quickTools = panel.locator('section[aria-labelledby="studio-dcc-quick-tools-title"]');
  const addCube = quickTools.getByRole("button", { name: /^큐브 추가/u });
  await visibleOrBlock(addCube, "primitive-ui", "Shipped cube primitive action is not visible");
  await addCube.click();
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-studio-hybrid-dcc-stats="true"]');
    return value?.getAttribute("data-assets") === "1"
      && value.getAttribute("data-active") !== "none";
  }, undefined, { timeout: 12_000 });
  const assetId = await stats.getAttribute("data-active");
  if (!assetId || assetId === "none") block("primitive-identity", "Created cube has no stable asset ID");
  const outlinerIdentity = panel.locator('aside[aria-label="DCC 아웃라이너"] button')
    .filter({ hasText: assetId }).first();
  const selectionSummary = panel.locator(
    '[data-studio-hybrid-dcc-component-selection-summary="true"]',
  );
  const objectSelectionSummary = (await selectionSummary.locator("p").first().innerText()).trim();
  const objectSelectionMode = await viewport.getAttribute("data-selection-mode") ?? "missing";
  const trustedCanvasPointerAttempts = await selectVisibleFace(page, panel);
  const componentSelectionMode = await viewport.getAttribute("data-selection-mode") ?? "missing";
  const componentSelectedElementCount = numberAttribute(
    await viewport.getAttribute("data-selected-elements"),
  );
  const componentSelectionSummary = (await selectionSummary.locator("p").first().innerText()).trim();
  await page.screenshot({ path: screenshotSelection, animations: "disabled" });
  evidence.selection = {
    assetId,
    assetCount: numberAttribute(await stats.getAttribute("data-assets")),
    outlinerIdentityVisible: await outlinerIdentity.isVisible(),
    viewportVisible: await viewport.isVisible(),
    webglContextLost: await viewport.getAttribute("data-context-lost") === "true",
    objectSelectionMode,
    objectSelectionSummary,
    componentSelectionMode,
    componentSelectedElementCount,
    componentSelectionSummary,
    trustedCanvasPointerAttempts,
    screenshot: screenshotSelection,
  };

  const objectMode = panel.getByRole("button", { name: "오브젝트 선택 모드 (4)", exact: true });
  await objectMode.click();
  await page.waitForFunction(() => (
    document.querySelector('[data-studio-hybrid-dcc-viewport="true"]')
      ?.getAttribute("data-selection-mode") === "object"
  ));
  const before = await readTransform(panel);
  await commitTransformField(page, panel, "위치 X", TARGET_TRANSFORM.position[0]);
  await commitTransformField(page, panel, "회전 Y", TARGET_TRANSFORM.rotationDeg[1]);
  await commitTransformField(page, panel, "크기 Z", TARGET_TRANSFORM.scale[2]);
  const edited = await readTransform(panel);
  const undo = panel.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true });
  const undoEnabled = await undo.isEnabled();
  if (!undoEnabled) block("hybrid-dcc-undo", "Hybrid DCC Undo is disabled after numeric TRS edits");
  await undo.click();
  await waitForTransformField(page, "크기 Z", 1);
  const afterOneUndo = await readTransform(panel);
  const redo = panel.getByRole("button", { name: "되돌린 3D 편집 다시 실행", exact: true });
  const redoEnabledAfterUndo = await redo.isEnabled();
  if (!redoEnabledAfterUndo) block("hybrid-dcc-redo", "Hybrid DCC Redo is disabled after one Undo");
  // Anchor the last durable receipt and exact OPFS file identities before the mutation. Unlike the
  // short `saving` badge, receipt sequence/hash attributes remain observable after a fast write.
  const redoPersistenceAnchor = await readPersistenceAnchor(page, panel);
  await redo.click();
  await waitForTransformField(page, "크기 Z", TARGET_TRANSFORM.scale[2]);
  const afterOneRedo = await readTransform(panel);
  const historyAssetId = await stats.getAttribute("data-active");
  const redoWorkspaceStateHash = await stats.getAttribute("data-studio-hybrid-dcc-state-hash");
  if (!redoWorkspaceStateHash) {
    block("opfs-autosave-workspace-hash", "Redo workspace did not expose its authoritative state hash");
  }
  evidence.trsHistory = {
    assetId,
    before,
    edited,
    afterOneUndo,
    afterOneRedo,
    undoEnabled,
    redoEnabledAfterUndo,
    stableIdThroughHistory: historyAssetId === assetId,
    screenshot: screenshotTrs,
  };
  const redoPersistence = await waitForFreshSavedPersistence(
    page,
    panel,
    redoPersistenceAnchor,
    redoWorkspaceStateHash,
  );
  const statusBeforeReload = redoPersistence.status;
  const filesBeforeReload = redoPersistence.files;
  if (filesBeforeReload.length === 0) {
    block("opfs-autosave-files", "Saved status produced no nonempty Hybrid DCC OPFS files");
  }
  await page.screenshot({ path: screenshotTrs, animations: "disabled" });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 20_000 });
  const navigationType = await page.evaluate(() => (
    performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
  )?.type ?? "missing");
  const recoveredPanel = await openHybridDcc(page);
  const recoveredStats = recoveredPanel.locator('[data-studio-hybrid-dcc-stats="true"]');
  const recoveredAssetId = await recoveredStats.getAttribute("data-active") ?? "missing";
  const recoveredTransform = await readTransform(recoveredPanel);
  const recoveryStatus = await recoveredPanel.locator('[data-studio-hybrid-dcc-persistence]')
    .getAttribute("data-studio-hybrid-dcc-persistence") ?? "missing";
  const filesAfterReload = await readHybridDccOpfsFiles(page);
  const afterFileIdentity = new Set(filesAfterReload.map((file) => (
    `${file.path}\u0000${file.byteLength}\u0000${file.sha256}`
  )));
  const unchangedDurableFileCount = filesBeforeReload.filter((file) => afterFileIdentity.has(
    `${file.path}\u0000${file.byteLength}\u0000${file.sha256}`,
  )).length;
  await page.screenshot({ path: screenshotRecovered, animations: "disabled" });
  evidence.persistence = {
    opfsGetDirectoryAvailable: await page.evaluate(() => (
      typeof navigator.storage?.getDirectory === "function"
    )),
    webLocksAvailable: await page.evaluate(() => (
      typeof navigator.locks?.request === "function"
    )),
    redoBaselineSequence: redoPersistenceAnchor.sequence,
    redoPersistedSequence: redoPersistence.sequence,
    redoReceiptSourceHash: redoPersistence.sourceHash,
    redoReceiptDocumentStateHash: redoPersistence.documentStateHash,
    redoWorkspaceStateHash,
    filesBeforeRedo: redoPersistenceAnchor.files,
    freshRedoFileCount: redoPersistence.freshFileCount,
    statusBeforeReload,
    filesBeforeReload,
    totalBytesBeforeReload: filesBeforeReload.reduce((total, file) => total + file.byteLength, 0),
    pageReloadObserved: true,
    navigationType,
    recoveryStatus,
    recoveredAssetId,
    recoveredTransform,
    filesAfterReload,
    unchangedDurableFileCount,
    screenshot: screenshotRecovered,
  };
  if (recoveredAssetId !== assetId) {
    block(
      "opfs-recovery-identity",
      `Reload recovered ${recoveredAssetId}, expected stable ID ${assetId}`,
    );
  }

  const shotMode = recoveredPanel.getByRole("button", {
    name: "컷과 비사실 렌더 작업 모드",
    exact: true,
  });
  await visibleOrBlock(shotMode, "bg3d-handoff-mode", "Shot workbench mode is not visible");
  await shotMode.click();
  await page.waitForURL((url) => url.pathname.endsWith("/studio/3d/dcc/shot"), {
    timeout: 12_000,
  });
  const shotPanel = await openHybridDcc(page);
  const recoveredQuickTools = shotPanel.locator(
    'section[aria-labelledby="studio-dcc-quick-tools-title"]',
  );
  const handoff = recoveredQuickTools.getByRole("button", {
    name: /^3D 배경·컷 편집기로 열기/u,
  });
  await visibleOrBlock(handoff, "bg3d-handoff-button", "Verified GLB handoff is not visible");
  const handoffButtonVisible = await handoff.isVisible();
  await handoff.click();
  await page.waitForFunction(() => {
    const bg3d = document.querySelector('[data-testid="studio-bg3d-dialog"]');
    const logNode = document.querySelector('[data-studio-hybrid-dcc-log="true"]');
    return Boolean(bg3d || logNode?.textContent?.includes("전달 실패"));
  }, undefined, { timeout: 120_000 });
  const bg3dDialog = page.getByTestId("studio-bg3d-dialog");
  const workerMonitor = await readWorkerMonitor(page);
  evidence.workerExport = {
    requestCount: workerMonitor.requests.length,
    responseCount: workerMonitor.responses.length,
    workerErrorCount: workerMonitor.errors.length,
    terminationCount: workerMonitor.terminations.length,
    request: workerMonitor.requests[0] ?? null,
    response: workerMonitor.responses[0] ?? null,
  };
  if (!await bg3dDialog.waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false)) {
    const handoffLog = await shotPanel.locator('[data-studio-hybrid-dcc-log="true"]')
      .textContent().catch(() => null);
    block("bg3d-handoff", handoffLog?.trim() || "BG3D handoff did not open its shipped dialog");
  }
  const layersTab = bg3dDialog.getByRole("tab", { name: /^레이어(?:\s+\d+\/\d+)?$/u });
  await visibleOrBlock(layersTab, "bg3d-layer-tab", "BG3D layer identity UI is not visible");
  await layersTab.click();
  const bg3dIdentity = bg3dDialog.getByText(assetId, { exact: true }).first();
  await visibleOrBlock(
    bg3dIdentity,
    "bg3d-source-identity",
    `BG3D did not expose handed-off source identity ${assetId}`,
  );
  const bg3dCanvas = bg3dDialog.getByTestId("studio-bg3d-viewport").locator("canvas").first();
  await visibleOrBlock(bg3dCanvas, "bg3d-render-canvas", "BG3D WebGL canvas is not visible");
  await page.waitForTimeout(500);
  const renderedFraming = await readNeutralBg3dSubjectFraming(page, bg3dCanvas);
  await page.screenshot({ path: screenshotBg3d, animations: "disabled" });
  const closeBg3d = bg3dDialog.getByRole("button", { name: "닫기", exact: true });
  await closeBg3d.click();
  await bg3dDialog.waitFor({ state: "detached", timeout: 15_000 });
  const reopenedPanel = await openHybridDcc(page);
  const reopenedStats = reopenedPanel.locator('[data-studio-hybrid-dcc-stats="true"]');
  const reopenedAssetId = await reopenedStats.getAttribute("data-active") ?? "missing";
  const reopenedTransform = await readTransform(reopenedPanel);
  await page.screenshot({ path: screenshotReopened, animations: "disabled" });
  evidence.bg3d = {
    handoffButtonVisible,
    dialogVisible: true,
    sourceAssetIdentityVisible: true,
    sourceAssetId: assetId,
    hybridDccReopened: true,
    reopenedAssetId,
    reopenedTransform,
    renderedFraming,
    screenshotHandoff: screenshotBg3d,
    screenshotReopened,
  };
}

function prepareScratch(): void {
  mkdirSync(SCRATCH, { recursive: true });
  for (const name of readdirSync(SCRATCH)) {
    if (!/^(?:0[1-6]-|studio-hybrid-dcc-integration).*(?:\.png|\.json|\.log)$/u.test(name)) {
      continue;
    }
    try {
      unlinkSync(join(SCRATCH, name));
    } catch {
      // A previous screenshot may be open; the next artifact write still fails visibly.
    }
  }
}

function resultFrom(
  status: StudioHybridDccIntegrationResult["status"],
  evidence: MutableRunEvidence,
  diagnostics: StudioHybridDccBrowserDiagnostics,
  blocker: StudioHybridDccBlockedEvidence | null,
): StudioHybridDccIntegrationResult {
  const candidate: StudioHybridDccIntegrationResult = {
    status,
    schemaVersion: STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION,
    execution: "vite-production-preview-shipped-studio-ui",
    route: "/studio",
    blank: evidence.blank ?? null,
    selection: evidence.selection ?? null,
    trsHistory: evidence.trsHistory ?? null,
    persistence: evidence.persistence ?? null,
    workerExport: evidence.workerExport ?? null,
    bg3d: evidence.bg3d ?? null,
    diagnostics,
    blocker,
    issues: [],
    evidenceDirectory: SCRATCH,
  };
  return {
    ...candidate,
    issues: validateStudioHybridDccIntegrationResult(candidate),
  };
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
  const diagnostics: StudioHybridDccBrowserDiagnostics = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    fiveHundredResponses: [],
  };
  const evidence: MutableRunEvidence = {};
  let browser: Browser | null = null;
  let result: StudioHybridDccIntegrationResult;
  try {
    await waitForServer(origin, {
      notReadyMessage: `production preview did not become ready: ${origin}`,
    });
    log(`production preview ready @ ${studioUrl}`);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1_600, height: 1_100 } });
    const page = await context.newPage();
    Object.assign(diagnostics, collectBrowserDiagnostics(page, studioUrl));
    await installStudioGuestSessionBoundary(page);
    await installStudioStateAndWorkerMonitor(page);
    try {
      await runVerticalSlice(page, studioUrl, evidence);
      const verifiedDiagnostics = normalizeStudioHybridDccHeadlessGpuDiagnostics(
        diagnostics,
        studioUrl,
        true,
      );
      const candidate = resultFrom("ok", evidence, verifiedDiagnostics, null);
      result = candidate.issues.length === 0
        ? candidate
        : { ...candidate, status: "failed" };
    } catch (cause) {
      const failureScreenshot = join(SCRATCH, "studio-hybrid-dcc-integration-failure.png");
      await page.screenshot({ path: failureScreenshot, animations: "disabled" }).catch(() => undefined);
      const blocker: StudioHybridDccBlockedEvidence = cause instanceof StudioHybridDccVerifierBlockedError
        ? { boundary: cause.boundary, message: cause.message }
        : {
            boundary: "unexpected-runtime",
            message: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
          };
      result = resultFrom(
        cause instanceof StudioHybridDccVerifierBlockedError ? "blocked" : "failed",
        evidence,
        diagnostics,
        blocker,
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  } catch (cause) {
    result = resultFrom("failed", evidence, diagnostics, {
      boundary: "preview-or-browser-startup",
      message: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
    });
  } finally {
    await browser?.close().catch(() => undefined);
    if (preview) await stopChildProcess(preview).catch(() => undefined);
  }
  writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok" || result.issues.length > 0) process.exitCode = 1;
}

const executedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (executedPath === import.meta.url) {
  void main().catch((cause) => {
    mkdirSync(SCRATCH, { recursive: true });
    const failure = {
      status: "failed",
      schemaVersion: STUDIO_HYBRID_DCC_INTEGRATION_REPORT_SCHEMA_VERSION,
      execution: "vite-production-preview-shipped-studio-ui",
      route: "/studio",
      blocker: {
        boundary: "unhandled-main",
        message: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
      },
      evidenceDirectory: SCRATCH,
    };
    writeFileSync(REPORT_PATH, `${JSON.stringify(failure, null, 2)}\n`);
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  });
}
