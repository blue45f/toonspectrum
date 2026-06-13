/**
 * Studio Sticker Outline Engine
 * 스티커 테두리 — 불투명 실루엣 바깥으로 컬러 스트로크를 그린다(알파 팽창/dilation).
 * 알파가 불투명(>=128)인 원본 픽셀은 그대로 두고, 투명/반투명 픽셀이 반경 width 안에
 * 불투명 픽셀을 두면 그 픽셀을 outline color로 채우고 alpha=255*opacity/100으로 만든다.
 * 실루엣 "바깥" 테두리만 칠하므로 스티커·이모티콘 컷아웃 느낌을 낸다.
 *
 * 효율: 각 픽셀에서 가장 가까운 불투명 픽셀까지의 거리를 분리형(가로→세로) 거리 변환
 * (Felzenszwalb & Huttenlocher, O(n))으로 한 번에 구한 뒤, dist<=width인 투명 픽셀만 칠한다.
 * 박스 스캔이 아니라서 width가 커도 비용이 선형이고, 둥근(유클리드) 테두리가 나온다.
 *
 * 필터는 StudioPage가 offset=width로 캐싱한 "패딩된" 캔버스 위에서 돈다(테두리가 바깥으로
 * 자랄 여유 공간). Konva/DOM 의존 없음 — StudioPage 캔버스 로직과 단위 테스트가 공유한다.
 * 전부 순수·결정적(랜덤 없음).
 */

import type { StudioImageDataLike } from "./studio-filters";
import { hexToRgb } from "./studio-filters";

// ---------------------------------------------------------------------------
// 파라미터 타입·기본값·범위
// ---------------------------------------------------------------------------

/** 스티커 테두리. color #rrggbb, width 0..30(px 두께), opacity 0..100(테두리 알파 %). */
export type Outline = { color: string; width: number; opacity: number };

/** 항등(테두리 없음) — 흰색·두께 0·불투명 100. width 0이라 아무것도 그리지 않는다. */
export const DEFAULT_OUTLINE: Outline = { color: "#ffffff", width: 0, opacity: 100 };

/** 두께 슬라이더 한 칸 범위 — 0..30px, 1 단위. */
export const OUTLINE_WIDTH_RANGE = { min: 0, max: 30, step: 1 } as const;

/** 불투명도 슬라이더 한 칸 범위 — 0..100%, 1 단위. */
export const OUTLINE_OPACITY_RANGE = { min: 0, max: 100, step: 1 } as const;

// 알파 임계 — 이 값 이상이면 "불투명"(원본 실루엣), 미만이면 테두리 후보(투명/반투명).
const ALPHA_OPAQUE = 128;

// #rrggbb 검증용(소문자/대문자 6자리). 어긋나면 정규화에서 기본 색으로 되돌린다.
const HEX6_RE = /^#[0-9a-f]{6}$/i;

// 거리 변환에서 "불투명 픽셀 없음"을 뜻하는 큰 값(제곱 거리 단위).
const FAR = 1e9;

// ---------------------------------------------------------------------------
// 정규화·항등 판정
// ---------------------------------------------------------------------------

// 한 값을 [min,max]로 클램프, 숫자 아님은 fallback.
function clampTo(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/**
 * 과거 저장본/외부 입력 안전장치 — 누락/무효 키는 기본값, 범위 밖 숫자는 클램프.
 * color는 #rrggbb 형식이 아니면 기본 흰색으로 되돌린다(셰이더에 잘못된 색 차단).
 */
export function normalizeOutline(o?: Partial<Outline> | null): Outline {
  const src = o && typeof o === "object" ? o : {};
  const color = typeof src.color === "string" && HEX6_RE.test(src.color) ? src.color : DEFAULT_OUTLINE.color;
  return {
    color,
    width: clampTo(src.width, OUTLINE_WIDTH_RANGE.min, OUTLINE_WIDTH_RANGE.max, DEFAULT_OUTLINE.width),
    opacity: clampTo(src.opacity, OUTLINE_OPACITY_RANGE.min, OUTLINE_OPACITY_RANGE.max, DEFAULT_OUTLINE.opacity),
  };
}

/** 두께 0 이하 또는 불투명도 0 이하 — 즉 픽셀을 건드리지 않는 항등 설정인지. */
export function isIdentityOutline(o: Outline): boolean {
  return o.width <= 0 || o.opacity <= 0;
}

// ---------------------------------------------------------------------------
// 거리 변환 — 각 픽셀에서 가장 가까운 불투명 픽셀까지의 제곱 유클리드 거리
// ---------------------------------------------------------------------------

/**
 * 1D 제곱 거리 변환(Felzenszwalb & Huttenlocher) — f[i]가 각 점의 시드 비용일 때
 * d[i] = min_j ( (i-j)^2 + f[j] )를 O(n)에 채운다.
 * 가로/세로 패스에서 각각 한 줄(행 또는 열)에 대해 호출한다.
 * v/z는 호출자가 재사용하는 작업 버퍼(하부 포물선 인덱스·교차점)다.
 */
function dt1d(f: Float64Array, d: Float64Array, n: number, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    // 새 포물선과 현재 최상위 포물선의 교차점 s를 구해, s가 뒤로 밀리면 스택을 비운다.
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  // 각 i에서 자신을 덮는 하부 포물선을 골라 거리 평가.
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dx = q - v[k]!;
    d[q] = dx * dx + f[v[k]!]!;
  }
}

