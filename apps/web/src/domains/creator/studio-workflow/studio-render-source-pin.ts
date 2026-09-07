import {
  sameStudioAssetRevision,
  validateStudioAssetReferenceV2,
  type StudioAssetReferenceV2,
} from "./studio-asset-reference-v2";

export type StudioSceneEngine = "three" | "babylon";

export interface StudioEmbeddedSceneReferenceV1 {
  readonly version: 1;
  readonly sceneAsset: StudioAssetReferenceV2;
  readonly engine: StudioSceneEngine;
  readonly cameraId: string;
  readonly poseRevisionId: string | null;
  readonly lightingRevisionId: string | null;
  readonly renderPresetId: string;
}

export interface StudioRenderedSceneReceiptV1 {
  readonly version: 1;
  readonly id: string;
  readonly sourceSceneAssetId: string;
  readonly sourceSceneRevisionId: string;
  readonly sourceSceneContentHash: string;
  readonly engine: StudioSceneEngine;
  readonly cameraId: string;
  readonly poseRevisionId: string | null;
  readonly lightingRevisionId: string | null;
  readonly renderPresetId: string;
  readonly output: StudioAssetReferenceV2;
  readonly depth: StudioAssetReferenceV2 | null;
  readonly normal: StudioAssetReferenceV2 | null;
  readonly objectIdMask: StudioAssetReferenceV2 | null;
  readonly renderedAt: string;
}

export interface StudioMotionSourcePinV1 {
  readonly version: 1;
  readonly workId: string;
  readonly sourceServerRevision: number | null;
  readonly sourceContentDigest: string;
  readonly semanticPanelIds: readonly string[];
  readonly createdAt: string;
}

export interface StudioMotionRenderReceiptV1 {
  readonly version: 1;
  readonly id: string;
  readonly motionDocumentId: string;
  readonly source: StudioMotionSourcePinV1;
  readonly range: {
    readonly startMs: number;
    readonly endMs: number;
  };
  readonly frameRate: number;
  readonly output: StudioAssetReferenceV2;
  readonly renderedAt: string;
}

export type StudioRenderStaleReason =
  | "scene-asset"
  | "scene-revision"
  | "scene-content-hash"
  | "engine"
  | "camera"
  | "pose"
  | "lighting"
  | "render-preset"
  | "motion-server-revision"
  | "motion-content-digest"
  | "motion-panel-set";

export interface StudioRenderStaleness {
  readonly stale: boolean;
  readonly reasons: readonly StudioRenderStaleReason[];
}

export type StudioRenderSourceIssueCode =
  | "invalid-id"
  | "invalid-source-revision"
  | "missing-source-digest"
  | "invalid-panel-id"
  | "duplicate-panel-id"
  | "invalid-time-range"
  | "invalid-frame-rate"
  | "invalid-timestamp"
  | "invalid-source-asset"
  | "invalid-output-asset"
  | "receipt-source-mismatch";

