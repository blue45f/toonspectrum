/**
 * Publish Spec Validator — 발행 규격(Canvas/Tapas/자체) 정의 · 검증 · 체크리스트 행.
 *
 * 플랫폼 규격 수치의 단일 기준점은 `assistant/webtoon-platform-spec-validator`가
 * 담당한다(출처·신뢰도 포함). 이 모듈은 내보내기 다이얼로그가 그대로 쓸 수 있는
 * publish 전용 API를 제공한다:
 *
 * - 프리셋 3종(Canvas/Tapas/자체) — Canvas/Tapas 수치는 위 기준표의 공식 값을
 *   그대로 가져오고, 자체(ToonStudio) 규격은 플랫폼 강제 압축·분할을 피하기 위한
 *   권장값으로 CANVAS 공식 규격과 동일한 수치를 둔다.
 * - 회차 이미지 장/회차 단위 검증(순수) — 규격 위반 시 플랫폼이 강제 압축·슬라이싱을
 *   걸어 화질이 망가지므로, 위반은 전부 error로 보고한다.
 * - 썸네일 3종 검증(순수)
 * - 다이얼로그 체크리스트 행 생성(순수)
 *
 * 사용자 노출 문자열은 한글.
 */

import {
  WEBTOON_CANVAS_THUMBNAIL_SPECS,
  WEBTOON_PLATFORM_SPECS,
  type ThumbnailSpec,
  type WebtoonImageFormat,
} from "../assistant/webtoon-platform-spec-validator";
import type { ExportFormat } from "../export/studio-export";

/** 발행 규격 프리셋 — 내보내기 다이얼로그의 "게시 목적지" 선택과 1:1로 대응한다. */
export type PublishSpecPresetId = "canvas" | "tapas" | "toonstudio";

export const PUBLISH_SPEC_PRESET_IDS: readonly PublishSpecPresetId[] = [
  "canvas",
  "tapas",
  "toonstudio",
];

export type PublishSpecThumbnailKind = "series-square" | "series-portrait" | "episode";

export interface PublishSpecThumbnail {
  kind: PublishSpecThumbnailKind;
  label: string;
  width: number;
  height: number;
  /** 용량 상한(byte) — exclusive upper bound. 공식 문언이 "미만(under)"이므로
   *  경계값과 같은 크기(예: 정확히 500KB)도 초과로 본다. */
  maxBytes: number;
}

export interface PublishSpecPreset {
  id: PublishSpecPresetId;
  label: string;
  /** 회차 이미지 장당 가로 상한(px). */
  episodeMaxWidth: number;
  /**
   * 슬라이스 기준 세로(px) — 이 높이를 넘는 스트립은 잘라낸다.
   * 플랫폼에 세로 상한이 없으면 undefined(슬라이싱 불필요).
   */
  episodeSliceHeight?: number;
  /** 장당 최대 용량(byte). */
  episodeMaxFileBytes: number;
  /** 회차 전체 합계 최대 용량(byte). */
  episodeMaxTotalBytes: number;
  /** 회차 최대 장수 — 플랫폼에 장수 상한이 없으면 undefined. */
  episodeMaxSlices?: number;
  allowedFormats: readonly ExportFormat[];
  recommendedFormat: ExportFormat;
  thumbnails: readonly PublishSpecThumbnail[];
  note: string;
}

const MB = 1024 * 1024;

function toPublishThumbnailKind(slot: ThumbnailSpec["slot"]): PublishSpecThumbnailKind {
  if (slot === "series-vertical") return "series-portrait";
  if (slot === "series-square") return "series-square";
  return "episode";
}

function toPublishThumbnail(spec: ThumbnailSpec): PublishSpecThumbnail {
  return {
    kind: toPublishThumbnailKind(spec.slot),
    label: spec.label,
    width: spec.widthPx,
    height: spec.heightPx,
    maxBytes: spec.maxBytesExclusive,
  };
}

function webtoonFormatToExportFormat(format: WebtoonImageFormat): ExportFormat | null {
  if (format === "jpg" || format === "png" || format === "webp") return format;
  // GIF는 정지 이미지 내보내기 파이프라인에서 다루지 않는다.
  return null;
}

