/**
 * Webtoon platform upload preflight and protected-element-aware vertical slicing.
 *
 * Platform rules change independently of the editor. Each profile therefore carries evidence
 * authority and verification metadata instead of presenting every working recommendation as an
 * official hard limit. The slicer is deterministic and never uses network access.
 */

export type WebtoonPlatformId =
  | "naver-webtoon"
  | "kakao-page"
  | "webtoon-canvas"
  | "lezhin-comics"
  | "toptoon"
  | "postype";

export type WebtoonUploadFormat = "jpg" | "png" | "webp" | "gif";
export type PlatformSpecAuthority = "official" | "official-partial" | "advisory";
export type PlatformHeightPolicy = "hard-limit" | "recommended-profile";
export type PlatformSpecEvidenceField =
  | "width"
  | "height"
  | "size"
  | "total-size"
  | "format"
  | "automatic-slicing";

export interface WebtoonPlatformSpec {
  readonly id: WebtoonPlatformId;
  readonly name: string;
  readonly recommendedWidthPx: number;
  readonly allowedWidthsPx: readonly number[];
  readonly maxSliceHeightPx: number;
  readonly heightPolicy: PlatformHeightPolicy;
  readonly recommendedSliceHeightPx: number;
  readonly maxFileSizeBytes: number;
  readonly maxTotalUploadBytes?: number;
  readonly allowedFormats: readonly WebtoonUploadFormat[];
  readonly minGutterPx: number;
  readonly maxGutterPx: number;
  readonly supportsAutomaticLongImageSlicing: boolean;
  readonly specAuthority: PlatformSpecAuthority;
  readonly specSourceUrl?: string;
  readonly verifiedAt?: string;
  readonly verifiedFields: readonly PlatformSpecEvidenceField[];
  readonly description: string;
}

export interface CanvasAuditInput {
  readonly width: number;
  readonly height: number;
  readonly dpi?: number;
  readonly estimatedSizeBytes?: number;
  readonly estimatedTotalSizeBytes?: number;
  readonly format?: WebtoonUploadFormat;
  readonly panelGuttersPx?: readonly number[];
}

export type ComplianceGrade = "pass" | "warn" | "fail";

export interface SpecAuditIssue {
  readonly grade: ComplianceGrade;
  readonly field: "width" | "height" | "size" | "total-size" | "format" | "gutter";
  readonly message: string;
  readonly recommendation: string;
}

export interface SpecAuditResult {
  readonly platform: WebtoonPlatformSpec;
  readonly overallGrade: ComplianceGrade;
  readonly isCompliant: boolean;
  readonly issues: readonly SpecAuditIssue[];
  readonly recommendedSliceCount: number;
  readonly summary: string;
}

export interface ElementBoundingBox {
  readonly top: number;
  readonly bottom: number;
  readonly label?: string;
}

export interface SafeSliceRange {
  readonly sliceIndex: number;
  readonly topY: number;
  readonly bottomY: number;
  readonly heightPx: number;
  readonly isGutterCut: boolean;
}

export interface AutoSlicePlan {
  readonly totalHeightPx: number;
  readonly targetSliceHeightPx: number;
  readonly slices: readonly SafeSliceRange[];
  readonly sliceCount: number;
  readonly cutCount: number;
  readonly safeCutCount: number;
  readonly unsafeCutCount: number;
  readonly safeSplitSuccessRate: number;
}

const MIB = 1024 * 1024;
const SAFE_CUT_MARGIN_PX = 20;
const MIN_SLICE_HEIGHT_PX = 200;
const MAX_TARGET_OVERRUN_RATIO = 1.2;

