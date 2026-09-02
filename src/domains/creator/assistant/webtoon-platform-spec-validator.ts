/**
 * webtoon-platform-spec-validator.ts
 *
 * Webtoon Platform Upload Spec Validator & Vertical Strip Auto-Slicer.
 * Benchmarks ToonSlicer, Naver Webtoon Creator Studio, Kakao Page, and Webtoon Canvas specs.
 *
 * - Audits canvas width, height, aspect ratio, slice counts, and estimated file weight against platform limits.
 * - Auto-computes safe vertical cut lines (Safe Split Gutter Lines) so panels, speech bubbles, and character heads
 *   are never sliced through the middle during multi-page export.
 */

export type WebtoonPlatformId =
  | "naver-webtoon"
  | "kakao-page"
  | "webtoon-canvas"
  | "lezhin-comics"
  | "toptoon"
  | "postype";

export interface WebtoonPlatformSpec {
  readonly id: WebtoonPlatformId;
  readonly name: string;
  readonly recommendedWidthPx: number;
  readonly allowedWidthsPx: readonly number[];
  readonly maxSliceHeightPx: number;
  readonly recommendedSliceHeightPx: number;
  readonly maxFileSizeBytes: number; // e.g. 5MB = 5 * 1024 * 1024
  readonly allowedFormats: readonly ("jpg" | "png" | "webp" | "gif")[];
  readonly minGutterPx: number; // Minimum recommended gap between panels
  readonly maxGutterPx: number; // Maximum gap before alert
  readonly description: string;
}

export interface CanvasAuditInput {
  readonly width: number;
  readonly height: number;
  readonly dpi?: number;
  readonly estimatedSizeBytes?: number;
  readonly format?: "jpg" | "png" | "webp";
  readonly panelGuttersPx?: readonly number[]; // Detected or reported gaps between panels
}

export type ComplianceGrade = "pass" | "warn" | "fail";

export interface SpecAuditIssue {
  readonly grade: ComplianceGrade;
  readonly field: "width" | "height" | "size" | "format" | "gutter";
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
  readonly isGutterCut: boolean; // True if cut fell inside an empty gutter gap
}

export interface AutoSlicePlan {
  readonly totalHeightPx: number;
  readonly targetSliceHeightPx: number;
  readonly slices: readonly SafeSliceRange[];
  readonly sliceCount: number;
  readonly safeSplitSuccessRate: number; // 0..100% of cuts that didn't cross elements
}

export const WEBTOON_PLATFORM_SPECS: Record<WebtoonPlatformId, WebtoonPlatformSpec> = {
  "naver-webtoon": {
    id: "naver-webtoon",
    name: "네이버웹툰 (도전/베도/정식)",
    recommendedWidthPx: 690,
    allowedWidthsPx: [690],
    maxSliceHeightPx: 20000,
    recommendedSliceHeightPx: 10000,
    maxFileSizeBytes: 5 * 1024 * 1024, // 5MB per file
    allowedFormats: ["jpg", "png", "gif"],
    minGutterPx: 100,
    maxGutterPx: 1000,
    description: "가로 690px 고정, 컷당 최대 5MB. 정식 연재는 10,000~20,000px 분할 권장.",
  },
  "kakao-page": {
    id: "kakao-page",
    name: "카카오페이지 / 카카오웹툰",
    recommendedWidthPx: 720,
    allowedWidthsPx: [720, 1080],
    maxSliceHeightPx: 15000,
    recommendedSliceHeightPx: 10000,
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedFormats: ["jpg", "png"],
    minGutterPx: 120,
    maxGutterPx: 900,
    description: "가로 720px(기본) / 1080px(고해상도). 컷당 10,000px 안팎 분할 권장.",
  },
  "webtoon-canvas": {
    id: "webtoon-canvas",
    name: "네이버 글로벌 WEBTOON Canvas",
    recommendedWidthPx: 800,
    allowedWidthsPx: [800],
    maxSliceHeightPx: 1280, // Canvas strictly limits images to max 1280px tall!
    recommendedSliceHeightPx: 1280,
    maxFileSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedFormats: ["jpg"],
    minGutterPx: 80,
    maxGutterPx: 600,
    description: "가로 800px, 세로 최대 1280px 엄격 제한, 파일당 2MB 이하 JPG 필수.",
  },
  "lezhin-comics": {
    id: "lezhin-comics",
    name: "레진코믹스",
    recommendedWidthPx: 800,
    allowedWidthsPx: [800, 1440],
    maxSliceHeightPx: 25000,
    recommendedSliceHeightPx: 12000,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedFormats: ["jpg", "png"],
    minGutterPx: 120,
    maxGutterPx: 1000,
    description: "가로 800px 또는 1440px 고해상도. 장당 최대 10MB.",
  },
  toptoon: {
    id: "toptoon",
    name: "탑툰 (Toptoon)",
    recommendedWidthPx: 800,
    allowedWidthsPx: [800],
    maxSliceHeightPx: 20000,
    recommendedSliceHeightPx: 10000,
    maxFileSizeBytes: 8 * 1024 * 1024,
    allowedFormats: ["jpg", "png"],
    minGutterPx: 100,
    maxGutterPx: 900,
    description: "가로 800px 표준. 파일당 8MB 이하 권장.",
  },
  postype: {
    id: "postype",
    name: "포스타입 / 딜리헙 (독립연재)",
    recommendedWidthPx: 1600,
    allowedWidthsPx: [690, 720, 800, 1200, 1600],
    maxSliceHeightPx: 30000,
    recommendedSliceHeightPx: 15000,
    maxFileSizeBytes: 20 * 1024 * 1024,
    allowedFormats: ["jpg", "png", "webp"],
    minGutterPx: 150,
    maxGutterPx: 1200,
    description: "고화질 1600px 지원 및 WebP 지원. 자유로운 컷 길이 허용.",
  },
};