const canvasPlatform = WEBTOON_PLATFORM_SPECS["webtoon-canvas"];
const tapasPlatform = WEBTOON_PLATFORM_SPECS["tapas"];

/**
 * 발행 규격 프리셋 3종.
 *
 * - canvas: WEBTOON CANVAS 공식 규격(가로 800px · 슬라이스 1280px · 장당 2MB ·
 *   회차 20MB · 최대 100장 · 썸네일 3종).
 * - tapas: Tapas 공식 File Size Guide(가로 940px · 세로 상한 없음 · 장당 2MB ·
 *   회차 20MB). 세로 상한이 없어 슬라이싱은 생략한다.
 * - toonstudio: ToonStudio 자체 업로드 권장 규격 — CANVAS 공식 규격과 동일한 값.
 */
export const PUBLISH_SPEC_PRESETS: Record<PublishSpecPresetId, PublishSpecPreset> = {
  canvas: {
    id: "canvas",
    label: "WEBTOON CANVAS",
    episodeMaxWidth: canvasPlatform.recommendedWidthPx,
    episodeSliceHeight: canvasPlatform.maxSliceHeightPx,
    episodeMaxFileBytes: canvasPlatform.maxFileSizeBytes,
    episodeMaxTotalBytes: canvasPlatform.episodeBudget?.maxEpisodeBytes ?? 20 * MB,
    episodeMaxSlices: canvasPlatform.episodeBudget?.maxImageCount,
    allowedFormats: canvasPlatform.allowedFormats
      .map(webtoonFormatToExportFormat)
      .filter((format): format is ExportFormat => format !== null),
    recommendedFormat: "jpg",
    thumbnails: WEBTOON_CANVAS_THUMBNAIL_SPECS.map(toPublishThumbnail),
    note: "가로 800px · 세로 1280px 단위 슬라이스 · 장당 2MB · 회차 합계 20MB · 최대 100장.",
  },
  tapas: {
    id: "tapas",
    label: "Tapas",
    episodeMaxWidth: tapasPlatform.recommendedWidthPx,
    // 공식 가이드에 세로 상한이 없다 — 슬라이싱 없이 한 장으로 둔다.
    episodeSliceHeight: undefined,
    episodeMaxFileBytes: tapasPlatform.maxFileSizeBytes,
    episodeMaxTotalBytes: tapasPlatform.episodeBudget?.maxEpisodeBytes ?? 20 * MB,
    episodeMaxSlices: tapasPlatform.episodeBudget?.maxImageCount,
    allowedFormats: tapasPlatform.allowedFormats
      .map(webtoonFormatToExportFormat)
      .filter((format): format is ExportFormat => format !== null),
    recommendedFormat: "jpg",
    thumbnails: tapasPlatform.thumbnails.map(toPublishThumbnail),
    note: "가로 940px · 세로 상한 없음 · 장당 2MB · 회차 합계 20MB.",
  },
  toonstudio: {
    id: "toonstudio",
    label: "ToonStudio 자체",
    episodeMaxWidth: canvasPlatform.recommendedWidthPx,
    episodeSliceHeight: canvasPlatform.maxSliceHeightPx,
    episodeMaxFileBytes: canvasPlatform.maxFileSizeBytes,
    episodeMaxTotalBytes: canvasPlatform.episodeBudget?.maxEpisodeBytes ?? 20 * MB,
    episodeMaxSlices: canvasPlatform.episodeBudget?.maxImageCount,
    allowedFormats: ["jpg", "png", "webp"],
    recommendedFormat: "jpg",
    thumbnails: WEBTOON_CANVAS_THUMBNAIL_SPECS.map(toPublishThumbnail),
    note: "ToonStudio 자체 업로드 권장 규격 — 플랫폼 강제 압축·분할을 피하기 위한 값으로 CANVAS 공식 규격과 동일.",
  },
};

/** id로 프리셋 조회. */
export function findPublishSpecPreset(id: PublishSpecPresetId): PublishSpecPreset {
  return PUBLISH_SPEC_PRESETS[id];
}