export const WEBTOON_PLATFORM_SPECS: Readonly<Record<WebtoonPlatformId, WebtoonPlatformSpec>> =
  Object.freeze({
    "naver-webtoon": Object.freeze({
      id: "naver-webtoon",
      name: "네이버웹툰 도전만화",
      recommendedWidthPx: 690,
      allowedWidthsPx: Object.freeze([690]),
      maxSliceHeightPx: 20_000,
      heightPolicy: "recommended-profile",
      recommendedSliceHeightPx: 10_000,
      maxFileSizeBytes: 5 * MIB,
      maxTotalUploadBytes: 50 * MIB,
      allowedFormats: Object.freeze(["jpg", "gif"] as const),
      minGutterPx: 100,
      maxGutterPx: 1_000,
      supportsAutomaticLongImageSlicing: false,
      specAuthority: "official",
      specSourceUrl: "https://help.naver.com/service/5635/contents/18779",
      verifiedAt: "2026-09-03",
      verifiedFields: Object.freeze(["width", "size", "total-size", "format"] as const),
      description:
        "공식 업로드 규격은 가로 690px, 세로 제한 없음, 파일당 5MB·전체 50MB, JPG/GIF입니다. 10,000~20,000px은 편집기 내보내기 관리용 분할 프로필입니다.",
    }),
    "kakao-page": Object.freeze({
      id: "kakao-page",
      name: "카카오페이지 / 카카오웹툰",
      recommendedWidthPx: 720,
      allowedWidthsPx: Object.freeze([720, 1080]),
      maxSliceHeightPx: 15_000,
      heightPolicy: "recommended-profile",
      recommendedSliceHeightPx: 10_000,
      maxFileSizeBytes: 5 * MIB,
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      minGutterPx: 120,
      maxGutterPx: 900,
      supportsAutomaticLongImageSlicing: false,
      specAuthority: "advisory",
      verifiedFields: Object.freeze([] as const),
      description:
        "720px/1080px 제작 관행을 기준으로 한 편집 프로필입니다. 계약·연재 채널의 최신 납품서를 최종 기준으로 확인해야 합니다.",
    }),
    "webtoon-canvas": Object.freeze({
      id: "webtoon-canvas",
      name: "글로벌 WEBTOON CANVAS",
      recommendedWidthPx: 800,
      allowedWidthsPx: Object.freeze([800]),
      maxSliceHeightPx: 1_280,
      heightPolicy: "hard-limit",
      recommendedSliceHeightPx: 1_280,
      maxFileSizeBytes: 2 * MIB,
      allowedFormats: Object.freeze(["jpg"] as const),
      minGutterPx: 80,
      maxGutterPx: 600,
      supportsAutomaticLongImageSlicing: true,
      specAuthority: "official-partial",
      specSourceUrl: "https://www.webtoons.com/en/notice/detail?noticeNo=1766",
      verifiedAt: "2026-09-03",
      verifiedFields: Object.freeze(["width", "height", "automatic-slicing"] as const),
      description:
        "공식 공지는 긴 이미지를 최대 800×1280px에 맞춰 자동 최적화·분할한다고 안내합니다. 파일 크기·포맷은 게시 화면에서 다시 확인해야 합니다.",
    }),
    "lezhin-comics": Object.freeze({
      id: "lezhin-comics",
      name: "레진코믹스",
      recommendedWidthPx: 800,
      allowedWidthsPx: Object.freeze([800, 1440]),
      maxSliceHeightPx: 25_000,
      heightPolicy: "recommended-profile",
      recommendedSliceHeightPx: 12_000,
      maxFileSizeBytes: 10 * MIB,
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      minGutterPx: 120,
      maxGutterPx: 1_000,
      supportsAutomaticLongImageSlicing: false,
      specAuthority: "advisory",
      verifiedFields: Object.freeze([] as const),
      description:
        "800px/1440px 제작 관행을 기준으로 한 편집 프로필입니다. 최신 작품별 납품 규격을 우선해야 합니다.",
    }),
    toptoon: Object.freeze({
      id: "toptoon",
      name: "탑툰 (Toptoon)",
      recommendedWidthPx: 800,
      allowedWidthsPx: Object.freeze([800]),
      maxSliceHeightPx: 20_000,
      heightPolicy: "recommended-profile",
      recommendedSliceHeightPx: 10_000,
      maxFileSizeBytes: 8 * MIB,
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      minGutterPx: 100,
      maxGutterPx: 900,
      supportsAutomaticLongImageSlicing: false,
      specAuthority: "advisory",
      verifiedFields: Object.freeze([] as const),
      description:
        "800px 제작 관행을 기준으로 한 편집 프로필입니다. 최신 작품별 납품 규격을 우선해야 합니다.",
    }),
    postype: Object.freeze({
      id: "postype",
      name: "포스타입 / 독립연재",
      recommendedWidthPx: 1_600,
      allowedWidthsPx: Object.freeze([690, 720, 800, 1200, 1600]),
      maxSliceHeightPx: 30_000,
      heightPolicy: "recommended-profile",
      recommendedSliceHeightPx: 15_000,
      maxFileSizeBytes: 20 * MIB,
      allowedFormats: Object.freeze(["jpg", "png", "webp"] as const),
      minGutterPx: 150,
      maxGutterPx: 1_200,
      supportsAutomaticLongImageSlicing: false,
      specAuthority: "advisory",
      verifiedFields: Object.freeze([] as const),
      description:
        "독립 연재용 고화질·WebP 편집 프로필입니다. 실제 게시 화면의 최신 제한을 최종 기준으로 확인해야 합니다.",
    }),
  });

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ProtectedInterval {
  top: number;
  bottom: number;
}

