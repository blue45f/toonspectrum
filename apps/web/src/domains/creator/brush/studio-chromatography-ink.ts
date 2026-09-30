/**
 * 크로마토그래피 잉크 브러시 런타임 모델.
 *
 * 종이 크로마토그래피 현상을 재현한다: 젖은 잉크 방울이 마르며
 * 성분 안료들이 이동도(mobility) 차이에 따라 분리된다.
 * - 이동도가 높은 성분은 바깥으로 멀리 퍼진다
 * - 이동도가 낮은 성분은 중심에 남는다
 * - 마름(dryness)이 진행될수록 분리 폭이 커진다
 *
 * 기존 `dendritic-copper`(가지형 반응 성장)나 `v7-backrun-*`(역행 번짐)와 달리,
 * 이 모듈은 "한 방울 안의 다성분 분리"를 모델링한다.
 *
 * 순수 함수. 렌더러는 dab마다 `resolveStudioChromatographyColor`로 색을 구한다.
 */

export interface StudioChromatographyComponent {
  /** 성분 색 [r, g, b] 0..255 */
  readonly color: readonly [number, number, number];
  /** 이동도 0..1 — 높을수록 바깥으로 멀리 이동 */
  readonly mobility: number;
  /** 성분량 0..1 */
  readonly amount: number;
}

export interface StudioChromatographyInk {
  readonly components: readonly StudioChromatographyComponent[];
  /** 마름에 따른 분리 폭 0..1 */
  readonly separation: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

/** 잉크 정의를 정규화한다. 성분이 없으면 null. */
export function normalizeStudioChromatographyInk(
  components: readonly StudioChromatographyComponent[],
  separation = 0.7,
): StudioChromatographyInk | null {
  const cleaned = components
    .filter((component) => component && Array.isArray(component.color) && component.color.length === 3)
    .map((component) => Object.freeze({
      color: Object.freeze([
        clamp255(component.color[0] ?? 0),
        clamp255(component.color[1] ?? 0),
        clamp255(component.color[2] ?? 0),
      ] as const),
      mobility: clamp01(component.mobility),
      amount: clamp01(component.amount),
    }))
    .filter((component) => component.amount > 0);
  if (cleaned.length === 0) return null;
  return Object.freeze({
    components: Object.freeze(cleaned),
    separation: clamp01(separation),
  });
}

/**
 * 성분의 농도 분포. 각 성분은 `mobility * spread` 반경에 피크를 가진
 * 가우시안으로 퍼진다. 마름이 진행될수록 spread가 커지고(피크 분리),
 * sigma가 좁아져(링이 선명해져) 분리가 커진다.
 *
 * 젖은 상태(dryness≈0)에서는 sigma가 넓어 모든 성분이 섞인 혼합색에 가깝고,
 * 마를수록 각 성분의 링이 분리된다 — 실제 종이 크로마토그래피와 같은 거동이다.
 */
export function studioChromatographyConcentration(
  component: StudioChromatographyComponent,
  radial01: number,
  dryness01: number,
  separation: number,
): number {
  const radial = clamp01(radial01);
  const dryness = clamp01(dryness01);
  const spread = 0.15 + 0.85 * dryness * clamp01(separation);
  const peakRadius = component.mobility * spread;
  // 젖음: 넓게 퍼져 혼합 / 건조: 좁아져 링 분리
  const sigma = 0.35 - 0.2 * dryness * clamp01(separation);
  const distance = radial - peakRadius;
  const gaussian = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  return component.amount * gaussian;
}

/**
 * dab 위치의 최종 색을 구한다. radial01: 0=중심, 1=가장자리.
 * dryness01: 0=젖음, 1=건조.
 */
export function resolveStudioChromatographyColor(
  ink: StudioChromatographyInk,
  radial01: number,
  dryness01: number,
): readonly [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const component of ink.components) {
    const concentration = studioChromatographyConcentration(
      component,
      radial01,
      dryness01,
      ink.separation,
    );
    r += component.color[0] * concentration;
    g += component.color[1] * concentration;
    b += component.color[2] * concentration;
    total += concentration;
  }
  if (total <= 0) return [0, 0, 0] as const;
  return Object.freeze([clamp255(r / total), clamp255(g / total), clamp255(b / total)] as const);
}

/**
 * 검정 잉크가 파랑/빨강 성분으로 분리되는 프리셋 (크로마토그래피 교과서 예시).
 */
export function studioChromatographyInkBlackPreset(
  separation = 0.75,
): StudioChromatographyInk | null {
  return normalizeStudioChromatographyInk(
    [
      { color: [20, 20, 28], mobility: 0.15, amount: 0.5 },
      { color: [37, 99, 235], mobility: 0.55, amount: 0.3 },
      { color: [220, 38, 38], mobility: 0.9, amount: 0.2 },
    ],
    separation,
  );
}

/**
 * 갈색 먹이 황토/먹 성분으로 분리되는 프리셋 (동양화 먹 번짐 응용).
 */
export function studioChromatographyInkSumiPreset(
  separation = 0.65,
): StudioChromatographyInk | null {
  return normalizeStudioChromatographyInk(
    [
      { color: [24, 24, 27], mobility: 0.2, amount: 0.55 },
      { color: [120, 113, 108], mobility: 0.5, amount: 0.25 },
      { color: [180, 160, 130], mobility: 0.85, amount: 0.2 },
    ],
    separation,
  );
}

/** CSS 색 문자열로 변환한다. */
export function studioChromatographyColorToCss(
  color: readonly [number, number, number],
): string {
  return `rgb(${clamp255(color[0])}, ${clamp255(color[1])}, ${clamp255(color[2])})`;
}