/**
 * 기존 내보내기 프리셋 id → publish 규격 id.
 * "webtoon-canvas"만 매핑되고 나머지는 null — 다이얼로그는 기본값 canvas를 쓴다.
 */
export function mapExportPresetToPublishSpecId(
  exportPresetId: string | null
): PublishSpecPresetId | null {
  return exportPresetId === "webtoon-canvas" ? "canvas" : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 검증
// ─────────────────────────────────────────────────────────────────────────────

export type PublishSpecIssueSeverity = "error" | "warning";
export type PublishSpecIssueCode =
  | "width"
  | "slice-height"
  | "file-size"
  | "episode-size"
  | "slice-count"
  | "format"
  | "thumbnail-size"
  | "thumbnail-missing";

export interface PublishSpecIssue {
  severity: PublishSpecIssueSeverity;
  code: PublishSpecIssueCode;
  /** 위반한 슬라이스 인덱스(0-based). 회차·썸네일 단위 이슈는 undefined. */
  sliceIndex?: number;
  message: string;
}

export interface PublishSpecSliceInput {
  width: number;
  height: number;
  /** 인코딩된 바이트 수. 없으면 용량 검사는 건너뛴다. */
  bytes?: number;
  format?: ExportFormat;
}

export interface PublishSpecValidation {
  ok: boolean;
  issues: PublishSpecIssue[];
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)}MB`;
}

/**
 * 회차 이미지(슬라이스 목록)를 규격에 대조한다. 규격을 어기면 플랫폼이 강제 압축·
 * 슬라이싱을 걸어 화질이 망가지므로, 위반은 전부 error로 보고한다.
 */
export function validatePublishSpecEpisode(
  slices: readonly PublishSpecSliceInput[],
  preset: PublishSpecPreset
): PublishSpecValidation {
  const issues: PublishSpecIssue[] = [];

  slices.forEach((slice, index) => {
    if (slice.width > preset.episodeMaxWidth) {
      issues.push({
        severity: "error",
        code: "width",
        sliceIndex: index,
        message: `${index + 1}장 가로 ${slice.width.toLocaleString()}px가 규격(${preset.episodeMaxWidth.toLocaleString()}px)을 넘어요. 플랫폼이 강제로 줄이면서 화질이 깨질 수 있어요.`,
      });
    }
    if (preset.episodeSliceHeight !== undefined && slice.height > preset.episodeSliceHeight) {
      issues.push({
        severity: "error",
        code: "slice-height",
        sliceIndex: index,
        message: `${index + 1}장 세로 ${slice.height.toLocaleString()}px가 슬라이스 기준(${preset.episodeSliceHeight.toLocaleString()}px)을 넘어요. 플랫폼이 임의로 잘라 컷이 잘릴 수 있어요.`,
      });
    }
    if (slice.bytes !== undefined && slice.bytes > preset.episodeMaxFileBytes) {
      issues.push({
        severity: "error",
        code: "file-size",
        sliceIndex: index,
        message: `${index + 1}장 용량 ${formatMegabytes(slice.bytes)}가 장당 한도(${formatMegabytes(preset.episodeMaxFileBytes)})를 넘어요. 플랫폼이 강제로 압축해 화질이 떨어질 수 있어요.`,
      });
    }
    if (slice.format !== undefined && !preset.allowedFormats.includes(slice.format)) {
      issues.push({
        severity: "error",
        code: "format",
        sliceIndex: index,
        message: `${index + 1}장 형식(${slice.format.toUpperCase()})은 ${preset.label}에서 지원하지 않아요. 권장: ${preset.recommendedFormat.toUpperCase()}.`,
      });
    }
  });

  const knownBytes = slices
    .map((slice) => slice.bytes)
    .filter((bytes): bytes is number => bytes !== undefined);
  if (knownBytes.length === slices.length && slices.length > 0) {
    const total = knownBytes.reduce((sum, bytes) => sum + bytes, 0);
    if (total > preset.episodeMaxTotalBytes) {
      issues.push({
        severity: "error",
        code: "episode-size",
        message: `회차 합계 용량 ${formatMegabytes(total)}가 한도(${formatMegabytes(preset.episodeMaxTotalBytes)})를 넘어요. 장별 한도를 지켜도 합계에서 반려될 수 있어요.`,
      });
    }
  }

  if (preset.episodeMaxSlices !== undefined && slices.length > preset.episodeMaxSlices) {
    issues.push({
      severity: "error",
      code: "slice-count",
      message: `회차 이미지 ${slices.length}장이 장수 한도(${preset.episodeMaxSlices}장)를 넘어요. 슬라이스 높이를 키우거나 회차를 나누세요.`,
    });
  }

  return { ok: issues.length === 0, issues };
}

export interface PublishThumbnailInput {
  kind: PublishSpecThumbnailKind;
  width: number;
  height: number;
  /** 인코딩된 바이트 수. 없으면 용량 검사는 건너뛴다. */
  bytes?: number;
}

/**
 * 썸네일 규격 검증. 슬롯이 비어 있으면 자동 생성 안내 warning을 낸다.
 * 용량 한도는 공식 문언("미만")대로 exclusive — 경계값과 같은 크기도 오류로 본다.
 * (기준표 모듈의 maxBytesExclusive·`>=` 판정과 동일한 시맨틱)
 */
export function validatePublishSpecThumbnails(
  thumbnails: readonly PublishThumbnailInput[],
  preset: PublishSpecPreset
): PublishSpecValidation {
  const issues: PublishSpecIssue[] = [];

  for (const spec of preset.thumbnails) {
    const input = thumbnails.find((thumbnail) => thumbnail.kind === spec.kind);
    if (!input) {
      issues.push({
        severity: "warning",
        code: "thumbnail-missing",
        message: `${spec.label}(${spec.width}×${spec.height})이 없어요. 자동 최적화에서 생성할 수 있어요.`,
      });
      continue;
    }
    if (input.width !== spec.width || input.height !== spec.height) {
      issues.push({
        severity: "error",
        code: "thumbnail-size",
        message: `${spec.label} 크기(${input.width}×${input.height})가 규격(${spec.width}×${spec.height})과 달라요.`,
      });
    }
    if (input.bytes !== undefined && input.bytes >= spec.maxBytes) {
      issues.push({
        severity: "error",
        code: "thumbnail-size",
        message: `${spec.label} 용량(${formatMegabytes(input.bytes)})이 한도(${formatMegabytes(spec.maxBytes)} 미만)를 넘어요.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

