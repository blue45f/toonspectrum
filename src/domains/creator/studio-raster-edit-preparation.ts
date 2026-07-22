/**
 * Non-destructive "editable raster copy" preparation.
 *
 * The plan uses the exact Studio SVG serializer as a fidelity preflight, then the shared
 * Worker-capable SVG -> PNG seam performs the expensive browser rasterization. The original
 * document elements are never removed or patched by this module. Callers materialize one new
 * full-page ImageEl only after an explicit confirmation or an operation (such as filters) whose
 * contract says it creates a merged copy.
 */

import { STUDIO_ADVANCED_FILL_BROWSER_MAX_PIXELS } from "./studio-advanced-fill-raster-safety";
import { isEffectivelyHidden, isEffectivelyLocked } from "./studio-layers";
import {
  exportPageToSvg,
} from "./studio-svg-export";
import {
  fingerprintStudioVectorReference,
  renderStudioVectorReference,
  STUDIO_VECTOR_REFERENCE_MAX_SOURCE_BYTES,
  STUDIO_VECTOR_REFERENCE_MAX_SVG_BYTES,
  StudioVectorReferenceError,
  type StudioVectorReferenceBudgets,
  type StudioVectorReferenceRenderOptions,
  type StudioVectorReferenceResult,
} from "./studio-vector-fill-reference";

import type { El, ImageEl } from "./studio-element-model";
import type { LayerGroup } from "./studio-layers";
import type { SvgExportTheme } from "./studio-svg-export";

const EDITABLE_RASTER_COPY_NAMESPACE = "editable-raster-copy-v1";
const PNG_DATA_URL_PREFIX = "data:image/png;base64,iVBORw0KGgo";
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

function validDimensions(width: number, height: number): boolean {
  return Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width * height <= STUDIO_ADVANCED_FILL_BROWSER_MAX_PIXELS;
}

function boundedByteBudget(value: number | undefined, hardMaximum: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.min(value!, hardMaximum)
    : hardMaximum;
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function selectCopySources(input: StudioEditableRasterCopyInput): readonly El[] {
  const groups = [...(input.groups ?? [])];
  const requested = input.sourceIds ? new Set(input.sourceIds) : null;
  return input.elements.filter((element) =>
    !isEffectivelyHidden(element, groups) && (!requested || requested.has(element.id))
  );
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
  if (!validDimensions(input.width, input.height)) {
    return {
      ok: false,
      code: "invalid-dimensions",
      reason: "페이지 크기가 브라우저의 안전한 래스터 처리 범위를 벗어났습니다. 페이지를 나누거나 해상도를 낮춰 주세요.",
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
  try {
    serializedSource = JSON.stringify(sourceElements);
  } catch {
    return {
      ok: false,
      code: "source-budget-exceeded",
      reason: "표시 레이어 데이터를 안전하게 읽지 못해 편집용 복사본을 만들지 않았습니다.",
    };
  }
  if (utf8ByteLength(serializedSource) > boundedByteBudget(
    input.budgets?.maxSourceBytes,
    STUDIO_VECTOR_REFERENCE_MAX_SOURCE_BYTES,
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
    STUDIO_VECTOR_REFERENCE_MAX_SVG_BYTES,
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
      sourceFingerprint: fingerprintStudioVectorReference(
        exported.svg,
        EDITABLE_RASTER_COPY_NAMESPACE,
      ),
      sourceElementCount: exported.elementCount,
      budgets: input.budgets,
    },
  };
}

export async function renderStudioEditableRasterCopy(
  plan: StudioEditableRasterCopyPlan,
  options: StudioVectorReferenceRenderOptions = {},
): Promise<StudioVectorReferenceResult> {
  const result = await renderStudioVectorReference({
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
  if (result.fingerprint !== plan.sourceFingerprint) {
    throw new StudioVectorReferenceError(
      "unsupported-vector-fidelity",
      "편집용 복사본을 만드는 동안 원본 레이어가 바뀌었습니다. 최신 화면에서 다시 시도해 주세요.",
    );
  }
  return result;
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
    throw new StudioVectorReferenceError(
      "invalid-png-output",
      "편집용 래스터 복사본 결과가 현재 계획과 일치하지 않습니다.",
    );
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
