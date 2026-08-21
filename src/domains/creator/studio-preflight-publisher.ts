/**
 * Studio Preflight Verification & Platform Publish Engine — 네이버웹툰·카카오웹툰·
 * 타파스·레진·소년점프+·단행본 인쇄 규격 자동 검증 및 출고 패키지 2.0 생성 코어.
 *
 * 마스터플랜 7.7 (출력·플랫폼 프리셋), 7.8 (Preflight), 7.9 (Publish Package 2.0) & 997개 기능 갭:
 * - 플랫폼별 규격 프로필 (슬라이스 너비/높이, 용량 한도, DPI, 컬러 스페이스, 포맷)
 * - 출고 전 Preflight 자동 검증 (치수, 용량, 텍스트 가독성, 색상 프로필, 누락 에셋, 연령 등급)
 * - Publish Package 2.0 매니페스트 (슬라이스 목록, 표지/썸네일, 메타데이터, 연령경고, 검증 리포트)
 * - 순수 함수, 불변성, 결정론, DOM/React 무관
 */

export const STUDIO_PREFLIGHT_PUBLISHER_VERSION = 1 as const;

export const PUBLISH_PLATFORMS = [
  "naver-webtoon",
  "kakao-webtoon",
  "tapas",
  "lezhin",
  "shonen-jump-plus",
  "tankobon-print-b6",
] as const;
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number];

export const CONTENT_AGE_RATINGS = [
  "all-ages",
  "age-12",
  "age-15",
  "age-19",
] as const;
export type ContentAgeRating = (typeof CONTENT_AGE_RATINGS)[number];

export const CONTENT_WARNING_TAGS = [
  "violence",
  "blood-gore",
  "strong-language",
  "substances-alcohol",
  "flashing-lights",
  "sensitive-themes",
] as const;
export type ContentWarningTag = (typeof CONTENT_WARNING_TAGS)[number];

export interface PlatformPublishSpec {
  readonly platform: PublishPlatform;
  readonly targetWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxSliceFileSizeKb: number;
  readonly maxTotalPayloadMb: number;
  readonly allowedFormats: readonly ("jpg" | "png" | "webp" | "pdf" | "tiff")[];
  readonly requiredColorSpace: "sRGB" | "Display-P3" | "CMYK";
  readonly minDpi: number;
  readonly minTextFontSizePx: number;
}

export const PLATFORM_PUBLISH_SPECS: Record<PublishPlatform, PlatformPublishSpec> = {
  "naver-webtoon": {
    platform: "naver-webtoon",
    targetWidthPx: 690,
    maxSliceHeightPx: 20_000,
    maxSliceFileSizeKb: 2_048, // 2MB per slice
    maxTotalPayloadMb: 20,
    allowedFormats: ["jpg", "png", "webp"],
    requiredColorSpace: "sRGB",
    minDpi: 72,
    minTextFontSizePx: 12,
  },
  "kakao-webtoon": {
    platform: "kakao-webtoon",
    targetWidthPx: 720,
    maxSliceHeightPx: 15_000,
    maxSliceFileSizeKb: 1_500,
    maxTotalPayloadMb: 15,
    allowedFormats: ["jpg", "webp"],
    requiredColorSpace: "sRGB",
    minDpi: 72,
    minTextFontSizePx: 12,
  },
  tapas: {
    platform: "tapas",
    targetWidthPx: 940,
    maxSliceHeightPx: 4_000,
    maxSliceFileSizeKb: 2_048,
    maxTotalPayloadMb: 30,
    allowedFormats: ["jpg", "png"],
    requiredColorSpace: "sRGB",
    minDpi: 72,
    minTextFontSizePx: 14,
  },
  lezhin: {
    platform: "lezhin",
    targetWidthPx: 720,
    maxSliceHeightPx: 10_000,
    maxSliceFileSizeKb: 2_048,
    maxTotalPayloadMb: 25,
    allowedFormats: ["jpg", "png", "webp"],
    requiredColorSpace: "sRGB",
    minDpi: 72,
    minTextFontSizePx: 12,
  },
  "shonen-jump-plus": {
    platform: "shonen-jump-plus",
    targetWidthPx: 800,
    maxSliceHeightPx: 1_200, // Page format
    maxSliceFileSizeKb: 1_024,
    maxTotalPayloadMb: 50,
    allowedFormats: ["jpg", "png"],
    requiredColorSpace: "sRGB",
    minDpi: 150,
    minTextFontSizePx: 10,
  },
  "tankobon-print-b6": {
    platform: "tankobon-print-b6",
    targetWidthPx: 2_150, // 300 DPI B6
    maxSliceHeightPx: 3_035,
    maxSliceFileSizeKb: 50_000,
    maxTotalPayloadMb: 2_000,
    allowedFormats: ["tiff", "pdf", "png"],
    requiredColorSpace: "CMYK",
    minDpi: 300,
    minTextFontSizePx: 8,
  },
};