// ─────────────────────────────────────────────────────────────────────────────
// 다이얼로그 체크리스트 행
// ─────────────────────────────────────────────────────────────────────────────

export type PublishSpecCheckStatus = "pass" | "fail" | "warn" | "unknown";

export interface PublishSpecCheckRow {
  id: string;
  label: string;
  detail: string;
  status: PublishSpecCheckStatus;
  hint?: string;
}

export interface PublishSpecPlanInput {
  /** 내보내기 배율 적용 후 예상 가로(px) — 페이지 1장 기준. */
  plannedWidth: number;
  /** 내보내기 배율 적용 후 예상 세로(px) — 페이지 1장 기준. */
  plannedHeight: number;
  pageCount: number;
  format: ExportFormat;
  /** 장당 예상 용량(byte) — 인코딩 전이면 생략한다. */
  estimatedBytesPerSlice?: number;
}

/**
 * 내보내기 다이얼로그에 보여줄 규격 체크리스트 행.
 * 인코딩 전이라 용량을 모르는 항목은 unknown으로 두고 자동 최적화 버튼을 안내한다.
 */
export function buildPublishSpecChecklist(
  input: PublishSpecPlanInput,
  preset: PublishSpecPreset
): PublishSpecCheckRow[] {
  const rows: PublishSpecCheckRow[] = [];
  const plannedWidth = Math.max(1, Math.round(input.plannedWidth));
  const plannedHeight = Math.max(1, Math.round(input.plannedHeight));
  const pageCount = Math.max(1, Math.round(input.pageCount));

  const widthOk = plannedWidth <= preset.episodeMaxWidth;
  rows.push({
    id: "width",
    label: "회차 이미지 가로",
    detail: `규격 최대 ${preset.episodeMaxWidth.toLocaleString()}px · 예상 ${plannedWidth.toLocaleString()}px`,
    status: widthOk ? "pass" : "fail",
    hint: widthOk
      ? undefined
      : `자동 최적화에서 ${preset.episodeMaxWidth.toLocaleString()}px로 리사이즈해요.`,
  });

  const sliceHeight = preset.episodeSliceHeight;
  if (sliceHeight === undefined) {
    rows.push({
      id: "slice",
      label: "슬라이스 세로",
      detail: `${preset.label}에는 세로 상한이 없어요 · ${pageCount}페이지를 장당 1장으로 내보내요`,
      status: "pass",
    });
  } else {
    const estimatedSlices = pageCount * Math.max(1, Math.ceil(plannedHeight / sliceHeight));
    const countOk =
      preset.episodeMaxSlices === undefined || estimatedSlices <= preset.episodeMaxSlices;
    rows.push({
      id: "slice",
      label: "슬라이스 세로",
      detail:
        `장당 최대 ${sliceHeight.toLocaleString()}px · 예상 ${estimatedSlices}장` +
        (preset.episodeMaxSlices !== undefined ? ` (한도 ${preset.episodeMaxSlices}장)` : ""),
      status: countOk ? "pass" : "fail",
      hint: countOk ? undefined : "슬라이스 높이를 키우거나 회차를 나누세요.",
    });
  }

  const estimatedBytes = input.estimatedBytesPerSlice;
  rows.push({
    id: "file-size",
    label: "장당 용량",
    detail:
      estimatedBytes === undefined
        ? `한도 ${formatMegabytes(preset.episodeMaxFileBytes)} · 인코딩 후 확인`
        : `한도 ${formatMegabytes(preset.episodeMaxFileBytes)} · 예상 ${formatMegabytes(estimatedBytes)}`,
    status:
      estimatedBytes === undefined
        ? "unknown"
        : estimatedBytes > preset.episodeMaxFileBytes
          ? "fail"
          : "pass",
    hint:
      estimatedBytes === undefined
        ? "자동 최적화에서 품질을 낮춰 한도에 맞춰요."
        : undefined,
  });

  const estimatedTotal =
    estimatedBytes === undefined
      ? undefined
      : estimatedBytes *
        (sliceHeight === undefined
          ? pageCount
          : pageCount * Math.max(1, Math.ceil(plannedHeight / sliceHeight)));
  rows.push({
    id: "episode-size",
    label: "회차 합계 용량",
    detail:
      estimatedTotal === undefined
        ? `한도 ${formatMegabytes(preset.episodeMaxTotalBytes)} · 인코딩 후 확인`
        : `한도 ${formatMegabytes(preset.episodeMaxTotalBytes)} · 예상 ${formatMegabytes(estimatedTotal)}`,
    status:
      estimatedTotal === undefined
        ? "unknown"
        : estimatedTotal > preset.episodeMaxTotalBytes
          ? "fail"
          : "pass",
  });

  const formatOk = preset.allowedFormats.includes(input.format);
  rows.push({
    id: "format",
    label: "파일 형식",
    detail: `지원 ${preset.allowedFormats.map((format) => format.toUpperCase()).join(" · ")} · 현재 ${input.format.toUpperCase()}`,
    status: formatOk ? "pass" : "fail",
    hint: formatOk ? undefined : `자동 최적화에서 ${preset.recommendedFormat.toUpperCase()}로 변환해요.`,
  });

  rows.push({
    id: "thumbnails",
    label: `썸네일 ${preset.thumbnails.length}종`,
    detail: preset.thumbnails
      .map((thumbnail) => `${thumbnail.label} ${thumbnail.width}×${thumbnail.height}`)
      .join(" · "),
    status: "unknown",
    hint: `자동 최적화에서 ${preset.thumbnails.length}종을 자동 생성해요.`,
  });

  return rows;
}
