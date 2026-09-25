import {
  canonicalizeStudioReferenceBoardSha256,
  type StudioReferenceBoardAssetDescriptor,
} from "./studio-reference-board";

/** Page-owned, non-rasterized trace/reference guide. Source bytes stay in the asset library. */
export const STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION = 1 as const;
export const STUDIO_DRAWING_PRACTICE_MAX_SERIALIZED_BYTES = 4 * 1_024;
export const STUDIO_DRAWING_PRACTICE_MAX_COORDINATE = 10_000_000;
export const STUDIO_DRAWING_PRACTICE_DEFAULT_OPACITY = 0.3;
export const STUDIO_DRAWING_PRACTICE_MAX_ATTEMPT_INDEX = 9_999;

const MAX_IDENTIFIER_LENGTH = 160;
const MAX_NAME_LENGTH = 512;
const MAX_MIME_TYPE_LENGTH = 128;
const IMAGE_MIME_TYPE_PATTERN = /^image\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u;

export type StudioDrawingPracticePurpose = "practice" | "production-assist";
export type StudioDrawingPracticeStatus = "active" | "completed";
export type StudioDrawingPracticeViewMode = "overlay" | "reference-window";
export type StudioDrawingPracticePlacement = "below-artwork" | "above-artwork";

export interface StudioDrawingPracticeView {
  mode: StudioDrawingPracticeViewMode;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDeg: number;
  opacity: number;
  grayscale: boolean;
  flipX: boolean;
  flipY: boolean;
  visible: boolean;
  /** Locked guides never receive pointer input, so drawing gestures pass through. */
  locked: boolean;
  placement: StudioDrawingPracticePlacement;
}

export interface StudioDrawingPracticeDocument {
  version: typeof STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION;
  attemptId: string;
  attemptIndex: number;
  purpose: StudioDrawingPracticePurpose;
  status: StudioDrawingPracticeStatus;
  source: StudioReferenceBoardAssetDescriptor;
  view: StudioDrawingPracticeView;
  targetGroupId?: string;
}

export interface StudioDrawingPracticeViewport {
  canvasWidth: number;
  canvasHeight: number;
}

export interface CreateStudioDrawingPracticeInput {
  attemptId: string;
  source: StudioReferenceBoardAssetDescriptor;
  viewport: StudioDrawingPracticeViewport;
  purpose?: StudioDrawingPracticePurpose;
  targetGroupId?: string;
}

const ROOT_KEYS = [
  "version", "attemptId", "attemptIndex", "purpose", "status", "source", "view", "targetGroupId",
] as const;
const SOURCE_KEYS = ["sha256", "assetId", "name", "mimeType", "width", "height"] as const;
const VIEW_KEYS = [
  "mode", "centerX", "centerY", "width", "height", "rotationDeg", "opacity", "grayscale",
  "flipX", "flipY", "visible", "locked", "placement",
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedCoordinate(value: unknown, fallback: number): number {
  return clamp(
    finiteNumber(value, fallback),
    -STUDIO_DRAWING_PRACTICE_MAX_COORDINATE,
    STUDIO_DRAWING_PRACTICE_MAX_COORDINATE,
  );
}

function boundedDimension(value: unknown, fallback: number): number {
  return clamp(finiteNumber(value, fallback), 1, STUDIO_DRAWING_PRACTICE_MAX_COORDINATE);
}

function safeText(value: unknown, maximumLength: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumLength
    || value.trim() !== value) return false;
  return ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

function safeIdentifier(value: unknown): value is string {
  return safeText(value, MAX_IDENTIFIER_LENGTH)
    && value !== "__proto__" && value !== "constructor" && value !== "prototype";
}

function optionalSafeText(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return safeText(normalized, maximumLength) ? normalized : undefined;
}

function safeViewport(viewport: StudioDrawingPracticeViewport): StudioDrawingPracticeViewport {
  return {
    canvasWidth: boundedDimension(viewport.canvasWidth, 800),
    canvasHeight: boundedDimension(viewport.canvasHeight, 1_200),
  };
}

function normalizeRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return {};
    const result: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.enumerable && "value" in descriptor) result[key] = descriptor.value;
    }
    return result;
  } catch {
    return {};
  }
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  required: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
    if (required.some((key) => !ownKeys.includes(key))) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: Record<string, unknown> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function normalizeSource(value: unknown): StudioReferenceBoardAssetDescriptor | null {
  const source = dataRecord(value);
  const sha256 = canonicalizeStudioReferenceBoardSha256(source.sha256);
  if (!sha256) return null;
  const assetId = optionalSafeText(source.assetId, MAX_IDENTIFIER_LENGTH);
  const name = optionalSafeText(source.name, MAX_NAME_LENGTH);
  const mimeType = optionalSafeText(source.mimeType, MAX_MIME_TYPE_LENGTH)?.toLowerCase();
  const width = typeof source.width === "number" && Number.isFinite(source.width) && source.width > 0
    ? Math.round(clamp(source.width, 1, STUDIO_DRAWING_PRACTICE_MAX_COORDINATE)) : undefined;
  const height = typeof source.height === "number" && Number.isFinite(source.height) && source.height > 0
    ? Math.round(clamp(source.height, 1, STUDIO_DRAWING_PRACTICE_MAX_COORDINATE)) : undefined;
  return {
    sha256,
    ...(assetId && safeIdentifier(assetId) ? { assetId } : {}),
    ...(name ? { name } : {}),
    ...(mimeType && IMAGE_MIME_TYPE_PATTERN.test(mimeType) ? { mimeType } : {}),
    ...(width !== undefined && height !== undefined ? { width, height } : {}),
  };
}