export interface ManuscriptSliceInput {
  readonly sliceIndex: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly sizeKb: number;
  readonly format: "jpg" | "png" | "webp" | "pdf" | "tiff";
  readonly colorSpace: "sRGB" | "Display-P3" | "CMYK";
  readonly dpi: number;
  readonly minFontSizeInSlice?: number;
  readonly missingAssetRefs?: readonly string[];
}

export interface PreflightDiagnostic {
  readonly code:
    | "INVALID_WIDTH"
    | "SLICE_HEIGHT_EXCEEDED"
    | "SLICE_SIZE_EXCEEDED"
    | "TOTAL_PAYLOAD_EXCEEDED"
    | "UNSUPPORTED_FORMAT"
    | "COLOR_SPACE_MISMATCH"
    | "LOW_DPI"
    | "TEXT_TOO_SMALL"
    | "MISSING_ASSETS"
    | "AGE_RATING_MISSING";
  readonly sliceIndex?: number;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface PreflightReport {
  readonly platform: PublishPlatform;
  readonly passed: boolean;
  readonly totalSlices: number;
  readonly totalPayloadMb: number;
  readonly errorsCount: number;
  readonly warningsCount: number;
  readonly diagnostics: readonly PreflightDiagnostic[];
}

export interface PublishPackageManifest {
  readonly version: typeof STUDIO_PREFLIGHT_PUBLISHER_VERSION;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly targetPlatform: PublishPlatform;
  readonly ageRating: ContentAgeRating;
  readonly contentWarnings?: readonly ContentWarningTag[];
  readonly coverImageRef?: string;
  readonly thumbnailRef?: string;
  readonly slices: readonly ManuscriptSliceInput[];
  readonly preflight: PreflightReport;
  readonly exportedAtMs: number;
}

/**
 * 원고 슬라이스 목록을 타겟 플랫폼 규격에 맞추어 Preflight 검증을 수행한다.
 */
export function executePreflightCheck(
  slices: readonly ManuscriptSliceInput[],
  platform: PublishPlatform,
  options: { ageRating?: ContentAgeRating } = {},
): PreflightReport {
  const spec = PLATFORM_PUBLISH_SPECS[platform];
  const diagnostics: PreflightDiagnostic[] = [];

  let totalSizeKb = 0;

  if (!options.ageRating) {
    diagnostics.push({
      code: "AGE_RATING_MISSING",
      message: "연령 등급(Age Rating)이 지정되지 않았습니다.",
      severity: "warning",
    });
  }

  for (const s of slices) {
    totalSizeKb += s.sizeKb;

    // 1. Width check
    if (s.widthPx !== spec.targetWidthPx) {
      diagnostics.push({
        code: "INVALID_WIDTH",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 너비(${s.widthPx}px)가 플랫폼 규격(${spec.targetWidthPx}px)과 일치하지 않습니다.`,
        severity: "error",
      });
    }

    // 2. Height check
    if (s.heightPx > spec.maxSliceHeightPx) {
      diagnostics.push({
        code: "SLICE_HEIGHT_EXCEEDED",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 높이(${s.heightPx}px)가 최대 한도(${spec.maxSliceHeightPx}px)를 초과합니다.`,
        severity: "error",
      });
    }

    // 3. Slice file size check
    if (s.sizeKb > spec.maxSliceFileSizeKb) {
      diagnostics.push({
        code: "SLICE_SIZE_EXCEEDED",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 파일 크기(${s.sizeKb}KB)가 최대 한도(${spec.maxSliceFileSizeKb}KB)를 초과합니다.`,
        severity: "error",
      });
    }

    // 4. Format check
    if (!spec.allowedFormats.includes(s.format)) {
      diagnostics.push({
        code: "UNSUPPORTED_FORMAT",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 포맷(${s.format})은 ${spec.platform}에서 허용되지 않습니다 (${spec.allowedFormats.join(", ")}).`,
        severity: "error",
      });
    }

    // 5. Color space check
    if (s.colorSpace !== spec.requiredColorSpace) {
      diagnostics.push({
        code: "COLOR_SPACE_MISMATCH",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 색공간(${s.colorSpace})이 요구 규격(${spec.requiredColorSpace})과 다릅니다.`,
        severity: "warning",
      });
    }

    // 6. DPI check
    if (s.dpi < spec.minDpi) {
      diagnostics.push({
        code: "LOW_DPI",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}의 해상도(${s.dpi} DPI)가 최소 권장(${spec.minDpi} DPI)보다 낮습니다.`,
        severity: "warning",
      });
    }

    // 7. Font size legibility check
    if (s.minFontSizeInSlice !== undefined && s.minFontSizeInSlice < spec.minTextFontSizePx) {
      diagnostics.push({
        code: "TEXT_TOO_SMALL",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}에 모바일 가독성 기준(${spec.minTextFontSizePx}px)보다 작은 텍스트(${s.minFontSizeInSlice}px)가 포함되어 있습니다.`,
        severity: "warning",
      });
    }

    // 8. Missing assets
    if (s.missingAssetRefs && s.missingAssetRefs.length > 0) {
      diagnostics.push({
        code: "MISSING_ASSETS",
        sliceIndex: s.sliceIndex,
        message: `슬라이스 #${s.sliceIndex}에 누락된 연결 에셋(${s.missingAssetRefs.join(", ")})이 있습니다.`,
        severity: "error",
      });
    }
  }

