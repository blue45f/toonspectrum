/**
 * Non-destructive "editable raster copy" preparation.
 *
 * The plan uses the exact Studio SVG serializer as a fidelity preflight, then the shared
 * Worker-capable SVG -> PNG seam performs the expensive browser rasterization. The original
 * document elements are never removed or patched by this module. Callers materialize one new
 * full-page ImageEl only after an explicit confirmation or an operation (such as filters) whose
 * contract says it creates a merged copy.
 */

import { isEffectivelyHidden, isEffectivelyLocked } from "./studio-layers";
import {
  exportPageToSvg,
} from "./studio-svg-export";

import type { El, ImageEl } from "./studio-element-model";
import type { LayerGroup } from "./studio-layers";
import type { SvgExportTheme } from "./studio-svg-export";
import type {
  StudioVectorReferenceInput,
  StudioVectorReferenceBudgets,
  StudioVectorReferenceRenderOptions,
  StudioVectorReferenceResult,
} from "./studio-vector-fill-reference";

const EDITABLE_RASTER_COPY_NAMESPACE = "editable-raster-copy-v1";
const PNG_BASE64_PREFIX = "data:image/png;base64,";
const PNG_DATA_URL_PREFIX = "data:image/png;base64,iVBORw0KGgo";
const EDITABLE_RASTER_COPY_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const EDITABLE_RASTER_COPY_MAX_SVG_BYTES = 16 * 1024 * 1024;
const EDITABLE_RASTER_COPY_MAX_PNG_BYTES = 32 * 1024 * 1024;
// General merge callers keep the established browser hard cap. Page filters clamp to 4MP below.
const EDITABLE_RASTER_COPY_MAX_PIXELS = 16 * 1024 * 1024;
const PAGE_COMPOSITE_FILTER_MAX_PIXELS = 4 * 1024 * 1024;
const PAGE_COMPOSITE_FILTER_MAX_PNG_BYTES = 4 * 1024 * 1024;
const UTF8_ENCODER = new TextEncoder();

export interface StudioEditableRasterCopyInput {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly elements: readonly El[];
  readonly groups?: readonly LayerGroup[];
  /** Omit for all effectively visible document elements. */
  readonly sourceIds?: readonly string[];
  readonly theme?: SvgExportTheme;
  /** Visible-page copies include the authored background; selected-layer copies normally do not. */
  readonly includeBackground?: boolean;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
  readonly name?: string;
  /** BACK -> FRONT insertion index. Visible-page copies default to the top. */
  readonly insertionIndex?: number;
  readonly documentMutationBlockedReason?: string | null;
  readonly budgets?: StudioVectorReferenceBudgets;
}

export interface StudioEditablePageRasterSource {
  readonly id: string;
  readonly canvasH: number;
  readonly elements: readonly El[];
  readonly groups?: readonly LayerGroup[];
  readonly hideMaster?: boolean;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
}

export interface StudioEditablePageRasterContextInput {
  readonly page: StudioEditablePageRasterSource;
  readonly canvasWidth: number;
  readonly masterElements: readonly El[];
  readonly localHiddenElementIds: ReadonlySet<string>;
  readonly theme?: SvgExportTheme;
  readonly name: string;
  readonly collaborationLockedReason?: string | null;
  readonly sharedDocument: boolean;
  readonly masterEditMode: boolean;
  readonly reviewLocked: boolean;
  readonly timelinePlaying: boolean;
  readonly viewTransformSuppressed: boolean;
  readonly budgets?: StudioVectorReferenceBudgets;
}

export interface StudioEditablePageRasterContext {
  readonly input: StudioEditableRasterCopyInput;
  readonly destinationElements: readonly El[];
}

export interface StudioRasterPreparationSourceSummary {
  readonly visibleContentCount: number;
  readonly hiddenContentCount: number;
  readonly visibleRasterCount: number;
  readonly visibleUnlockedRasterCount: number;
  readonly visibleVectorDrawCount: number;
  readonly exactRenderableVisibleCount: number;
  readonly unsupportedVisibleCount: number;
  readonly unsupportedReasons: readonly string[];
  readonly hasPageBackground: boolean;
}

export interface StudioRasterPreparationSourceSummaryInput {
  readonly width: number;
  readonly height: number;
  readonly elements: readonly El[];
  readonly groups?: readonly LayerGroup[];
  readonly theme?: SvgExportTheme;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
  /** Studio pages normally always paint a background, even when `bg` is omitted. */
  readonly hasPageBackground?: boolean;
}