function strictSource(value: unknown): StudioReferenceBoardAssetDescriptor | null {
  const source = exactDataRecord(value, SOURCE_KEYS, ["sha256"]);
  if (!source) return null;
  const normalized = normalizeSource(source);
  if (!normalized || source.sha256 !== normalized.sha256) return null;
  if (Object.hasOwn(source, "assetId") && normalized.assetId !== source.assetId) return null;
  if (Object.hasOwn(source, "name") && normalized.name !== source.name) return null;
  if (Object.hasOwn(source, "mimeType") && normalized.mimeType !== source.mimeType) return null;
  const hasWidth = Object.hasOwn(source, "width");
  const hasHeight = Object.hasOwn(source, "height");
  if (hasWidth !== hasHeight) return null;
  if (hasWidth && (normalized.width !== source.width || normalized.height !== source.height)) return null;
  return normalized;
}

/** Deterministic contain planner with a small safe margin around the page. */
export function fitStudioDrawingPracticeToPage(
  source: Pick<StudioReferenceBoardAssetDescriptor, "width" | "height">,
  viewport: StudioDrawingPracticeViewport,
): Pick<StudioDrawingPracticeView, "centerX" | "centerY" | "width" | "height"> {
  const safe = safeViewport(viewport);
  const sourceWidth = boundedDimension(source.width, safe.canvasWidth);
  const sourceHeight = boundedDimension(source.height, safe.canvasHeight);
  const scale = Math.min(
    (safe.canvasWidth * 0.92) / sourceWidth,
    (safe.canvasHeight * 0.92) / sourceHeight,
  );
  return {
    centerX: safe.canvasWidth / 2,
    centerY: safe.canvasHeight / 2,
    width: Math.max(1, sourceWidth * scale),
    height: Math.max(1, sourceHeight * scale),
  };
}

export function createStudioDrawingPracticeDocument(
  input: CreateStudioDrawingPracticeInput,
): StudioDrawingPracticeDocument {
  const source = normalizeSource(input.source);
  if (!source || !safeIdentifier(input.attemptId)) {
    throw new Error("따라 그리기 원본 또는 시도 식별자가 올바르지 않습니다.");
  }
  const fit = fitStudioDrawingPracticeToPage(source, input.viewport);
  return {
    version: STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION,
    attemptId: input.attemptId,
    attemptIndex: 1,
    purpose: input.purpose ?? "practice",
    status: "active",
    source,
    view: {
      mode: "overlay",
      ...fit,
      rotationDeg: 0,
      opacity: STUDIO_DRAWING_PRACTICE_DEFAULT_OPACITY,
      grayscale: false,
      flipX: false,
      flipY: false,
      visible: true,
      locked: true,
      placement: "above-artwork",
    },
    ...(input.targetGroupId && safeIdentifier(input.targetGroupId)
      ? { targetGroupId: input.targetGroupId } : {}),
  };
}