  // Total payload check
  const totalMb = totalSizeKb / 1024;
  if (totalMb > spec.maxTotalPayloadMb) {
    diagnostics.push({
      code: "TOTAL_PAYLOAD_EXCEEDED",
      message: `전체 에피소드 용량(${totalMb.toFixed(1)}MB)이 플랫폼 최대 한도(${spec.maxTotalPayloadMb}MB)를 초과합니다.`,
      severity: "error",
    });
  }

  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  return Object.freeze({
    platform,
    passed: errors.length === 0,
    totalSlices: slices.length,
    totalPayloadMb: Number(totalMb.toFixed(2)),
    errorsCount: errors.length,
    warningsCount: warnings.length,
    diagnostics: Object.freeze(diagnostics),
  });
}

/**
 * 검증 통과 여부와 함께 출고 패키지 2.0 매니페스트를 빌드한다.
 */
export function buildPublishPackageManifest(params: {
  episodeId: string;
  episodeTitle: string;
  targetPlatform: PublishPlatform;
  ageRating: ContentAgeRating;
  contentWarnings?: readonly ContentWarningTag[];
  coverImageRef?: string;
  thumbnailRef?: string;
  slices: readonly ManuscriptSliceInput[];
  nowMs: number;
}): PublishPackageManifest {
  const preflight = executePreflightCheck(params.slices, params.targetPlatform, {
    ageRating: params.ageRating,
  });

  return Object.freeze({
    version: STUDIO_PREFLIGHT_PUBLISHER_VERSION,
    episodeId: params.episodeId.trim(),
    episodeTitle: params.episodeTitle.trim(),
    targetPlatform: params.targetPlatform,
    ageRating: params.ageRating,
    contentWarnings: params.contentWarnings ? Object.freeze([...params.contentWarnings]) : undefined,
    coverImageRef: params.coverImageRef?.trim(),
    thumbnailRef: params.thumbnailRef?.trim(),
    slices: Object.freeze([...params.slices]),
    preflight,
    exportedAtMs: params.nowMs,
  });
}
