/**
 * AI 채색 보조 — 힌트 기반 자동 채색 엔진
 *
 * 네이버 "웹툰 AI 페인터"의 UX를 클라이언트 측 알고리즘으로 재해석:
 * 사용자가 선화 위에 색 힌트(점)를 찍으면, 선을 경계로 영역을 찾아
 * 자연스럽게 색을 입힌다. 유료 AI API 없이 동작하는 순수 로직.
 *
 * 핵심 알고리즘:
 * - 선 감지: 명도 임계값 이하 픽셀을 장벽으로 취급
 * - 영역 채우기: 힌트 지점에서 플러드 필 (스캔라인 최적화)
 * - 색 입히기: 선화는 유지하고 색 레이어를 아래에 까는 방식
 *   (실제 렌더 시 multiply 블렌드로 합성)
 */

export interface AiColorHint {
  /** 힌트 x (px) */
  readonly x: number;
  /** 힌트 y (px) */
  readonly y: number;
  /** 힌트 색상 (hex, 예: "#ff6b6b") */
  readonly color: string;
}

export interface AiColorFillOptions {
  /** 이 명도 이하는 선(장벽)으로 취급. 0-255, 기본 96 */
  readonly lineThreshold: number;
  /** 이미 칠해진 영역 재방문 허용 여부 */
  readonly allowOverlap: boolean;
  /** AI 강도 0-1: 1에 가까울수록 경계를 부드럽게 확장 */
  readonly intensity: number;
}

export const DEFAULT_AI_COLOR_FILL_OPTIONS: AiColorFillOptions = Object.freeze({
  lineThreshold: 96,
  allowOverlap: false,
  intensity: 0.7,
});

export interface AiFilledRegion {
  /** 힌트 인덱스 */
  readonly hintIndex: number;
  /** 채워진 픽셀 수 */
  readonly pixelCount: number;
  /** 영역 바운딩 박스 */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** hex → [r,g,b] */
export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  const full = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value) || full.length !== 6) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** 픽셀 명도 (0-255) */
export function pixelLuminance(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * 선화 ImageData에서 힌트 기반 영역 채색을 수행한다.
 *
 * @param lineArt 선화 픽셀 (RGBA, width*height*4)
 * @param width 캔버스 너비
 * @param height 캔버스 높이
 * @param hints 색 힌트 목록
 * @param options 옵션
 * @returns 색 레이어 ImageData (투명 배경 + 채워진 영역), 영역 정보
 *
 * 색 레이어는 선화 아래에 깔아 multiply로 합성하는 것을 전제로 한다.
 */
export function fillColorHints(
  lineArt: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  hints: readonly AiColorHint[],
  options: AiColorFillOptions = DEFAULT_AI_COLOR_FILL_OPTIONS,
): { readonly colorLayer: Uint8ClampedArray<ArrayBuffer>; readonly regions: readonly AiFilledRegion[] } {
  const colorLayer = new Uint8ClampedArray(width * height * 4);
  const visited = new Uint8Array(width * height);
  const regions: AiFilledRegion[] = [];

  const isLine = (idx: number): boolean => {
    const r = lineArt[idx * 4];
    const g = lineArt[idx * 4 + 1];
    const b = lineArt[idx * 4 + 2];
    const a = lineArt[idx * 4 + 3];
    // 투명 픽셀은 장벽이 아님
    if (a < 16) return false;
    return pixelLuminance(r, g, b) < options.lineThreshold;
  };

  hints.forEach((hint, hintIndex) => {
    const startX = Math.round(hint.x);
    const startY = Math.round(hint.y);
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const [cr, cg, cb] = hexToRgb(hint.color);
    // 강도에 따른 색 농도: 은은하게(0.3) ~ 선명하게(1)
    const alpha = Math.round(90 + 165 * options.intensity);

    const stack: Array<[number, number]> = [[startX, startY]];
    let pixelCount = 0;
    let minX = startX;
    let minY = startY;
    let maxX = startX;
    let maxY = startY;

    while (stack.length > 0) {
      const [x, y] = stack.pop() as [number, number];
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const idx = y * width + x;
      if (visited[idx] !== 0 && !options.allowOverlap) continue;
      if (isLine(idx)) continue;
      visited[idx] = 1;

      const o = idx * 4;
      colorLayer[o] = cr;
      colorLayer[o + 1] = cg;
      colorLayer[o + 2] = cb;
      // 이미 칠해진 곳에 덧칠할 때는 알파를 유지 (덮어쓰지 않음)
      if (colorLayer[o + 3] === 0) colorLayer[o + 3] = alpha;
      pixelCount += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    if (pixelCount > 0) {
      regions.push({
        hintIndex,
        pixelCount,
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        },
      });
    }
  });

  return { colorLayer, regions };
}

/** 광원 방향 */
export type AiLightDirection = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right";

/**
 * 그림자/하이라이트 자동 배치 가이드 생성.
 * 영역 바운딩 박스와 광원 방향으로 그림자가 질 영역을 사각형으로 제안한다.
 * 실제 렌더는 호출 측에서 수행 — 여기는 "어디에 칠할지" 가이드 데이터만 반환.
 */
export function suggestShadowHighlight(
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  light: AiLightDirection,
  intensity: number,
): {
  readonly shadow: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly highlight: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly highlightOpacity: number;
} {
  const { x, y, width, height } = bounds;
  const thirdW = width / 3;
  const thirdH = height / 3;

  // 광원 반대편 1/3을 그림자, 광원 쪽 1/3을 하이라이트로 제안
  const horizontal = light.includes("left") ? -1 : light.includes("right") ? 1 : 0;
  const vertical = light.includes("top") ? -1 : light.includes("bottom") ? 1 : 0;

  const shadow = {
    x: horizontal <= 0 ? x + width - thirdW : x,
    y: vertical <= 0 ? y + height - thirdH : y,
    width: horizontal === 0 ? width : thirdW,
    height: vertical === 0 ? height : thirdH,
  };
  const highlight = {
    x: horizontal <= 0 ? x : x + width - thirdW,
    y: vertical <= 0 ? y : y + height - thirdH,
    width: horizontal === 0 ? width : thirdW,
    height: vertical === 0 ? height : thirdH,
  };

  return {
    shadow,
    highlight,
    shadowOpacity: Math.round(0.35 * intensity * 100) / 100,
    highlightOpacity: Math.round(0.25 * intensity * 100) / 100,
  };
}

/**
 * 이전 컷의 색상을 참조해 일관성을 유지하기 위한 팔레트 추출.
 * 색 레이어에서 가장 많이 쓰인 상위 N개 색을 반환한다.
 */
export function extractReferencePalette(
  colorLayer: Uint8ClampedArray,
  topN: number,
): readonly string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < colorLayer.length; i += 4) {
    const a = colorLayer[i + 3];
    if (a < 16) continue;
    // 양자화 (16 단위) — 비슷한 색을 하나로 묶음. 255 상한 클램프.
    const quantize = (v: number): number => Math.min(255, Math.round(v / 16) * 16);
    const r = quantize(colorLayer[i]);
    const g = quantize(colorLayer[i + 1]);
    const b = quantize(colorLayer[i + 2]);
    const key = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, topN))
    .map(([color]) => color);
}