export interface StudioEditableRasterCopyPlan {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly sourceElements: readonly El[];
  readonly sourceIds: readonly string[];
  readonly groups: readonly LayerGroup[];
  readonly theme?: SvgExportTheme;
  readonly includeBackground: boolean;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
  readonly name: string;
  readonly insertionIndex: number;
  readonly sourceFingerprint: string;
  readonly sourceElementCount: number;
  readonly budgets?: StudioVectorReferenceBudgets;
}

export type StudioEditableRasterCopyFailureCode =
  | "invalid-page-id"
  | "invalid-dimensions"
  | "document-locked"
  | "no-visible-source"
  | "source-budget-exceeded"
  | "svg-budget-exceeded"
  | "unsupported-fidelity";

export type StudioEditableRasterCopyPlanResult =
  | { readonly ok: true; readonly plan: StudioEditableRasterCopyPlan }
  | {
      readonly ok: false;
      readonly code: StudioEditableRasterCopyFailureCode;
      readonly reason: string;
    };

export type StudioEditableRasterCopyApplyResult =
  | { readonly ok: true; readonly elements: El[] }
  | {
      readonly ok: false;
      readonly code: "stale-plan" | "invalid-composite";
      readonly reason: string;
    };

export type StudioEditableRasterCopyRenderer = (
  input: StudioVectorReferenceInput,
  options?: StudioVectorReferenceRenderOptions,
) => Promise<StudioVectorReferenceResult>;

function normalizeCopyName(value: string | undefined): string {
  let safeValue = "";
  for (const character of value ?? "편집용 래스터 복사본") {
    const codePoint = character.codePointAt(0) ?? 0;
    safeValue += codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? " " : character;
  }
  const normalized = safeValue.trim();
  return (normalized || "편집용 래스터 복사본").slice(0, 120);
}

function normalizeInsertionIndex(value: number | undefined, maximum: number): number {
  if (!Number.isSafeInteger(value)) return maximum;
  return Math.max(0, Math.min(value!, maximum));
}

function validDimensions(
  width: number,
  height: number,
  maxPixelCount = EDITABLE_RASTER_COPY_MAX_PIXELS,
): boolean {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width * height <= maxPixelCount;
}