function normalizeProtectedIntervals(
  totalHeight: number,
  protectedElements: readonly ElementBoundingBox[],
): readonly ProtectedInterval[] {
  const sorted = protectedElements
    .flatMap((element) => {
      if (!Number.isFinite(element.top) || !Number.isFinite(element.bottom)) return [];
      const top = clamp(Math.floor(Math.min(element.top, element.bottom)), 0, totalHeight);
      const bottom = clamp(Math.ceil(Math.max(element.top, element.bottom)), 0, totalHeight);
      return bottom > top ? [{ top, bottom }] : [];
    })
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);

  const merged: ProtectedInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.top > previous.bottom) {
      merged.push({ ...interval });
      continue;
    }
    previous.bottom = Math.max(previous.bottom, interval.bottom);
  }
  return Object.freeze(merged.map((interval) => Object.freeze(interval)));
}

function cutCrossesProtectedInterval(
  cutY: number,
  intervals: readonly ProtectedInterval[],
): boolean {
  return intervals.some((interval) => cutY > interval.top && cutY < interval.bottom);
}

function chooseSafeCut(input: {
  currentTop: number;
  totalHeight: number;
  targetSliceHeight: number;
  intervals: readonly ProtectedInterval[];
}): { cutY: number; safe: boolean } {
  const ideal = Math.min(input.totalHeight - 1, input.currentTop + input.targetSliceHeight);
  const minimumHeight = Math.min(
    input.targetSliceHeight,
    Math.max(1, Math.min(MIN_SLICE_HEIGHT_PX, Math.floor(input.targetSliceHeight / 4))),
  );
  const minimumCut = Math.min(input.totalHeight - 1, input.currentTop + minimumHeight);
  const maximumCut = Math.min(
    input.totalHeight - 1,
    input.currentTop
      + Math.max(
        input.targetSliceHeight,
        Math.floor(input.targetSliceHeight * MAX_TARGET_OVERRUN_RATIO),
      ),
  );

  const candidates = new Set<number>([ideal]);
  for (const interval of input.intervals) {
    if (interval.bottom < minimumCut || interval.top > maximumCut) continue;
    candidates.add(interval.top - SAFE_CUT_MARGIN_PX);
    candidates.add(interval.bottom + SAFE_CUT_MARGIN_PX);
  }

  const safeCandidates = [...candidates]
    .map((candidate) => Math.round(candidate))
    .filter((candidate) => candidate >= minimumCut && candidate <= maximumCut)
    .filter((candidate) => !cutCrossesProtectedInterval(candidate, input.intervals))
    .sort((left, right) => {
      const distance = Math.abs(left - ideal) - Math.abs(right - ideal);
      if (distance !== 0) return distance;
      const leftOverrun = left > ideal ? 1 : 0;
      const rightOverrun = right > ideal ? 1 : 0;
      return leftOverrun - rightOverrun || right - left;
    });

  if (safeCandidates.length > 0) {
    return { cutY: safeCandidates[0]!, safe: true };
  }

  const fallback = Math.max(input.currentTop + 1, ideal);
  return {
    cutY: fallback,
    safe: !cutCrossesProtectedInterval(fallback, input.intervals),
  };
}