export class WebtoonPlatformSpecValidator {
  /**
   * Evaluates canvas properties against a chosen webtoon platform.
   */
  public audit(platformId: WebtoonPlatformId, canvas: CanvasAuditInput): SpecAuditResult {
    const spec = WEBTOON_PLATFORM_SPECS[platformId];
    const issues: SpecAuditIssue[] = [];

    // 1. Width validation
    if (!spec.allowedWidthsPx.includes(canvas.width)) {
      const isClose = spec.allowedWidthsPx.some((w) => Math.abs(w - canvas.width) <= 20);
      issues.push({
        grade: isClose ? "warn" : "fail",
        field: "width",
        message: `캔버스 가로폭(${canvas.width}px)이 플랫폼 권장 가로폭(${spec.recommendedWidthPx}px)과 일치하지 않습니다.`,
        recommendation: `내보내기 시 가로폭을 ${spec.recommendedWidthPx}px로 리샘플링하거나 캔버스 규격을 변경하세요.`,
      });
    }

    // 2. Height & Slice estimation
    const recommendedSliceCount = Math.max(1, Math.ceil(canvas.height / spec.recommendedSliceHeightPx));
    if (canvas.height > spec.maxSliceHeightPx) {
      issues.push({
        grade: "warn",
        field: "height",
        message: `원고 전체 높이(${canvas.height}px)가 플랫폼 컷당 최대 높이(${spec.maxSliceHeightPx}px)를 초과합니다.`,
        recommendation: `원고를 최소 ${recommendedSliceCount}개 파일로 분할(Auto-Slice)하여 업로드해야 합니다.`,
      });
    }

    // 3. File size validation (if provided)
    if (canvas.estimatedSizeBytes && canvas.estimatedSizeBytes > spec.maxFileSizeBytes) {
      const sizeMb = (canvas.estimatedSizeBytes / (1024 * 1024)).toFixed(1);
      const limitMb = (spec.maxFileSizeBytes / (1024 * 1024)).toFixed(1);
      issues.push({
        grade: "fail",
        field: "size",
        message: `예상 파일 크기(${sizeMb}MB)가 업로드 한도(${limitMb}MB)를 초과합니다.`,
        recommendation: "압축률을 80~85%로 조정하거나 슬라이스 분할 개수를 늘리세요.",
      });
    }

    // 4. Format validation (if provided)
    if (canvas.format && !spec.allowedFormats.includes(canvas.format)) {
      issues.push({
        grade: "fail",
        field: "format",
        message: `포맷(${canvas.format.toUpperCase()})은 ${spec.name}에서 직접 지원하지 않습니다.`,
        recommendation: `${spec.allowedFormats.join(", ").toUpperCase()} 포맷으로 변환하세요.`,
      });
    }

    // 5. Gutter analysis
    if (canvas.panelGuttersPx && canvas.panelGuttersPx.length > 0) {
      const tooNarrow = canvas.panelGuttersPx.some((g) => g < spec.minGutterPx);
      const tooWide = canvas.panelGuttersPx.some((g) => g > spec.maxGutterPx);
      if (tooNarrow) {
        issues.push({
          grade: "warn",
          field: "gutter",
          message: `일부 컷 간격이 너무 좁아(${spec.minGutterPx}px 미만) 모바일에서 호흡이 급박해질 수 있습니다.`,
          recommendation: "컷 사이 여백을 150~300px 이상 확보하여 대화/감정 반응 호흡을 부여하세요.",
        });
      }
      if (tooWide) {
        issues.push({
          grade: "warn",
          field: "gutter",
          message: `일부 컷 간격이 너무 넓어(${spec.maxGutterPx}px 초과) 독자가 빈 화면으로 오인할 수 있습니다.`,
          recommendation: "긴 여백 연출 시 효과선이나 부유 효과를 가미하거나 간격을 800px 이내로 압축하세요.",
        });
      }
    }

    const hasFail = issues.some((i) => i.grade === "fail");
    const hasWarn = issues.some((i) => i.grade === "warn");
    const overallGrade: ComplianceGrade = hasFail ? "fail" : hasWarn ? "warn" : "pass";

    const summary = `${spec.name}: ${
      overallGrade === "pass"
        ? "모든 규격 적합 (Pass)"
        : overallGrade === "warn"
        ? `주의 사항 ${issues.length}건 (Warning)`
        : `규격 미달 ${issues.length}건 (Fail)`
    }`;

    return {
      platform: spec,
      overallGrade,
      isCompliant: !hasFail,
      issues,
      recommendedSliceCount,
      summary,
    };
  }