function boundedByteBudget(value: number | undefined, hardMaximum: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.min(value!, hardMaximum)
    : hardMaximum;
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function pngDataUrlByteLength(value: string): number | null {
  if (!value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const payload = value.slice(PNG_BASE64_PREFIX.length);
  if (payload.length === 0 || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload)) {
    return null;
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor(payload.length * 3 / 4) - padding;
}

/** Keep the lazy preparation seam independent from the Studio's eager vector runtime chunk. */
function fingerprintEditableRasterCopy(value: string): string {
  const bytes = UTF8_ENCODER.encode(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
    second = (second ^ (second >>> 13)) >>> 0;
  }
  return `${EDITABLE_RASTER_COPY_NAMESPACE}:${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

/**
 * Builds a key-order-independent JSON payload for document ownership.
 *
 * The SVG serializer can gain an outline stroker after its lazy chunk loads. That improves the
 * rendered SVG without changing the authored document, so an SVG hash cannot be the durable
 * plan/current fingerprint. This payload deliberately contains only render-affecting source
 * state and remains identical before and after optional renderer modules initialize.
 */
function canonicalFingerprintJson(value: unknown): string {
  const ancestors = new Set<object>();
  const normalize = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== "object") return entry;
    if (ancestors.has(entry)) throw new TypeError("circular raster fingerprint source");
    ancestors.add(entry);
    try {
      if (Array.isArray(entry)) return entry.map(normalize);
      const record = entry as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .filter((key) => record[key] !== undefined)
          .toSorted()
          .map((key) => [key, normalize(record[key])]),
      );
    } finally {
      ancestors.delete(entry);
    }
  };
  const serialized = JSON.stringify(normalize(value));
  if (serialized === undefined) throw new TypeError("empty raster fingerprint source");
  return serialized;
}

function fingerprintEditableRasterCopySource(input: {
  readonly width: number;
  readonly height: number;
  readonly sourceElements: readonly El[];
  readonly theme?: SvgExportTheme;
  readonly includeBackground: boolean;
  readonly bg?: string;
  readonly bgGrad?: readonly string[] | null;
}): string {
  return fingerprintEditableRasterCopy(canonicalFingerprintJson({
    width: input.width,
    height: input.height,
    elements: input.sourceElements,
    theme: input.theme ?? null,
    background: input.includeBackground
      ? { color: input.bg ?? null, gradient: input.bgGrad ?? null }
      : null,
  }));
}

function selectCopySources(input: StudioEditableRasterCopyInput): readonly El[] {
  const groups = [...(input.groups ?? [])];
  const requested = input.sourceIds ? new Set(input.sourceIds) : null;
  return input.elements.filter((element) =>
    !isEffectivelyHidden(element, groups) && (!requested || requested.has(element.id))
  );
}

/** Builds the page snapshot and all fail-closed reasons inside the user-triggered lazy seam. */
export function createStudioEditablePageRasterContext(
  context: StudioEditablePageRasterContextInput,
): StudioEditablePageRasterContext {
  const { page } = context;
  const groups = [...(page.groups ?? [])];
  const sourceElements = [
    ...(page.hideMaster ? [] : context.masterElements),
    ...page.elements,
  ];
  const hasVisibleAnimatedSource = sourceElements.some((element) =>
    element.type === "image" &&
    !isEffectivelyHidden(element, groups) &&
    (element.isAnimatedGif || (element.frames?.length ?? 0) > 1)
  );
  const hasLocallyHiddenSource = sourceElements.some((element) =>
    context.localHiddenElementIds.has(element.id)
  );
  const documentMutationBlockedReason = context.collaborationLockedReason
    ?? (context.sharedDocument
      ? "공동 작업 문서의 페이지 합성 필터는 모든 참여자에게 동일한 픽셀 결과를 전달할 수 있도록 준비 중이에요. 지금은 선택 이미지 필터를 사용해 주세요."
      : hasLocallyHiddenSource
        ? "‘나만 숨기기’ 레이어를 먼저 다시 표시해 주세요. 개인 표시 상태는 공유·저장되는 필터 합성본에 포함하지 않습니다."
        : context.masterEditMode
          ? "마스터 편집을 끝낸 뒤 현재 페이지 합성 필터를 사용할 수 있어요."
          : context.reviewLocked
            ? "검토 잠금을 해제한 뒤 현재 페이지에 필터를 적용해 주세요."
            : context.timelinePlaying
              ? "타임라인 재생을 멈춘 뒤 현재 프레임을 기준으로 필터를 적용해 주세요."
              : hasVisibleAnimatedSource
                ? "애니메이션 레이어는 현재 프레임의 정적 복사본을 만든 뒤 페이지 필터에 포함할 수 있어요."
                : context.viewTransformSuppressed
                  ? "저장·내보내기·타임랩스 캡처가 끝난 뒤 현재 페이지에 필터를 적용해 주세요."
                  : null);
  const budgets = {
    ...context.budgets,
    maxPixelCount: Math.min(
      context.budgets?.maxPixelCount ?? PAGE_COMPOSITE_FILTER_MAX_PIXELS,
      PAGE_COMPOSITE_FILTER_MAX_PIXELS,
    ),
    maxPngBytes: Math.min(
      context.budgets?.maxPngBytes ?? PAGE_COMPOSITE_FILTER_MAX_PNG_BYTES,
      PAGE_COMPOSITE_FILTER_MAX_PNG_BYTES,
    ),
  };

  return {
    input: {
      pageId: page.id,
      width: context.canvasWidth,
      height: page.canvasH,
      elements: sourceElements,
      groups,
      theme: context.theme,
      includeBackground: true,
      bg: page.bg,
      bgGrad: page.bgGrad,
      name: context.name,
      insertionIndex: page.elements.length,
      documentMutationBlockedReason,
      budgets,
    },
    destinationElements: page.elements,
  };
}

/**
 * One source census for menus/rails/inspectors. It is intended for command-open or panel-open
 * paths, not pointermove: SVG serialization is used to detect approximated fidelity honestly.
 */
export function summarizeStudioRasterPreparationSources(
  input: StudioRasterPreparationSourceSummaryInput,
): StudioRasterPreparationSourceSummary {
  const groups = [...(input.groups ?? [])];
  const visible = input.elements.filter((element) => !isEffectivelyHidden(element, groups));
  const hiddenContentCount = input.elements.length - visible.length;
  const visibleRaster = visible.filter((element): element is ImageEl & El => element.type === "image");
  const visibleVectorDrawCount = visible.filter(
    (element) => element.type === "draw" && element.mode !== "eraser",
  ).length;
  if (!validDimensions(input.width, input.height)) {
    return {
      visibleContentCount: visible.length,
      hiddenContentCount,
      visibleRasterCount: visibleRaster.length,
      visibleUnlockedRasterCount: visibleRaster.filter(
        (element) => !isEffectivelyLocked(element, groups),
      ).length,
      visibleVectorDrawCount,
      exactRenderableVisibleCount: 0,
      unsupportedVisibleCount: visible.length,
      unsupportedReasons: ["페이지 크기가 안전한 래스터 처리 범위를 벗어났습니다."],
      hasPageBackground: input.hasPageBackground ?? true,
    };
  }
  const exported = exportPageToSvg({
    width: input.width,
    height: input.height,
    elements: visible,
    groups,
    theme: input.theme,
    transparentBg: true,
    bg: input.bg,
    bgGrad: input.bgGrad,
  });
  const unsupportedIds = new Set(exported.skipped.map((skip) => skip.id));
  return {
    visibleContentCount: visible.length,
    hiddenContentCount,
    visibleRasterCount: visibleRaster.length,
    visibleUnlockedRasterCount: visibleRaster.filter(
      (element) => !isEffectivelyLocked(element, groups),
    ).length,
    visibleVectorDrawCount,
    exactRenderableVisibleCount: Math.max(0, exported.elementCount - unsupportedIds.size),
    unsupportedVisibleCount: unsupportedIds.size,
    unsupportedReasons: [...new Set(exported.skipped.map((skip) => skip.label))],
    hasPageBackground: input.hasPageBackground ?? true,
  };
}

function fidelityReason(labels: readonly string[]): string {
  const unique = [...new Set(labels)].slice(0, 3);
  const detail = unique.length > 0 ? ` (${unique.join(" · ")})` : "";
  return `일부 표시 요소를 화면과 똑같이 합성할 수 없어 편집용 복사본을 만들지 않았습니다${detail}. 지원되지 않는 합성이나 지우개 획을 먼저 정리해 주세요.`;
}

/**
 * Fast deterministic preflight. This serializes but does not allocate a Canvas or decode images.
 * Any skipped *or approximated* element fails closed so a merged copy never silently changes art.
 */
export function planStudioEditableRasterCopy(
  input: StudioEditableRasterCopyInput,
): StudioEditableRasterCopyPlanResult {
  const pageId = input.pageId.trim();
  if (!pageId) {
    return { ok: false, code: "invalid-page-id", reason: "편집용 복사본을 연결할 페이지를 찾지 못했습니다." };
  }
  if (input.documentMutationBlockedReason) {
    return {
      ok: false,
      code: "document-locked",
      reason: input.documentMutationBlockedReason,
    };
  }
  const maxPixelCount = boundedByteBudget(
    input.budgets?.maxPixelCount,
    EDITABLE_RASTER_COPY_MAX_PIXELS,
  );
  if (!validDimensions(
    input.width,
    input.height,
    maxPixelCount,
  )) {
    const requestedPixels = Number.isSafeInteger(input.width) && Number.isSafeInteger(input.height)
      ? input.width * input.height
      : null;
    return {
      ok: false,
      code: "invalid-dimensions",
      reason: requestedPixels && requestedPixels > 0
        ? `현재 페이지는 ${requestedPixels}픽셀로 필터 허용치 ${maxPixelCount}픽셀을 넘습니다. 페이지를 나누거나 해상도를 낮춰 주세요.`
        : "페이지 크기가 올바르지 않습니다. 양수 정수 해상도로 조정해 주세요.",
    };
  }

  const includeBackground = input.includeBackground ?? true;
  const sourceElements = selectCopySources(input);
  if (sourceElements.length === 0 && !includeBackground) {
    return {
      ok: false,
      code: "no-visible-source",
      reason: "편집용 복사본으로 만들 표시 레이어가 없습니다.",
    };
  }
  let serializedSource: string;
  let sourceFingerprint: string;
  try {
    serializedSource = JSON.stringify(sourceElements);
    sourceFingerprint = fingerprintEditableRasterCopySource({
      width: input.width,
      height: input.height,
      sourceElements,
      theme: input.theme,
      includeBackground,
      bg: input.bg,
      bgGrad: input.bgGrad,
    });
  } catch {
    return {
      ok: false,
      code: "source-budget-exceeded",
      reason: "표시 레이어 데이터를 안전하게 읽지 못해 편집용 복사본을 만들지 않았습니다.",
    };
  }
  if (utf8ByteLength(serializedSource) > boundedByteBudget(
    input.budgets?.maxSourceBytes,
    EDITABLE_RASTER_COPY_MAX_SOURCE_BYTES,
  )) {
    return {
      ok: false,
      code: "source-budget-exceeded",
      reason: "표시 레이어 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 일부 레이어를 먼저 병합해 주세요.",
    };
  }
  const groups = [...(input.groups ?? [])];
  const exported = exportPageToSvg({
    width: input.width,
    height: input.height,
    elements: sourceElements,
    groups,
    theme: input.theme,
    transparentBg: !includeBackground,
    bg: input.bg,
    bgGrad: input.bgGrad,
  });
  if (exported.skipped.length > 0) {
    return {
      ok: false,
      code: "unsupported-fidelity",
      reason: fidelityReason(exported.skipped.map((skip) => skip.label)),
    };
  }
  if (utf8ByteLength(exported.svg) > boundedByteBudget(
    input.budgets?.maxSvgBytes,
    EDITABLE_RASTER_COPY_MAX_SVG_BYTES,
  )) {
    return {
      ok: false,
      code: "svg-budget-exceeded",
      reason: "합성된 벡터 데이터가 안전 처리 한도를 넘었습니다. 페이지를 나누거나 일부 레이어를 먼저 병합해 주세요.",
    };
  }

  return {
    ok: true,
    plan: {
      pageId,
      width: input.width,
      height: input.height,
      sourceElements,
      sourceIds: sourceElements.map((element) => element.id),
      groups,
      theme: input.theme,
      includeBackground,
      bg: input.bg,
      bgGrad: input.bgGrad,
      name: normalizeCopyName(input.name),
      insertionIndex: normalizeInsertionIndex(input.insertionIndex, input.elements.length),
      sourceFingerprint,
      sourceElementCount: exported.elementCount,
      budgets: input.budgets,
    },
  };
}

export async function renderStudioEditableRasterCopy(
  plan: StudioEditableRasterCopyPlan,
  renderVectorReference: StudioEditableRasterCopyRenderer,
  options: StudioVectorReferenceRenderOptions = {},
): Promise<StudioVectorReferenceResult> {
  // The eager Studio owner injects its existing renderer. Keeping this lazy seam type-only avoids
  // extracting that renderer into an additional shared HTTP request solely for this workflow.
  const result = await renderVectorReference({
    width: plan.width,
    height: plan.height,
    elements: plan.sourceElements,
    groups: plan.groups,
    theme: plan.theme,
    transparentBg: !plan.includeBackground,
    bg: plan.bg,
    bgGrad: plan.bgGrad,
    fingerprintNamespace: EDITABLE_RASTER_COPY_NAMESPACE,
    budgets: plan.budgets,
  }, options);
  const pngByteLength = pngDataUrlByteLength(result.dataUrl);
  if (!new RegExp(`^${EDITABLE_RASTER_COPY_NAMESPACE}:[0-9a-f]{16}$`, "u").test(result.fingerprint)) {
    throw new Error("필터를 준비하는 동안 페이지 내용이 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.");
  }
  if (result.width !== plan.width || result.height !== plan.height) {
    throw new Error("필터 합성 결과의 해상도가 현재 페이지와 다릅니다. 페이지 크기를 확인한 뒤 다시 시도해 주세요.");
  }
  if (result.elementCount !== plan.sourceElementCount) {
    throw new Error("필터 합성 결과의 레이어 수가 현재 페이지와 다릅니다. 최신 화면에서 다시 시도해 주세요.");
  }
  if (pngByteLength === null) {
    throw new Error("필터 합성 결과가 올바른 PNG가 아닙니다. 레이어를 단순화한 뒤 다시 시도해 주세요.");
  }
  const maxPngBytes = boundedByteBudget(
    plan.budgets?.maxPngBytes,
    EDITABLE_RASTER_COPY_MAX_PNG_BYTES,
  );
  if (pngByteLength > maxPngBytes) {
    throw new Error(`필터 합성 PNG가 ${pngByteLength}바이트로 허용치 ${maxPngBytes}바이트를 넘습니다. 페이지를 나누거나 해상도와 레이어 복잡도를 낮춰 주세요.`);
  }
  return {
    ...result,
    // Downstream materialization and commit compare document ownership, not the renderer's
    // pre/post-lazy SVG implementation fingerprint.
    fingerprint: plan.sourceFingerprint,
    pngByteLength,
  };
}

export function materializeStudioEditableRasterCopy(input: {
  readonly plan: StudioEditableRasterCopyPlan;
  readonly rendered: StudioVectorReferenceResult;
  readonly newId: string;
}): ImageEl & El {
  const id = input.newId.trim();
  if (!id) throw new Error("편집용 래스터 복사본 id가 필요합니다.");
  if (
    input.rendered.fingerprint !== input.plan.sourceFingerprint
    || input.rendered.width !== input.plan.width
    || input.rendered.height !== input.plan.height
    || !input.rendered.dataUrl.startsWith(PNG_DATA_URL_PREFIX)
  ) {
    throw new Error("편집용 래스터 복사본 결과가 현재 계획과 일치하지 않습니다.");
  }
  return {
    id,
    type: "image",
    name: input.plan.name,
    src: input.rendered.dataUrl,
    x: 0,
    y: 0,
    width: input.plan.width,
    height: input.plan.height,
    rotation: 0,
  };
}

/** Re-plan current inputs after an await and reject a stale source before committing one new layer. */
export function isStudioEditableRasterCopyPlanCurrent(
  plan: StudioEditableRasterCopyPlan,
  current: StudioEditableRasterCopyInput,
): boolean {
  const next = planStudioEditableRasterCopy(current);
  return next.ok
    && next.plan.pageId === plan.pageId
    && next.plan.sourceFingerprint === plan.sourceFingerprint
    && next.plan.insertionIndex === plan.insertionIndex;
}

/**
 * Commit boundary for a non-destructive raster copy.
 *
 * Planning, rendering and materializing are deliberately mutation-free, so dismissing a preview
 * requires no rollback. Applying revalidates the complete source fingerprint and document lock
 * after the asynchronous raster boundary, then inserts exactly one composite without removing or
 * patching any authored element.
 */
export function applyStudioEditableRasterCopy(input: {
  readonly plan: StudioEditableRasterCopyPlan;
  readonly current: StudioEditableRasterCopyInput;
  readonly composite: ImageEl & El;
  /**
   * Optional authored destination when the raster source also contains read-only underlays such
   * as a document master. The plan fingerprint still covers `current.elements`, while only this
   * destination receives the new composite.
   */
  readonly destinationElements?: readonly El[];
}): StudioEditableRasterCopyApplyResult {
  if (!isStudioEditableRasterCopyPlanCurrent(input.plan, input.current)) {
    return {
      ok: false,
      code: "stale-plan",
      reason: "필터 미리보기 중 페이지 내용이나 잠금 상태가 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
    };
  }

  const { composite, plan } = input;
  const destinationElements = input.destinationElements ?? input.current.elements;
  const pngByteLength = pngDataUrlByteLength(composite.src);
  const maxPngBytes = boundedByteBudget(
    plan.budgets?.maxPngBytes,
    EDITABLE_RASTER_COPY_MAX_PNG_BYTES,
  );
  if (pngByteLength === null) {
    return {
      ok: false,
      code: "invalid-composite",
      reason: "필터 합성 결과가 올바른 PNG가 아니어서 원본을 변경하지 않았습니다.",
    };
  }
  if (pngByteLength > maxPngBytes) {
    return {
      ok: false,
      code: "invalid-composite",
      reason: `필터 합성 PNG가 허용치 ${maxPngBytes}바이트를 넘어 적용하지 않았습니다. 페이지를 나누거나 해상도를 낮춰 주세요.`,
    };
  }
  if (
    !composite.id.trim()
    || destinationElements.some((element) => element.id === composite.id)
    || composite.x !== 0
    || composite.y !== 0
    || composite.width !== plan.width
    || composite.height !== plan.height
    || composite.rotation !== 0
    || plan.insertionIndex > destinationElements.length
  ) {
    return {
      ok: false,
      code: "invalid-composite",
      reason: "필터 합성 레이어가 현재 페이지와 일치하지 않아 원본을 변경하지 않았습니다.",
    };
  }

  const elements = [...destinationElements];
  elements.splice(plan.insertionIndex, 0, composite);
  return { ok: true, elements };
}