/**
 * 2D 제곱 유클리드 거리 변환 — 입력 seed[i]가 0(불투명 픽셀)이거나 FAR(그 외)일 때
 * 각 픽셀에서 가장 가까운 불투명 픽셀까지의 제곱 거리를 반환한다.
 * 세로 패스 → 가로 패스로 분리(각 1D는 dt1d). 불투명 픽셀이 하나도 없으면 전부 FAR로 남는다.
 */
function squaredDistanceToOpaque(seed: Float64Array, width: number, height: number): Float64Array {
  const dist = new Float64Array(width * height);
  const maxDim = Math.max(width, height);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  // --- 세로 패스: 각 열에 대해 1D 거리 변환, 결과를 dist에 임시 저장 ---
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = seed[y * width + x]!;
    dt1d(f, d, height, v, z);
    for (let y = 0; y < height; y++) dist[y * width + x] = d[y]!;
  }

  // --- 가로 패스: 세로 결과를 시드로 각 행에 대해 1D 거리 변환 ---
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = dist[row + x]!;
    dt1d(f, d, width, v, z);
    for (let x = 0; x < width; x++) dist[row + x] = d[x]!;
  }

  return dist;
}

// ---------------------------------------------------------------------------
// 적용 — 알파 팽창으로 실루엣 바깥 테두리 칠하기(제자리 변형)
// ---------------------------------------------------------------------------

/**
 * 스티커 테두리 제자리 적용 — 항등(width<=0 또는 opacity<=0)이면 no-op.
 *
 * 1) 원본 알파로 시드 맵을 만든다(불투명 픽셀=0, 그 외=FAR).
 * 2) 제곱 유클리드 거리 변환으로 각 픽셀의 "가장 가까운 불투명 픽셀까지 거리^2"를 구한다.
 * 3) 투명/반투명 픽셀(alpha<128) 중 dist<=width인 픽셀을 outline color로 칠하고
 *    alpha=round(255*opacity/100)로 만든다(실루엣 바깥 테두리).
 *
 * 불투명 픽셀(원본 실루엣)의 r/g/b·alpha는 절대 건드리지 않는다(알파·색 보존).
 * width가 커도 거리 변환이 선형이라 비용이 합리적이다.
 */
export function applyOutline(img: StudioImageDataLike, o: Outline): void {
  if (isIdentityOutline(o)) return;
  const { data, width, height } = img;
  if (!(width > 0) || !(height > 0)) return;

  const { r, g, b } = hexToRgb(o.color);
  const ringAlpha = Math.round((255 * o.opacity) / 100);
  // 두께 비교는 제곱 거리로(루트 회피). width는 px 두께 그대로 반경.
  const maxDistSq = o.width * o.width;

  // 1) 시드: 불투명 픽셀이면 비용 0, 아니면 FAR.
  const count = width * height;
  const seed = new Float64Array(count);
  let hasOpaque = false;
  for (let p = 0; p < count; p++) {
    if (data[p * 4 + 3]! >= ALPHA_OPAQUE) {
      seed[p] = 0;
      hasOpaque = true;
    } else {
      seed[p] = FAR;
    }
  }
  // 불투명 픽셀이 전혀 없으면 자랄 실루엣이 없어 테두리도 없다.
  if (!hasOpaque) return;

  // 2) 거리 변환.
  const distSq = squaredDistanceToOpaque(seed, width, height);

  // 3) 투명 픽셀 중 반경 안인 것만 테두리 색으로 채운다(불투명 원본은 건너뜀).
  for (let p = 0; p < count; p++) {
    const a = p * 4;
    if (data[a + 3]! >= ALPHA_OPAQUE) continue; // 원본 실루엣 보존
    if (distSq[p]! > maxDistSq) continue; // 반경 밖
    data[a] = r;
    data[a + 1] = g;
    data[a + 2] = b;
    data[a + 3] = ringAlpha;
  }
}

