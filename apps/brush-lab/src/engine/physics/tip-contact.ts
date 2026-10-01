/**
 * 탄성 팁 접촉(Hertz 구-평면 접촉의 무차원화) + 펠트 포화 + 비대칭 1차 지연(히스테리시스).
 * 상태는 Float32Array에 두고 매 틱 `Math.fround`로 f32 경계에 맞춘다.
 */

const f = Math.fround;

export interface TipContactSpec {
  /** 기준 반경 r0(px). */
  baseRadius: number;
  /** Hertz 지수 n(반경 ∝ p^(1/n)). */
  exponent: number;
  /** 기준 압력 p0(이 압력에서 r = r0). */
  p0: number;
  /** 펠트 계수 k. */
  feltK: number;
  hysteresisUpMs: number;
  hysteresisDownMs: number;
  model: "hertz" | "felt";
}

export interface TipContactState {
  /** [0] 현재 반경(px), [1] 초기화 플래그. */
  data: Float32Array;
}

/** Hertz: r0·(max(p, 1e-3)/p0)^(1/n). p0 = 1이면 p = 0.125, n = 3에서 r0/2. */
export function hertzRadius(p: number, r0: number, p0 = 0.5, n = 3): number {
  const pp = Math.max(p, 1e-3);
  return f(r0 * Math.pow(pp / p0, 1 / n));
}

/** 펠트 포화: r0·(1 + k·p)/(1 + k). p = 1에서 r0, p = 0에서 r0/(1 + k). */
export function feltRadius(p: number, r0: number, k = 1.5): number {
  const pp = p < 0 ? 0 : p > 1 ? 1 : p;
  return f((r0 * (1 + k * pp)) / (1 + k));
}

/**
 * 비대칭 1차 지연. 상승(target > r)은 tauUp, 하강은 tauDown.
 * r += (target − r)·(1 − exp(−dt/τ)). 반환은 갱신된 반경.
 */
export function applyHysteresis(
  state: TipContactState,
  target: number,
  dtMs: number,
  tauUpMs = 12,
  tauDownMs = 40,
): number {
  const d = state.data;
  if ((d[1] ?? 0) === 0) {
    d[0] = f(target);
    d[1] = 1;
    return d[0] ?? 0;
  }
  const r = d[0] ?? 0;
  const tau = target > r ? tauUpMs : tauDownMs;
  const alpha = tau > 0 ? 1 - Math.exp(-dtMs / tau) : 1;
  const next = f(r + (target - r) * alpha);
  d[0] = next;
  return next;
}

export function createTipContactState(): TipContactState {
  return { data: new Float32Array(2) };
}

/** 1틱 전진. 출력 rx = ry = 히스테리시스 적용 반경. */
export function stepTipContact(
  state: TipContactState,
  sample: { pressure: number },
  dtMs: number,
  spec: TipContactSpec,
): { rx: number; ry: number } {
  const target =
    spec.model === "felt"
      ? feltRadius(sample.pressure, spec.baseRadius, spec.feltK)
      : hertzRadius(sample.pressure, spec.baseRadius, spec.p0, spec.exponent);
  const r = applyHysteresis(state, target, dtMs, spec.hysteresisUpMs, spec.hysteresisDownMs);
  return { rx: r, ry: r };
}