export class WebtoonPlatformSpecValidator {
  /** Evaluates canvas properties against a chosen platform profile. */
  public audit(platformId: WebtoonPlatformId, canvas: CanvasAuditInput): SpecAuditResult {
    const spec = WEBTOON_PLATFORM_SPECS[platformId];
    const issues: SpecAuditIssue[] = [];
    const validWidth = isPositiveFinite(canvas.width);
    const validHeight = isPositiveFinite(canvas.height);

    if (!validWidth) {
      issues.push({
        grade: "fail",
        field: "width",
        message: `캔버스 가로폭(${canvas.width}px)이 유효한 양수가 아닙니다.`,
        recommendation: `가로폭을 ${spec.recommendedWidthPx}px 이상의 유효한 값으로 복구하세요.`,
      });
    } else if (!spec.allowedWidthsPx.includes(canvas.width)) {
      const isClose = spec.allowedWidthsPx.some(
        (width) => Math.abs(width - canvas.width) <= 20,
      );
      issues.push({
        grade: isClose ? "warn" : "fail",
        field: "width",
        message: `캔버스 가로폭(${canvas.width}px)이 ${spec.name} 프로필(${spec.allowedWidthsPx.join(", ")}px)과 일치하지 않습니다.`,
        recommendation: `내보내기 시 ${spec.recommendedWidthPx}px로 리샘플링하거나 최신 플랫폼 규격을 다시 확인하세요.`,
      });
    }

    const recommendedSliceCount = validHeight
      ? Math.max(1, Math.ceil(canvas.height / spec.recommendedSliceHeightPx))
      : 1;
    if (!validHeight) {
      issues.push({
        grade: "fail",
        field: "height",
        message: `캔버스 높이(${canvas.height}px)가 유효한 양수가 아닙니다.`,
        recommendation: "손상되지 않은 페이지 높이로 복구한 뒤 다시 검사하세요.",
      });
    } else if (canvas.height > spec.maxSliceHeightPx) {
      const isHardLimit = spec.heightPolicy === "hard-limit";
      const automatic = spec.supportsAutomaticLongImageSlicing;
      issues.push({
        grade: "warn",
        field: "height",
        message: isHardLimit
          ? `원고 높이(${canvas.height}px)가 파일당 최대 높이(${spec.maxSliceHeightPx}px)를 초과합니다.${automatic ? " 플랫폼 자동 분할 대상입니다." : ""}`
          : `원고 높이(${canvas.height}px)가 편집기 권장 분할 높이(${spec.maxSliceHeightPx}px)를 초과합니다.`,
        recommendation: `최소 ${recommendedSliceCount}개 파일로 안전 분할하고 업로드 미리보기에서 컷 순서와 절단면을 확인하세요.`,
      });
    }

    if (
      typeof canvas.estimatedSizeBytes === "number"
      && Number.isFinite(canvas.estimatedSizeBytes)
      && canvas.estimatedSizeBytes > spec.maxFileSizeBytes
    ) {
      issues.push({
        grade: "fail",
        field: "size",
        message: `예상 파일 크기(${formatMib(canvas.estimatedSizeBytes)}MB)가 파일 한도(${formatMib(spec.maxFileSizeBytes)}MB)를 초과합니다.`,
        recommendation: "압축률을 조정하거나 안전 슬라이스 수를 늘리세요.",
      });
    }

    if (
      spec.maxTotalUploadBytes
      && typeof canvas.estimatedTotalSizeBytes === "number"
      && Number.isFinite(canvas.estimatedTotalSizeBytes)
      && canvas.estimatedTotalSizeBytes > spec.maxTotalUploadBytes
    ) {
      issues.push({
        grade: "fail",
        field: "total-size",
        message: `예상 전체 업로드 크기(${formatMib(canvas.estimatedTotalSizeBytes)}MB)가 회차 한도(${formatMib(spec.maxTotalUploadBytes)}MB)를 초과합니다.`,
        recommendation: "회차 전체 이미지 수·압축률·색상 포맷을 함께 조정하세요.",
      });
    }

    if (canvas.format && !spec.allowedFormats.includes(canvas.format)) {
      issues.push({
        grade: "fail",
        field: "format",
        message: `포맷(${canvas.format.toUpperCase()})은 ${spec.name} 프로필에서 지원되지 않습니다.`,
        recommendation: `${spec.allowedFormats.join(", ").toUpperCase()} 포맷으로 변환하세요.`,
      });
    }

    if (canvas.panelGuttersPx && canvas.panelGuttersPx.length > 0) {
      const invalid = canvas.panelGuttersPx.some(
        (gutter) => !Number.isFinite(gutter) || gutter < 0,
      );
      const validGutters = canvas.panelGuttersPx.filter(
        (gutter) => Number.isFinite(gutter) && gutter >= 0,
      );
      if (invalid) {
        issues.push({
          grade: "warn",
          field: "gutter",
          message: "일부 컷 간격 값이 유효하지 않아 페이싱 검사에서 제외했습니다.",
          recommendation: "패널 경계 감지를 다시 실행하거나 간격 값을 0 이상의 픽셀로 수정하세요.",
        });
      }
      if (validGutters.some((gutter) => gutter < spec.minGutterPx)) {
        issues.push({
          grade: "warn",
          field: "gutter",
          message: `일부 컷 간격이 ${spec.minGutterPx}px 미만이라 모바일 호흡이 급박해질 수 있습니다.`,
          recommendation: "대화·감정 반응에 필요한 여백을 늘리고 모바일 미리보기에서 확인하세요.",
        });
      }
      if (validGutters.some((gutter) => gutter > spec.maxGutterPx)) {
        issues.push({
          grade: "warn",
          field: "gutter",
          message: `일부 컷 간격이 ${spec.maxGutterPx}px를 초과해 빈 화면으로 오인될 수 있습니다.`,
          recommendation: "의도한 긴 호흡인지 검토하고 필요하면 효과선·배경 요소 또는 짧은 간격을 사용하세요.",
        });
      }
    }

    const hasFail = issues.some((issue) => issue.grade === "fail");
    const hasWarn = issues.some((issue) => issue.grade === "warn");
    const overallGrade: ComplianceGrade = hasFail ? "fail" : hasWarn ? "warn" : "pass";
    const summary = `${spec.name}: ${
      overallGrade === "pass"
        ? "모든 검사 항목 적합 (Pass)"
        : overallGrade === "warn"
          ? `주의 사항 ${issues.length}건 (Warning)`
          : `규격 미달 ${issues.length}건 (Fail)`
    }`;

    return Object.freeze({
      platform: spec,
      overallGrade,
      isCompliant: !hasFail,
      issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
      recommendedSliceCount,
      summary,
    });
  }

