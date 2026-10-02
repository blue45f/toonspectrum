/**
 * 가상 공간 주야 사이클 (24시간 가상 시계 → 환경 광원)
 *
 * - 소유권: 페이지는 가상 시계를 소유하고 1초마다 `now`를 캔버스에 전달한다.
 *   (`setDayNightCycle({ ...getDayNightCycle(), now })`)
 * - 이 모듈은 순수 계산만 한다: 가상 시각 → 24시간 주기로 보간한 환경광(ambient).
 * - 실제 틴트 렌더링(전역 조명 오버레이)은 트랙3 캔버스가, 고급 포스트이펙트는
 *   트랙1 조명 렌더러가 담당한다.
 */

/** 하루 한 바퀴 (ms). */
export const STUDIO_DAY_NIGHT_CYCLE_MS = 24 * 60 * 60 * 1000;

/** 가상 시각 시계열 키프레임 (0~1 = 하루 중 비율). */
interface DayNightKeyframe {
  readonly at: number;
  /** 환경광 밝기 0~1. */
  readonly ambient: number;
  /** 틴트 색상 (16진). */
  readonly tint: number;
}

const DAY_NIGHT_KEYFRAMES: readonly DayNightKeyframe[] = [
  { at: 0.00, ambient: 0.25, tint: 0x1a2350 }, // 자정: 깊게 파란 밤
  { at: 0.20, ambient: 0.30, tint: 0x2a3560 }, // 새벽 전
  { at: 0.25, ambient: 0.55, tint: 0xd98a5a }, // 일출: 주황
  { at: 0.30, ambient: 0.85, tint: 0xfff3d6 }, // 아침
  { at: 0.50, ambient: 1.00, tint: 0xffffff }, // 정오
  { at: 0.70, ambient: 0.85, tint: 0xfff3d6 }, // 오후
  { at: 0.75, ambient: 0.50, tint: 0xe07a4f }, // 일몰: 진한 주황
  { at: 0.80, ambient: 0.30, tint: 0x2a3560 }, // 밤 진입
  { at: 1.00, ambient: 0.25, tint: 0x1a2350 }, // 자정
];

export interface StudioDayNightAmbient {
  /** 0~1 하루 중 비율. */
  readonly timeOfDay: number;
  /** 환경광 밝기 0~1. */
  readonly ambient: number;
  /** 틴트 색상 (16진). */
  readonly tint: number;
}

/** 가상 시계(ms)를 0~1 비율로 정규화. */
export function studioDayNightTimeOfDay(nowMs: number, startMs: number, cycleMs: number = STUDIO_DAY_NIGHT_CYCLE_MS): number {
  const cycle = Number.isFinite(cycleMs) && cycleMs > 0 ? cycleMs : STUDIO_DAY_NIGHT_CYCLE_MS;
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const safeStart = Number.isFinite(startMs) ? startMs : 0;
  const ratio = ((safeNow - safeStart) % cycle + cycle) % cycle / cycle;
  return ratio;
}

/** 비율 → 키프레임 선형 보간으로 환경광 계산. */
export function studioDayNightAmbientAt(timeOfDay: number): StudioDayNightAmbient {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(timeOfDay) ? timeOfDay : 0));
  let prev = DAY_NIGHT_KEYFRAMES[0]!;
  let next = DAY_NIGHT_KEYFRAMES[DAY_NIGHT_KEYFRAMES.length - 1]!;
  for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length; i += 1) {
    const frame = DAY_NIGHT_KEYFRAMES[i]!;
    if (frame.at <= clamped) prev = frame;
    if (frame.at >= clamped) { next = frame; break; }
  }
  const span = next.at - prev.at;
  const t = span <= 0 ? 0 : (clamped - prev.at) / span;
  return {
    timeOfDay: clamped,
    ambient: prev.ambient + (next.ambient - prev.ambient) * t,
    tint: lerpTint(prev.tint, next.tint, t),
  };
}

function lerpTint(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

/** 밝기 → Phaser 전역 tint 오버레이 알파 (어두울수록 진해짐). */
export function studioDayNightTintAlpha(ambient: number): number {
  const safe = Math.min(1, Math.max(0, Number.isFinite(ambient) ? ambient : 1));
  return Math.round((1 - safe) * 0.55 * 1000) / 1000;
}

/** 하루 중 이름 (UI 라벨용). */
export function studioDayNightName(timeOfDay: number): { readonly ko: string; readonly en: string } {
  const hour = Math.floor(timeOfDay * 24);
  if (hour >= 5 && hour < 8) return { ko: "새벽", en: "Dawn" };
  if (hour >= 8 && hour < 12) return { ko: "아침", en: "Morning" };
  if (hour >= 12 && hour < 17) return { ko: "낮", en: "Day" };
  if (hour >= 17 && hour < 20) return { ko: "해질녘", en: "Dusk" };
  return { ko: "밤", en: "Night" };
}