// ---------------------------------------------------------------------------
// 스티커 테두리 프리셋 — 첫 항목은 항등(없음), 나머지는 자주 쓰는 테두리.
// 모든 value는 normalizeOutline을 통과(색 #rrggbb, width 0..30, opacity 0..100).
// ---------------------------------------------------------------------------

export type OutlinePreset = { id: string; label: string; tip: string; value: Outline };

export const OUTLINE_PRESETS: OutlinePreset[] = [
  {
    id: "none",
    label: "없음",
    tip: "테두리를 그리지 않는 원본.",
    value: normalizeOutline(DEFAULT_OUTLINE),
  },
  {
    id: "white",
    label: "흰 테두리",
    tip: "실루엣 바깥을 흰색으로 둘러 스티커처럼 분리합니다.",
    value: normalizeOutline({ color: "#ffffff", width: 8, opacity: 100 }),
  },
  {
    id: "black",
    label: "검정 테두리",
    tip: "검은 윤곽선으로 실루엣을 또렷하게 가둡니다.",
    value: normalizeOutline({ color: "#000000", width: 6, opacity: 100 }),
  },
  {
    id: "thick-white",
    label: "두꺼운 흰",
    tip: "두꺼운 흰 테두리로 배경에서 강하게 띄웁니다.",
    value: normalizeOutline({ color: "#ffffff", width: 14, opacity: 100 }),
  },
  {
    id: "sticker",
    label: "스티커",
    tip: "도톰한 흰 테두리로 다이컷 스티커 느낌을 냅니다.",
    value: normalizeOutline({ color: "#ffffff", width: 10, opacity: 100 }),
  },
  {
    id: "neon",
    label: "네온",
    tip: "밝은 시안 테두리로 빛나는 네온 윤곽을 만듭니다.",
    value: normalizeOutline({ color: "#00e5ff", width: 6, opacity: 100 }),
  },
  {
    id: "pink",
    label: "핑크",
    tip: "선명한 핑크 테두리로 발랄한 포인트를 줍니다.",
    value: normalizeOutline({ color: "#ff4f9a", width: 6, opacity: 100 }),
  },
];

// ---------------------------------------------------------------------------
// Konva 등록용 — StudioPage가 커스텀 필터로 부착.
// attrs는 외부 입력이므로 normalizeOutline로 안전 변환, 항등/무효/width0이면 no-op.
// ---------------------------------------------------------------------------

/**
 * Konva 필터 함수 — node(`this`).attrs에서 outlineColor·outlineWidth·outlineOpacity를 읽어
 * normalizeOutline로 안전 변환 후 applyOutline. 항등(width0/opacity0)이거나 attrs가 비면 no-op.
 */
export function outlineKonvaFilter(this: { attrs?: Record<string, unknown> }, imageData: StudioImageDataLike): void {
  const attrs = this.attrs;
  if (!attrs) return;
  const o = normalizeOutline({
    color: typeof attrs.outlineColor === "string" ? attrs.outlineColor : undefined,
    width: typeof attrs.outlineWidth === "number" ? attrs.outlineWidth : undefined,
    opacity: typeof attrs.outlineOpacity === "number" ? attrs.outlineOpacity : undefined,
  });
  if (isIdentityOutline(o)) return;
  applyOutline(imageData, o);
}

// ---------------------------------------------------------------------------
// 캐시 패딩 — StudioPage가 node.cache({offset})에 쓰는 오프셋(px).
// 테두리가 바깥으로 width만큼 자라므로 그만큼 캔버스를 키워야 잘리지 않는다.
// ---------------------------------------------------------------------------

/** 캐시 오프셋(px) = 활성(테두리가 그려질 때)이면 ceil(width), 항등/무효면 0. */
export function outlineCachePad(o: Outline): number {
  if (isIdentityOutline(o)) return 0;
  return Math.ceil(o.width);
}