  /**
   * Plans vertical split points avoiding slicing across panels or characters.
   * Benchmarks ToonSlicer / Clip Studio Webtoon Page Divider.
   */
  public planAutoSlices(
    totalHeight: number,
    targetSliceHeight: number,
    protectedElements: readonly ElementBoundingBox[] = [],
  ): AutoSlicePlan {
    const slices: SafeSliceRange[] = [];
    let currentTop = 0;
    let safeCutCount = 0;

    while (currentTop < totalHeight) {
      const candidateBottom = Math.min(totalHeight, currentTop + targetSliceHeight);

      if (candidateBottom >= totalHeight) {
        // Last slice
        slices.push({
          sliceIndex: slices.length + 1,
          topY: currentTop,
          bottomY: totalHeight,
          heightPx: totalHeight - currentTop,
          isGutterCut: true,
        });
        safeCutCount++;
        break;
      }

      // Check if candidateBottom intersects any protected element
      const intersecting = protectedElements.find(
        (el) => candidateBottom > el.top && candidateBottom < el.bottom,
      );

      let chosenBottom = candidateBottom;
      let isSafeGutter = true;

      if (intersecting) {
        // Find safe split: preferably just before the element top
        const beforeTop = Math.max(currentTop + 200, intersecting.top - 20);
        if (beforeTop > currentTop && beforeTop < candidateBottom) {
          chosenBottom = beforeTop;
          isSafeGutter = true;
        } else {
          // If cutting before is too short, try cutting just after bottom if within acceptable overrun
          const afterBottom = intersecting.bottom + 20;
          if (afterBottom <= totalHeight && afterBottom - currentTop <= targetSliceHeight * 1.2) {
            chosenBottom = afterBottom;
            isSafeGutter = true;
          } else {
            // Cannot find safe cut; split as-is with fallback
            chosenBottom = candidateBottom;
            isSafeGutter = false;
          }
        }
      }

      if (isSafeGutter) {
        safeCutCount++;
      }

      slices.push({
        sliceIndex: slices.length + 1,
        topY: currentTop,
        bottomY: chosenBottom,
        heightPx: chosenBottom - currentTop,
        isGutterCut: isSafeGutter,
      });

      currentTop = chosenBottom;
    }

    const safeRate = slices.length > 0 ? Number(((safeCutCount / slices.length) * 100).toFixed(1)) : 100;

    return {
      totalHeightPx: totalHeight,
      targetSliceHeightPx: targetSliceHeight,
      slices,
      sliceCount: slices.length,
      safeSplitSuccessRate: safeRate,
    };
  }
}
