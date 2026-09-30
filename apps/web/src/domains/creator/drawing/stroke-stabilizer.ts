/**
 * stroke-stabilizer.ts
 *
 * 손떨림 보정(스트로크 스태빌라이저) 순수 도메인 모델.
 *
 * 벤치마크:
 * - CSP: Tool Property의 Stabilization (0–100, 클수록 부드러움)
 * - Procreate: StreamLine (0–100%)
 * - ibisPaint: 손떨림 보정 0–10 + v14.1.0 "Stroke Prediction" (레이턴시 예측)
 * - Krita: Basic/Weighted/Pull-string 3모드
 *
 * DOM에 의존하지 않는다. 호출자가 PointerEvent 등에서 x/y/t만 추출해 전달하면
 * 보정된 좌표를 반환한다. 실제 렌더링·이벤트 바인딩은 UI 레이어가 담당한다.
 */

/** 스태빌라이저 입력 샘플 1개 (touch-gestures의 TouchSample과 호환). */
export interface StabilizerSample {
  readonly x: number;
  readonly y: number;
  /** 시각 (ms). performance.now() 기준 상대 시각이면 된다. */
  readonly t: number;
}

/** 보정 모드. "off"는 패스스루(입력 그대로 반환). */
export type StabilizerMode = "off" | "smooth" | "string";

export const STABILIZER_MODES = ["off", "smooth", "string"] as const;

/** 레벨 범위 (CSP 규격 0–100). */
export const STABILIZER_LEVEL_MIN = 0;
export const STABILIZER_LEVEL_MAX = 100;

export interface StabilizerSettings {
  /** 보정 모드. 기본 "smooth". */
  readonly mode: StabilizerMode;
  /** 보정 강도 0–100 (CSP 규격). 범위 밖 값은 정규화 시 클램핑된다. */
  readonly level: number;
  /**
   * 스트로크 예측 시간 (ms, ibisPaint v14.1.0 "Stroke Prediction").
   * 입력 레이턴시를 속도 외삽으로 보상한다. 0이면 비활성. 권장 8–32ms.
   */
  readonly predictionMs: number;
}

/** ibisPaint 0–10 스케일을 CSP식 0–100으로 변환한다. 범위 밖은 클램핑. */
export function ibisPaintStabilizerToLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10)));
}

export interface StabilizerPreset {
  readonly mode: StabilizerMode;
  readonly level: number;
  readonly predictionMs: number;
  readonly label: string;
}

export const STABILIZER_PRESETS: Readonly<Record<string, StabilizerPreset>> =
  Object.freeze({
    none: { mode: "off", level: 0, predictionMs: 0, label: "끄기" },
    light: { mode: "smooth", level: 25, predictionMs: 0, label: "약하게" },
    medium: { mode: "smooth", level: 55, predictionMs: 12, label: "보통" },
    heavy: { mode: "smooth", level: 85, predictionMs: 16, label: "강하게" },
    string: { mode: "string", level: 60, predictionMs: 0, label: "끈 (라인아트)" },
  });

export function normalizeStabilizerSettings(
  input: Partial<StabilizerSettings> | null | undefined,
): StabilizerSettings {
  const mode: StabilizerMode = STABILIZER_MODES.includes(
    input?.mode as StabilizerMode,
  )
    ? (input!.mode as StabilizerMode)
    : "smooth";
  const rawLevel = Number(input?.level);
  const level = Number.isFinite(rawLevel)
    ? Math.min(STABILIZER_LEVEL_MAX, Math.max(STABILIZER_LEVEL_MIN, rawLevel))
    : 0;
  const rawPrediction = Number(input?.predictionMs);
  const predictionMs = Number.isFinite(rawPrediction)
    ? Math.min(120, Math.max(0, rawPrediction))
    : 0;
  return { mode, level, predictionMs };
}

/** 레벨 0–100 → One-Euro minCutoff(Hz). 강할수록 낮은 컷오프 = 더 부드러움. */
function levelToMinCutoff(level: number): number {
  return 3.5 - (level / 100) * 3.3; // 100 → 0.2Hz, 0 → 3.5Hz
}

/** 레벨 0–100 → One-Euro beta(속도 적응 계수). 빠른 스트로크일수록 덜 걸러낸다. */
function levelToBeta(level: number): number {
  // px/s 단위 기준. level 100 → 0.004 (2000px/s에서도 컷오프 ≈ 8Hz 유지)
  return (level / 100) * 0.004;
}

/** 레벨 0–100 → 끈 모드의 줄 길이(px). */
function levelToLeashPx(level: number): number {
  return 4 + (level / 100) * 60; // 4px – 64px
}

interface OneEuroState {
  xHat: number;
  dxHat: number;
  lastT: number;
}