  /** Plans vertical split points while avoiding all overlapping protected intervals. */
  public planAutoSlices(
    totalHeight: number,
    targetSliceHeight: number,
    protectedElements: readonly ElementBoundingBox[] = [],
  ): AutoSlicePlan {
    if (!isPositiveFinite(totalHeight)) {
      throw new RangeError("totalHeight must be a positive finite number");
    }
    if (!isPositiveFinite(targetSliceHeight)) {
      throw new RangeError("targetSliceHeight must be a positive finite number");
    }

    const normalizedTotalHeight = Math.max(1, Math.ceil(totalHeight));
    const normalizedTargetHeight = Math.max(1, Math.floor(targetSliceHeight));
    const intervals = normalizeProtectedIntervals(normalizedTotalHeight, protectedElements);
    const slices: SafeSliceRange[] = [];
    let currentTop = 0;
    let safeCutCount = 0;
    let unsafeCutCount = 0;

    while (currentTop < normalizedTotalHeight) {
      const remaining = normalizedTotalHeight - currentTop;
      if (remaining <= normalizedTargetHeight) {
        slices.push(Object.freeze({
          sliceIndex: slices.length + 1,
          topY: currentTop,
          bottomY: normalizedTotalHeight,
          heightPx: remaining,
          isGutterCut: true,
        }));
        break;
      }

      const selected = chooseSafeCut({
        currentTop,
        totalHeight: normalizedTotalHeight,
        targetSliceHeight: normalizedTargetHeight,
        intervals,
      });
      const chosenBottom = Math.min(
        normalizedTotalHeight,
        Math.max(currentTop + 1, selected.cutY),
      );
      if (selected.safe) safeCutCount += 1;
      else unsafeCutCount += 1;

      slices.push(Object.freeze({
        sliceIndex: slices.length + 1,
        topY: currentTop,
        bottomY: chosenBottom,
        heightPx: chosenBottom - currentTop,
        isGutterCut: selected.safe,
      }));
      currentTop = chosenBottom;
    }

    const cutCount = safeCutCount + unsafeCutCount;
    const safeSplitSuccessRate = cutCount === 0
      ? 100
      : Number(((safeCutCount / cutCount) * 100).toFixed(1));

    return Object.freeze({
      totalHeightPx: normalizedTotalHeight,
      targetSliceHeightPx: normalizedTargetHeight,
      slices: Object.freeze(slices),
      sliceCount: slices.length,
      cutCount,
      safeCutCount,
      unsafeCutCount,
      safeSplitSuccessRate,
    });
  }
}
