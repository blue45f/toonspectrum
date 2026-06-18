/**
 * Studio Export Presets — 플랫폼별 내보내기 규격 프리셋 · 검증 · 스트립 슬라이스 계획.
 *
 * 기존 내보내기는 배율(1/2/3)·포맷(png/jpg/webp)·투명배경만 있고, "네이버 도전만화는
 * 폭 690·JPG만·5MB" 같은 연재 규격을 알려주거나 검증하지 못했다. 이 모듈이 그 공백을
 * 메운다 — 대표 플랫폼 규격 데이터 + 현재 출력이 규격에 맞는지 한글 경고 + 긴 세로
 * 스트립을 규격 높이로 자르는 슬라이스 계획을 순수 함수로 제공한다.
 *
 * 전부 순수·결정적(랜덤·부작용 없음). DOM/Konva/React 의존 없음 — 내보내기 UI와
 * 단위 테스트가 같은 규격을 공유한다. 사용자 노출 문자열은 한글.
 */

export type ExportFormat = "png" | "jpg" | "webp";

export interface ExportPreset {
  id: string;
  label: string;
  platform: string;
  /** 권장 출력 폭(px). 0이면 "원본 유지"(폭 변환 없음). */
  width: number;
  allowedFormats: ExportFormat[];
  recommendedFormat: ExportFormat;
  /** 이미지 1장 최대 높이(px). 초과 시 분할 권장. */
  maxImageHeight?: number;
  /** 이미지 1장 최대 용량(byte). */
  maxFileBytes?: number;
  note: string;
}

const MB = 1024 * 1024;

/**
 * 대표 웹툰/SNS 플랫폼 내보내기 규격. 좁은 폭 → 넓은 폭, 마지막은 "원본 유지".
 * 폭/포맷/높이/용량 기준은 각 플랫폼 업로드·공모전 가이드에서 가져온 일반 기준값이다.
 */
export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "naver-challenge",
    label: "네이버 도전만화",
    platform: "네이버 웹툰",
    width: 690,
    allowedFormats: ["jpg"],
    recommendedFormat: "jpg",
    maxImageHeight: 1280,
    maxFileBytes: 5 * MB,
    note: "폭 690px · JPG만 지원(PNG 불가) · 이미지당 5MB · 회차 합계 약 50MB.",
  },
  {
    id: "webtoon-canvas",
    label: "웹툰 캔버스",
    platform: "WEBTOON Canvas",
    width: 800,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1280,
    note: "폭 800px 권장 · 세로 1280px 단위로 잘라 업로드.",
  },
  {
    id: "lezhin",
    label: "레진코믹스",
    platform: "레진",
    width: 1440,
    allowedFormats: ["jpg"],
    recommendedFormat: "jpg",
    note: "폭 1440px · JPG · 300dpi 고해상 권장(공모전 기준).",
  },
  {
    id: "kakaopage",
    label: "카카오페이지",
    platform: "카카오",
    width: 720,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 4200,
    note: "폭 720px · 이미지 1장 세로 4200px 이내.",
  },
  {
    id: "instagram-square",
    label: "인스타그램 정방형",
    platform: "Instagram",
    width: 1080,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1080,
    note: "1080×1080 정방형 피드.",
  },
  {
    id: "instagram-portrait",
    label: "인스타그램 세로",
    platform: "Instagram",
    width: 1080,
    allowedFormats: ["jpg", "png"],
    recommendedFormat: "jpg",
    maxImageHeight: 1350,
    note: "1080×1350 세로 피드(4:5).",
  },
  {
    id: "original",
    label: "원본 고해상도",
    platform: "범용",
    width: 0,
    allowedFormats: ["png", "jpg", "webp"],
    recommendedFormat: "png",
    note: "폭 변환 없이 현재 배율 그대로 — 백업·재편집용.",
  },
];

/** id로 프리셋 조회(없으면 undefined). */
export function findExportPreset(id: string): ExportPreset | undefined {
  return EXPORT_PRESETS.find((p) => p.id === id);
}

export interface StripSlice {
  index: number;
  y: number;
  height: number;
}

/**
 * 전체 세로 길이를 sliceHeight 단위로 자른 슬라이스 목록. 마지막 칸은 남은 높이.
 * sliceHeight<=0 또는 totalHeight<=0 이면 [].
 */
export function planStripSlices(totalHeight: number, sliceHeight: number): StripSlice[] {
  if (sliceHeight <= 0 || totalHeight <= 0) return [];
  const slices: StripSlice[] = [];
  let y = 0;
  let index = 0;
  while (y < totalHeight) {
    const height = Math.min(sliceHeight, totalHeight - y);
    slices.push({ index, y, height });
    y += sliceHeight;
    index += 1;
  }
  return slices;
}

/**
 * 캔버스 폭을 프리셋 권장 폭에 맞추는 출력 배율.
 * - preset.width<=0(원본 유지) 또는 canvasWidth<=0 이면 1.
 * - 그 외 preset.width/canvasWidth 를 0.25~4로 클램프, 소수 둘째 자리 반올림.
 */
export function recommendScale(canvasWidth: number, preset: ExportPreset): number {
  if (preset.width <= 0 || canvasWidth <= 0) return 1;
  const raw = preset.width / canvasWidth;
  const clamped = Math.min(4, Math.max(0.25, raw));
  return Math.round(clamped * 100) / 100;
}

export type ExportWarningCode = "format" | "height" | "filesize" | "width";
export interface ExportWarning {
  code: ExportWarningCode;
  message: string;
}
export interface ExportValidation {
  ok: boolean;
  warnings: ExportWarning[];
}

/**
 * 현재 출력 사양(폭·높이·포맷·용량)이 프리셋 규격에 맞는지 검사. 경고는 한글 메시지.
 * 경고가 하나도 없으면 ok:true.
 */
export function validateExport(
  input: { width: number; height: number; format: ExportFormat; bytes?: number },
  preset: ExportPreset
): ExportValidation {
  const warnings: ExportWarning[] = [];
  if (!preset.allowedFormats.includes(input.format)) {
    warnings.push({
      code: "format",
      message: `${preset.label}은(는) ${input.format.toUpperCase()} 형식을 지원하지 않아요. 권장: ${preset.recommendedFormat.toUpperCase()}.`,
    });
  }
  if (preset.maxImageHeight !== undefined && input.height > preset.maxImageHeight) {
    warnings.push({
      code: "height",
      message: `이미지 높이가 ${preset.maxImageHeight.toLocaleString()}px를 넘어요. 여러 장으로 나눠 내보내는 걸 권장해요.`,
    });
  }
  if (
    preset.maxFileBytes !== undefined &&
    input.bytes !== undefined &&
    input.bytes > preset.maxFileBytes
  ) {
    warnings.push({
      code: "filesize",
      message: `용량이 ${Math.round(preset.maxFileBytes / MB)}MB를 넘어요. 품질을 낮추거나 분할하세요.`,
    });
  }
  if (preset.width > 0 && input.width !== preset.width) {
    warnings.push({
      code: "width",
      message: `출력 폭 ${input.width.toLocaleString()}px가 권장 폭 ${preset.width.toLocaleString()}px와 달라요.`,
    });
  }
  return { ok: warnings.length === 0, warnings };
}