function createOneEuroState(x: number, t: number): OneEuroState {
  return { xHat: x, dxHat: 0, lastT: t };
}

/**
 * One-Euro 필터 1축 업데이트 (G. Casiez et al.).
 * 빠르게 움직일 때는 덜 걸러내고, 천천히 움직일 때는 강하게 스무딩한다.
 */
function oneEuroUpdate(
  state: OneEuroState,
  x: number,
  t: number,
  minCutoff: number,
  beta: number,
): number {
  const dt = Math.max(1 / 240, (t - state.lastT) / 1000);
  const dcutoff = 1.0;
  const dx = (x - state.xHat) / dt;
  const aD = 1 / (1 + 1 / (2 * Math.PI * dcutoff * dt));
  const dxHat = aD * dx + (1 - aD) * state.dxHat;
  const cutoff = minCutoff + beta * Math.abs(dxHat);
  const a = 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  const xHat = a * x + (1 - a) * state.xHat;
  state.xHat = xHat;
  state.dxHat = dxHat;
  state.lastT = t;
  return xHat;
}

/**
 * 스트로크 스태빌라이저. 인스턴스 1개 = 1 스트로크.
 * 스트로크 시작 시 `reset()` 후 첫 샘플부터 `push()` 한다.
 */
export class StrokeStabilizer {
  private readonly settings: StabilizerSettings;
  private euroX: OneEuroState | null = null;
  private euroY: OneEuroState | null = null;
  private anchorX = 0;
  private anchorY = 0;
  private hasAnchor = false;
  private lastT = 0;
  private lastOutX = 0;
  private lastOutY = 0;
  private hasOut = false;

  constructor(settings?: Partial<StabilizerSettings>) {
    this.settings = normalizeStabilizerSettings(settings);
  }

  get mode(): StabilizerMode {
    return this.settings.mode;
  }

  get level(): number {
    return this.settings.level;
  }

  /** 스트로크 시작 시 상태를 초기화한다. */
  reset(): void {
    this.euroX = null;
    this.euroY = null;
    this.hasAnchor = false;
    this.hasOut = false;
  }

  /**
   * 새 샘플을 보정해 반환한다.
   * - "off" 또는 level 0 → 입력 그대로 반환
   * - "smooth" → One-Euro 적응형 스무딩 (+ 선택적 스트로크 예측)
   * - "string" → 끈 방식 (앵커가 줄 길이 안에서 목표를 따라옴)
   */
  push(sample: StabilizerSample): { x: number; y: number } {
    const { mode, level, predictionMs } = this.settings;
    if (mode === "off" || level <= 0) {
      this.lastOutX = sample.x;
      this.lastOutY = sample.y;
      this.hasOut = true;
      return { x: sample.x, y: sample.y };
    }

    let outX: number;
    let outY: number;

    if (mode === "string") {
      const leash = levelToLeashPx(level);
      if (!this.hasAnchor) {
        this.anchorX = sample.x;
        this.anchorY = sample.y;
        this.hasAnchor = true;
      }
      const dx = sample.x - this.anchorX;
      const dy = sample.y - this.anchorY;
      const dist = Math.hypot(dx, dy);
      if (dist > leash) {
        const pull = dist - leash;
        this.anchorX += (dx / dist) * pull;
        this.anchorY += (dy / dist) * pull;
      }
      outX = this.anchorX;
      outY = this.anchorY;
    } else {
      const minCutoff = levelToMinCutoff(level);
      const beta = levelToBeta(level);
      if (this.euroX === null || this.euroY === null) {
        this.euroX = createOneEuroState(sample.x, sample.t);
        this.euroY = createOneEuroState(sample.y, sample.t);
        outX = sample.x;
        outY = sample.y;
      } else {
        outX = oneEuroUpdate(this.euroX, sample.x, sample.t, minCutoff, beta);
        outY = oneEuroUpdate(this.euroY, sample.y, sample.t, minCutoff, beta);
      }
    }

    // 스트로크 예측: 속도 외삽으로 입력 레이턴시를 보상한다.
    if (predictionMs > 0 && this.hasOut && mode === "smooth") {
      const dt = Math.max(1, sample.t - this.lastT);
      const vx = (outX - this.lastOutX) / dt;
      const vy = (outY - this.lastOutY) / dt;
      // 과도한 돌출 방지: 예측 거리를 줄 길이의 절반으로 제한
      const maxLead = levelToLeashPx(level) / 2;
      outX += Math.max(-maxLead, Math.min(maxLead, vx * predictionMs));
      outY += Math.max(-maxLead, Math.min(maxLead, vy * predictionMs));
    }

    this.lastT = sample.t;
    this.lastOutX = outX;
    this.lastOutY = outY;
    this.hasOut = true;
    return { x: outX, y: outY };
  }
}
