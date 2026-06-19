/**
 * Studio Watermark — 내보내기 시 작가 서명/워터마크를 출력 픽셀에 합성한다(코미포의
 * 저작권 워터마크 벤치마크). 공개 창작 게시판 특성상 도용 방지·귀속 표기에 쓴다.
 *
 * 배치 계산(어디에·얼마 크기로)은 순수 함수로 두어 단위 테스트가 가능하고, 실제 캔버스
 * 그리기는 StudioPage 내보내기 경로가 이 배치값을 받아 수행한다. 설정은 localStorage에
 * 저장돼 세션을 넘어 같은 서명을 유지한다. 사용자 노출 문자열은 한글.
 */

export type WatermarkPosition = "br" | "bl" | "tr" | "tl" | "center";

export const WATERMARK_POSITIONS: { id: WatermarkPosition; label: string }[] = [
  { id: "br", label: "오른쪽 아래" },
  { id: "bl", label: "왼쪽 아래" },
  { id: "tr", label: "오른쪽 위" },
  { id: "tl", label: "왼쪽 위" },
  { id: "center", label: "가운데" },
];

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  opacity: number; // 0..1
  size: number; // 캔버스 폭 대비 글자 크기 비율(예: 0.028 = 폭의 2.8%)
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  text: "",
  position: "br",
  opacity: 0.55,
  size: 0.028,
};

const POSITION_IDS = new Set(WATERMARK_POSITIONS.map((p) => p.id));

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** 자유 객체에서 워터마크 설정을 안전하게 읽어 정규화한다(localStorage·doc 호환). */
export function normalizeWatermark(raw: unknown): WatermarkSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WATERMARK };
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    text: typeof o.text === "string" ? o.text.slice(0, 60) : "",
    position: typeof o.position === "string" && POSITION_IDS.has(o.position as WatermarkPosition) ? (o.position as WatermarkPosition) : "br",
    opacity: typeof o.opacity === "number" ? clamp(o.opacity, 0, 1) : DEFAULT_WATERMARK.opacity,
    size: typeof o.size === "number" ? clamp(o.size, 0.012, 0.08) : DEFAULT_WATERMARK.size,
  };
}

export interface WatermarkPlacement {
  x: number;
  y: number;
  textAlign: "left" | "right" | "center";
  textBaseline: "top" | "bottom" | "middle";
  fontPx: number;
  margin: number;
}

/**
 * 워터마크를 그릴 위치·정렬·글자 크기를 계산한다(순수). 그리기는 호출부가 담당한다.
 * margin은 캔버스 폭의 약 2.5%(최소 12px), fontPx는 폭×size(최소 11px).
 */
export function watermarkPlacement(canvasW: number, canvasH: number, s: WatermarkSettings): WatermarkPlacement {
  const margin = Math.max(12, Math.round(canvasW * 0.025));
  const fontPx = Math.max(11, Math.round(canvasW * s.size));
  switch (s.position) {
    case "bl":
      return { x: margin, y: canvasH - margin, textAlign: "left", textBaseline: "bottom", fontPx, margin };
    case "tr":
      return { x: canvasW - margin, y: margin, textAlign: "right", textBaseline: "top", fontPx, margin };
    case "tl":
      return { x: margin, y: margin, textAlign: "left", textBaseline: "top", fontPx, margin };
    case "center":
      return { x: Math.round(canvasW / 2), y: Math.round(canvasH / 2), textAlign: "center", textBaseline: "middle", fontPx, margin };
    default: // "br"
      return { x: canvasW - margin, y: canvasH - margin, textAlign: "right", textBaseline: "bottom", fontPx, margin };
  }
}

/** 내보내기 시 실제로 워터마크를 그릴지 — 켜져 있고 텍스트가 있어야 한다. */
export function shouldDrawWatermark(s: WatermarkSettings): boolean {
  return s.enabled && s.text.trim().length > 0;
}
