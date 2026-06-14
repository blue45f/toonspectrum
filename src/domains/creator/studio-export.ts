// 스튜디오 이미지 내보내기 — 배율·포맷 옵션과 긴 스트립 합성 시 캔버스 한계 가드.
// 브라우저 캔버스는 한 변이 대략 16k~32k px를 넘으면 조용히 빈 이미지를 내놓으므로
// 합성 전에 총 높이를 검사해 배율 하향 또는 분할 저장으로 우회한다.

export const EXPORT_SCALES = [1, 2, 3] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

export type ExportFormat = "png" | "jpg" | "webp";

// 포맷 선택 UI/순회용 — type ExportFormat과 동기 유지.
export const EXPORT_FORMATS = ["png", "jpg", "webp"] as const;

export const JPEG_QUALITY = 0.92;
export const WEBP_QUALITY = 0.92;

// 주요 브라우저 공통으로 안전한 캔버스 한 변 상한(px) — Safari/Chrome 보수값.
export const MAX_CANVAS_DIM = 16384;

export function exportMimeType(format: ExportFormat): string {
  if (format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

// 포맷 표시 라벨(드롭다운 등).
export function exportFormatLabel(format: ExportFormat): string {
  if (format === "jpg") return "JPG";
  if (format === "webp") return "WebP";
  return "PNG";
}

// 손실 압축 포맷의 품질 인자 — PNG는 무손실이라 undefined(canvas.toBlob 기본).
export function exportQuality(format: ExportFormat): number | undefined {
  if (format === "jpg") return JPEG_QUALITY;
  if (format === "webp") return WEBP_QUALITY;
  return undefined;
}

// 단일 페이지 파일명 — 기존 규칙 유지: `<제목>[-transparent].<확장자>`.
export function pageExportFileName(title: string, format: ExportFormat, transparent: boolean): string {
  return `${title.trim() || "toonspectrum-comic"}${transparent ? "-transparent" : ""}.${format}`;
}

// 스트립 파일명 — 기존 규칙 유지: `<제목>-strip.<확장자>`, 분할 시 `-strip-1of3` 식 접미사.
export function stripExportFileName(
  title: string,
  format: ExportFormat,
  part?: { index: number; total: number }
): string {
  const suffix = part && part.total > 1 ? `-${part.index + 1}of${part.total}` : "";
  return `${title.trim() || "toonspectrum-webtoon"}-strip${suffix}.${format}`;
}

// 페이지 높이 합 + 페이지 사이 간격으로 스트립 총 높이(px)를 구한다.
export function stripTotalHeight(pageHeights: number[], spacing: number, scale = 1): number {
  if (pageHeights.length === 0) return 0;
  const content = pageHeights.reduce((sum, h) => sum + h, 0);
  return Math.ceil((content + spacing * (pageHeights.length - 1)) * scale);
}

// maxDim 안에서 단일 캔버스 합성이 가능한 최대 정수 배율(1..scale). 1×도 넘치면 null.
export function maxFittingScale(
  pageHeights: number[],
  spacing: number,
  scale: number,
  maxDim = MAX_CANVAS_DIM
): number | null {
  for (let s = Math.floor(scale); s >= 1; s--) {
    if (stripTotalHeight(pageHeights, spacing, s) <= maxDim) return s;
  }
  return null;
}

// scale 배율 기준, 각 파일이 maxDim을 넘지 않도록 연속 페이지를 앞에서부터 묶는다.
// (단일 페이지가 혼자 maxDim을 넘으면 그대로 한 묶음 — 페이지 중간을 자를 수는 없다.)
export function splitPagesForExport(
  pageHeights: number[],
  spacing: number,
  scale: number,
  maxDim = MAX_CANVAS_DIM
): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let currentHeight = 0;
  pageHeights.forEach((height, index) => {
    const scaled = height * scale;
    const nextHeight = current.length === 0 ? scaled : currentHeight + spacing * scale + scaled;
    if (current.length > 0 && nextHeight > maxDim) {
      chunks.push(current);
      current = [index];
      currentHeight = scaled;
    } else {
      current.push(index);
      currentHeight = nextHeight;
    }
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// canvas.toBlob을 Promise로 — dataURL(base64 문자열) 대비 대형 출력 메모리 절감.
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("캔버스를 이미지로 변환하지 못했어요. 배율을 낮춰 다시 시도해주세요."));
      },
      type,
      quality
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 이미지 클립보드 복사 지원 여부 — navigator.clipboard + ClipboardItem 둘 다 필요(Firefox 등은 미지원).
export function canCopyImageToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.clipboard &&
    typeof (globalThis as { ClipboardItem?: unknown }).ClipboardItem !== "undefined"
  );
}

// 현재 캔버스를 PNG로 클립보드에 복사 — 클립보드 이미지 포맷은 PNG가 가장 호환성이 높다.
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  if (!canCopyImageToClipboard()) {
    throw new Error("이 브라우저는 이미지 클립보드 복사를 지원하지 않아요.");
  }
  try {
    const blob = await canvasToBlob(canvas, "image/png");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch {
    throw new Error("이미지를 클립보드에 복사하지 못했어요. 다시 시도해주세요.");
  }
}
