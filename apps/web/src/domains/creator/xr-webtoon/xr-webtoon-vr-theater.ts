/**
 * VR 시어터(대형 스크린 감상) 모델.
 *
 * ComiXR(2026)의 "패널 갤러리" 개념을 차용했다: 웹툰 컷들을 시청자를 중심으로
 * 호(arc) 형태로 배치한 가상 갤러리에서 감상한다. 시선 추적 기반 스포일러 방지
 * 아이디어도 상태 기계로 단순화했다 — 아직 읽지 않은 컷은 흐릿하게 잠겨 있고,
 * 현재 컷에 시선이 머물렀을 때(또는 다음 버튼을 눌렀을 때) 다음 컷이 열린다.
 *
 * 순수 계산 모듈. 실제 WebXR 세션·렌더러에는 의존하지 않는다.
 */

export type XrVrVec3 = readonly [number, number, number];

export interface XrVrPanelPose {
  /** 월드 좌표(m). 시청자는 원점에 서 있다. */
  readonly position: XrVrVec3;
  /** Y축 회전(rad). 시청자를 바라보도록 설정된다. */
  readonly rotationYRad: number;
}

export interface XrVrGalleryOptions {
  /** 컷 수. */
  readonly panelCount: number;
  /** 갤러리 반경(m). 기본 3. */
  readonly radiusM?: number;
  /** 호 각도(deg). 기본 120. */
  readonly arcDeg?: number;
  /** 눈높이(m). 기본 1.6. */
  readonly eyeHeightM?: number;
}

export type XrVrPanelReveal = "locked" | "current" | "read";

export interface XrVrReadingState {
  readonly total: number;
  /** 현재 읽는 중인 컷 인덱스. */
  readonly currentIndex: number;
}

/** 시청 거리 프리셋(m). 가까울수록 자막 가독성이 올라간다. */
export const XR_VR_COMFORT_DISTANCES_M = Object.freeze({
  near: 2.2,
  standard: 3.0,
  far: 4.2,
} as const);
export type XrVrComfortDistance = keyof typeof XR_VR_COMFORT_DISTANCES_M;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * 컷들을 시청자 중심 호 형태로 배치한다. 인덱스 0이 정면, 이후 좌우로 펼쳐진다.
 */
export function xrVrGalleryLayout(options: XrVrGalleryOptions): readonly XrVrPanelPose[] {
  const count = clampInt(options.panelCount, 0, 64);
  if (count === 0) return [];
  const radiusM = options.radiusM && options.radiusM > 0 ? options.radiusM : 3;
  const eyeHeightM = options.eyeHeightM && options.eyeHeightM > 0 ? options.eyeHeightM : 1.6;
  const arcDeg = options.arcDeg && options.arcDeg > 0 ? Math.min(300, options.arcDeg) : 120;

  const poses: XrVrPanelPose[] = [];
  for (let i = 0; i < count; i += 1) {
    // 정면을 0도로, 좌우 대칭으로 펼친다.
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angleRad = t * ((arcDeg * Math.PI) / 180);
    const x = Math.sin(angleRad) * radiusM;
    const z = -Math.cos(angleRad) * radiusM;
    poses.push({
      position: [x, eyeHeightM, z],
      // 패널 법선이 원점(시청자)을 향하도록.
      rotationYRad: angleRad,
    });
  }
  return poses;
}

/**
 * 읽기 진행 상태로부터 컷별 공개 상태를 계산한다.
 * current 이전은 읽음, current는 현재, 이후는 잠김(스포일러 방지).
 */
export function xrVrPanelReveals(state: XrVrReadingState): readonly XrVrPanelReveal[] {
  const total = clampInt(state.total, 0, 64);
  const current = clampInt(state.currentIndex, 0, Math.max(0, total - 1));
  const reveals: XrVrPanelReveal[] = [];
  for (let i = 0; i < total; i += 1) {
    reveals.push(i < current ? "read" : i === current ? "current" : "locked");
  }
  return reveals;
}

export function xrVrReadingStart(total: number): XrVrReadingState {
  return { total: clampInt(total, 0, 64), currentIndex: 0 };
}

/** 다음 컷으로 이동. 마지막에서는 그대로. */
export function xrVrReadingAdvance(state: XrVrReadingState): XrVrReadingState {
  const total = clampInt(state.total, 0, 64);
  if (total === 0) return { total: 0, currentIndex: 0 };
  return { total, currentIndex: Math.min(total - 1, clampInt(state.currentIndex, 0, total - 1) + 1) };
}

/** 이전 컷으로 이동. 처음에서는 그대로. */
export function xrVrReadingBack(state: XrVrReadingState): XrVrReadingState {
  const total = clampInt(state.total, 0, 64);
  if (total === 0) return { total: 0, currentIndex: 0 };
  return { total, currentIndex: Math.max(0, clampInt(state.currentIndex, 0, total - 1) - 1) };
}

/** 특정 컷으로 점프. 범위를 벗어나면 클램프. */
export function xrVrReadingJump(state: XrVrReadingState, index: number): XrVrReadingState {
  const total = clampInt(state.total, 0, 64);
  if (total === 0) return { total: 0, currentIndex: 0 };
  return { total, currentIndex: clampInt(index, 0, total - 1) };
}

/** 전체 진행률 0..1. */
export function xrVrReadingProgress(state: XrVrReadingState): number {
  const total = clampInt(state.total, 0, 64);
  if (total <= 1) return total === 0 ? 0 : 1;
  return clampInt(state.currentIndex, 0, total - 1) / (total - 1);
}