export interface StudioRenderSourceIssue {
  readonly code: StudioRenderSourceIssueCode;
  readonly path: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validOptionalRevision(value: number | null): boolean {
  return value === null || (Number.isSafeInteger(value) && value >= 1);
}

function samePanelSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

export function validateStudioEmbeddedSceneReference(
  reference: StudioEmbeddedSceneReferenceV1,
): readonly StudioRenderSourceIssue[] {
  const issues: StudioRenderSourceIssue[] = [];
  if (
    !SAFE_ID.test(reference.cameraId)
    || !SAFE_ID.test(reference.renderPresetId)
    || (reference.poseRevisionId !== null && !SAFE_ID.test(reference.poseRevisionId))
    || (reference.lightingRevisionId !== null && !SAFE_ID.test(reference.lightingRevisionId))
  ) {
    issues.push({
      code: "invalid-id",
      path: "scene",
      message: "Scene camera, pose, lighting, or render-preset identifier is invalid.",
    });
  }
  for (const issue of validateStudioAssetReferenceV2(reference.sceneAsset)) {
    issues.push({
      code: "invalid-source-asset",
      path: "scene.sceneAsset",
      message: issue.message,
    });
  }
  return issues;
}

export function validateStudioRenderedSceneReceipt(
  receipt: StudioRenderedSceneReceiptV1,
): readonly StudioRenderSourceIssue[] {
  const issues: StudioRenderSourceIssue[] = [];
  if (!SAFE_ID.test(receipt.id) || !validTimestamp(receipt.renderedAt)) {
    issues.push({
      code: !SAFE_ID.test(receipt.id) ? "invalid-id" : "invalid-timestamp",
      path: "sceneReceipt",
      message: "Rendered scene receipt identifier or timestamp is invalid.",
    });
  }
  for (const field of [
    "sourceSceneAssetId", "sourceSceneRevisionId", "cameraId", "renderPresetId",
    "poseRevisionId", "lightingRevisionId",
  ] as const) {
    const value = receipt[field];
    if (value === null && (field === "poseRevisionId" || field === "lightingRevisionId")) continue;
    if (typeof value === "string" && SAFE_ID.test(value)) continue;
    issues.push({
      code: "invalid-id",
      path: `sceneReceipt.${field}`,
      message: "Rendered scene source identifier is invalid.",
    });
  }
  if (
    receipt.version !== 1
    || (receipt.engine !== "three" && receipt.engine !== "babylon")
    || !SHA256.test(receipt.sourceSceneContentHash)
  ) {
    issues.push({
      code: "invalid-source-asset",
      path: "sceneReceipt",
      message: "Rendered scene receipt must pin a supported source format, engine, and canonical sha256 digest.",
    });
  }
  for (const [path, asset] of [
    ["output", receipt.output],
    ["depth", receipt.depth],
    ["normal", receipt.normal],
    ["objectIdMask", receipt.objectIdMask],
  ] as const) {
    if (asset === null) continue;
    for (const issue of validateStudioAssetReferenceV2(asset)) {
      issues.push({
        code: "invalid-output-asset",
        path: `sceneReceipt.${path}`,
        message: issue.message,
      });
    }
  }
  return issues;
}

export function compareStudioSceneReceiptToSource(input: {
  readonly source: StudioEmbeddedSceneReferenceV1;
  readonly receipt: StudioRenderedSceneReceiptV1;
}): StudioRenderStaleness {
  const reasons = new Set<StudioRenderStaleReason>();
  if (input.receipt.sourceSceneAssetId !== input.source.sceneAsset.assetId) {
    reasons.add("scene-asset");
  }
  if (input.receipt.sourceSceneRevisionId !== input.source.sceneAsset.revisionId) {
    reasons.add("scene-revision");
  }
  if (input.receipt.sourceSceneContentHash !== input.source.sceneAsset.contentHash) {
    reasons.add("scene-content-hash");
  }
  if (input.receipt.engine !== input.source.engine) reasons.add("engine");
  if (input.receipt.cameraId !== input.source.cameraId) reasons.add("camera");
  if (input.receipt.poseRevisionId !== input.source.poseRevisionId) reasons.add("pose");
  if (input.receipt.lightingRevisionId !== input.source.lightingRevisionId) reasons.add("lighting");
  if (input.receipt.renderPresetId !== input.source.renderPresetId) reasons.add("render-preset");
  return { stale: reasons.size > 0, reasons: [...reasons] };
}

export function validateStudioMotionSourcePin(
  source: StudioMotionSourcePinV1,
): readonly StudioRenderSourceIssue[] {
  const issues: StudioRenderSourceIssue[] = [];
  if (!SAFE_ID.test(source.workId)) {
    issues.push({
      code: "invalid-id",
      path: "motionSource.workId",
      message: "Motion source work ID is invalid.",
    });
  }
  if (!validOptionalRevision(source.sourceServerRevision)) {
    issues.push({
      code: "invalid-source-revision",
      path: "motionSource.sourceServerRevision",
      message: "Motion source server revision is invalid.",
    });
  }
  if (!source.sourceContentDigest.trim()) {
    issues.push({
      code: "missing-source-digest",
      path: "motionSource.sourceContentDigest",
      message: "Motion source must pin its authoring content digest.",
    });
  }
  if (!validTimestamp(source.createdAt)) {
    issues.push({
      code: "invalid-timestamp",
      path: "motionSource.createdAt",
      message: "Motion source timestamp is invalid.",
    });
  }
  const panels = new Set<string>();
  source.semanticPanelIds.forEach((id, index) => {
    if (!SAFE_ID.test(id)) {
      issues.push({
        code: "invalid-panel-id",
        path: `motionSource.semanticPanelIds[${index}]`,
        message: `Motion source panel ID is invalid: ${id}`,
      });
    } else if (panels.has(id)) {
      issues.push({
        code: "duplicate-panel-id",
        path: `motionSource.semanticPanelIds[${index}]`,
        message: `Motion source panel ID is duplicated: ${id}`,
      });
    }
    panels.add(id);
  });
  return issues;
}

export function compareStudioMotionSourceToCurrent(
  source: StudioMotionSourcePinV1,
  current: {
    readonly serverRevision: number | null;
    readonly contentDigest: string;
    readonly semanticPanelIds: readonly string[];
  },
): StudioRenderStaleness {
  const reasons = new Set<StudioRenderStaleReason>();
  if (source.sourceServerRevision !== current.serverRevision) {
    reasons.add("motion-server-revision");
  }
  if (source.sourceContentDigest !== current.contentDigest) {
    reasons.add("motion-content-digest");
  }
  if (!samePanelSet(source.semanticPanelIds, current.semanticPanelIds)) {
    reasons.add("motion-panel-set");
  }
  return { stale: reasons.size > 0, reasons: [...reasons] };
}

export function validateStudioMotionRenderReceipt(
  receipt: StudioMotionRenderReceiptV1,
): readonly StudioRenderSourceIssue[] {
  const issues = [...validateStudioMotionSourcePin(receipt.source)];
  if (!SAFE_ID.test(receipt.id) || !SAFE_ID.test(receipt.motionDocumentId)) {
    issues.push({
      code: "invalid-id",
      path: "motionReceipt",
      message: "Motion receipt or motion-document identifier is invalid.",
    });
  }
  if (
    !Number.isSafeInteger(receipt.range.startMs)
    || !Number.isSafeInteger(receipt.range.endMs)
    || receipt.range.startMs < 0
    || receipt.range.endMs <= receipt.range.startMs
  ) {
    issues.push({
      code: "invalid-time-range",
      path: "motionReceipt.range",
      message: "Motion render range is invalid.",
    });
  }
  if (!Number.isFinite(receipt.frameRate) || receipt.frameRate <= 0 || receipt.frameRate > 240) {
    issues.push({
      code: "invalid-frame-rate",
      path: "motionReceipt.frameRate",
      message: "Motion frame rate must be above zero and at most 240 fps.",
    });
  }
  if (!validTimestamp(receipt.renderedAt)) {
    issues.push({
      code: "invalid-timestamp",
      path: "motionReceipt.renderedAt",
      message: "Motion render timestamp is invalid.",
    });
  }
  for (const issue of validateStudioAssetReferenceV2(receipt.output)) {
    issues.push({
      code: "invalid-output-asset",
      path: "motionReceipt.output",
      message: issue.message,
    });
  }
  return issues;
}

export function sceneReceiptMatchesOutput(
  receipt: StudioRenderedSceneReceiptV1,
  output: StudioAssetReferenceV2,
): boolean {
  return sameStudioAssetRevision(receipt.output, output);
}