export function normalizeStudioDrawingPracticeDocument(
  value: unknown,
  viewport: StudioDrawingPracticeViewport,
): StudioDrawingPracticeDocument | null {
  const root = dataRecord(value);
  const source = normalizeSource(root.source);
  if (!source || !safeIdentifier(root.attemptId)) return null;
  const rawView = dataRecord(root.view);
  const fit = fitStudioDrawingPracticeToPage(source, viewport);
  const targetGroupId = optionalSafeText(root.targetGroupId, MAX_IDENTIFIER_LENGTH);
  const normalized: StudioDrawingPracticeDocument = {
    version: STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION,
    attemptId: root.attemptId,
    attemptIndex: clamp(
      Math.round(finiteNumber(root.attemptIndex, 1)),
      1,
      STUDIO_DRAWING_PRACTICE_MAX_ATTEMPT_INDEX,
    ),
    purpose: root.purpose === "production-assist" ? "production-assist" : "practice",
    status: root.status === "completed" ? "completed" : "active",
    source,
    view: {
      mode: rawView.mode === "reference-window" ? "reference-window" : "overlay",
      centerX: boundedCoordinate(rawView.centerX, fit.centerX),
      centerY: boundedCoordinate(rawView.centerY, fit.centerY),
      width: boundedDimension(rawView.width, fit.width),
      height: boundedDimension(rawView.height, fit.height),
      rotationDeg: normalizeRotation(rawView.rotationDeg),
      opacity: clamp(finiteNumber(rawView.opacity, STUDIO_DRAWING_PRACTICE_DEFAULT_OPACITY), 0, 1),
      grayscale: rawView.grayscale === true,
      flipX: rawView.flipX === true,
      flipY: rawView.flipY === true,
      visible: rawView.visible !== false,
      locked: rawView.locked !== false,
      placement: rawView.placement === "below-artwork" ? "below-artwork" : "above-artwork",
    },
    ...(targetGroupId && safeIdentifier(targetGroupId) ? { targetGroupId } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(normalized)).byteLength
    <= STUDIO_DRAWING_PRACTICE_MAX_SERIALIZED_BYTES ? normalized : null;
}

/** Strict import/collaboration boundary. Unknown fields and accessors are rejected. */
export function parseStudioDrawingPracticeDocument(
  value: unknown,
): StudioDrawingPracticeDocument | null {
  const root = exactDataRecord(
    value,
    ROOT_KEYS,
    ["version", "attemptId", "attemptIndex", "purpose", "status", "source", "view"],
  );
  if (!root || root.version !== STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION
    || !safeIdentifier(root.attemptId)
    || typeof root.attemptIndex !== "number" || !Number.isSafeInteger(root.attemptIndex)
    || root.attemptIndex < 1 || root.attemptIndex > STUDIO_DRAWING_PRACTICE_MAX_ATTEMPT_INDEX
    || (root.purpose !== "practice" && root.purpose !== "production-assist")
    || (root.status !== "active" && root.status !== "completed")) return null;
  const source = strictSource(root.source);
  const view = exactDataRecord(root.view, VIEW_KEYS, VIEW_KEYS);
  if (!source || !view) return null;
  if ((view.mode !== "overlay" && view.mode !== "reference-window")
    || typeof view.centerX !== "number" || !Number.isFinite(view.centerX)
    || Math.abs(view.centerX) > STUDIO_DRAWING_PRACTICE_MAX_COORDINATE
    || typeof view.centerY !== "number" || !Number.isFinite(view.centerY)
    || Math.abs(view.centerY) > STUDIO_DRAWING_PRACTICE_MAX_COORDINATE
    || typeof view.width !== "number" || !Number.isFinite(view.width)
    || view.width < 1 || view.width > STUDIO_DRAWING_PRACTICE_MAX_COORDINATE
    || typeof view.height !== "number" || !Number.isFinite(view.height)
    || view.height < 1 || view.height > STUDIO_DRAWING_PRACTICE_MAX_COORDINATE
    || typeof view.rotationDeg !== "number" || !Number.isFinite(view.rotationDeg)
    || view.rotationDeg < -180 || view.rotationDeg >= 180 || Object.is(view.rotationDeg, -0)
    || typeof view.opacity !== "number" || !Number.isFinite(view.opacity)
    || view.opacity < 0 || view.opacity > 1
    || typeof view.grayscale !== "boolean" || typeof view.flipX !== "boolean"
    || typeof view.flipY !== "boolean" || typeof view.visible !== "boolean"
    || typeof view.locked !== "boolean"
    || (view.placement !== "below-artwork" && view.placement !== "above-artwork")) return null;
  if (Object.hasOwn(root, "targetGroupId") && !safeIdentifier(root.targetGroupId)) return null;
  const parsed: StudioDrawingPracticeDocument = {
    version: STUDIO_DRAWING_PRACTICE_DOCUMENT_VERSION,
    attemptId: root.attemptId,
    attemptIndex: root.attemptIndex,
    purpose: root.purpose,
    status: root.status,
    source,
    view: {
      mode: view.mode,
      centerX: view.centerX,
      centerY: view.centerY,
      width: view.width,
      height: view.height,
      rotationDeg: view.rotationDeg,
      opacity: view.opacity,
      grayscale: view.grayscale,
      flipX: view.flipX,
      flipY: view.flipY,
      visible: view.visible,
      locked: view.locked,
      placement: view.placement,
    },
    ...(typeof root.targetGroupId === "string" ? { targetGroupId: root.targetGroupId } : {}),
  };
  return new TextEncoder().encode(JSON.stringify(parsed)).byteLength
    <= STUDIO_DRAWING_PRACTICE_MAX_SERIALIZED_BYTES ? parsed : null;
}

export function patchStudioDrawingPracticeDocument(
  document: StudioDrawingPracticeDocument,
  patch: Partial<Omit<StudioDrawingPracticeDocument, "version" | "source" | "view">> & {
    view?: Partial<StudioDrawingPracticeView>;
  },
  viewport: StudioDrawingPracticeViewport,
): StudioDrawingPracticeDocument {
  return normalizeStudioDrawingPracticeDocument({
    ...document,
    ...patch,
    source: document.source,
    view: { ...document.view, ...patch.view },
  }, viewport) ?? document;
}

export function completeStudioDrawingPracticeDocument(
  document: StudioDrawingPracticeDocument,
): StudioDrawingPracticeDocument {
  return { ...document, status: "completed" };
}

export function relinkStudioDrawingPracticeSource(
  document: StudioDrawingPracticeDocument,
  sourceValue: StudioReferenceBoardAssetDescriptor,
  viewport: StudioDrawingPracticeViewport,
): StudioDrawingPracticeDocument {
  const source = normalizeSource(sourceValue);
  if (!source) return document;
  const fit = fitStudioDrawingPracticeToPage(source, viewport);
  return normalizeStudioDrawingPracticeDocument({
    ...document,
    source,
    status: "active",
    view: {
      ...document.view,
      ...fit,
      rotationDeg: 0,
      visible: true,
      locked: true,
    },
  }, viewport) ?? document;
}

export function retryStudioDrawingPracticeDocument(
  document: StudioDrawingPracticeDocument,
  attemptId: string,
  targetGroupId?: string,
): StudioDrawingPracticeDocument {
  if (!safeIdentifier(attemptId)) return document;
  const nextTargetGroupId = targetGroupId && safeIdentifier(targetGroupId)
    ? targetGroupId
    : document.targetGroupId;
  return {
    ...document,
    attemptId,
    attemptIndex: Math.min(
      STUDIO_DRAWING_PRACTICE_MAX_ATTEMPT_INDEX,
      document.attemptIndex + 1,
    ),
    status: "active",
    view: { ...document.view, visible: true, locked: true },
    ...(nextTargetGroupId ? { targetGroupId: nextTargetGroupId } : {}),
  };
}

export function resetStudioDrawingPracticePlacement(
  document: StudioDrawingPracticeDocument,
  viewport: StudioDrawingPracticeViewport,
): StudioDrawingPracticeDocument {
  return {
    ...document,
    view: {
      ...document.view,
      ...fitStudioDrawingPracticeToPage(document.source, viewport),
      rotationDeg: 0,
    },
  };
}

export function mirrorStudioDrawingPracticeDocument(
  document: StudioDrawingPracticeDocument,
  canvasWidth: number,
): StudioDrawingPracticeDocument {
  return {
    ...document,
    view: {
      ...document.view,
      centerX: boundedCoordinate(canvasWidth, 0) - document.view.centerX,
      flipX: !document.view.flipX,
      rotationDeg: normalizeRotation(-document.view.rotationDeg),
    },
  };
}

export function studioDrawingPracticeHasContent(value: unknown): boolean {
  return parseStudioDrawingPracticeDocument(value) !== null;
}

export function areStudioDrawingPracticeDocumentsEqual(
  left: StudioDrawingPracticeDocument | null | undefined,
  right: StudioDrawingPracticeDocument | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
