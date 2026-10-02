/**
 * 음성 연동 립싱크 (T1-3)
 *
 * 마이크/피어 오디오 레벨(RMS 0~1)을 아바타 입 모양 3단계로 바꾼다.
 * Spatial식 실시간 표정까지는 아니어도, 누가 말하는지 입 모양만으로
 * 알 수 있게 해 "살아있는 공간" 체감을 만드는 것이 목적이다.
 *
 * - 순수 로직 모듈. 실제 AnalyserNode 측정은 호출 측이 담당하고,
 *   여기에는 정규화된 레벨 스냅샷만 들어온다.
 * - 상태는 immutable. 호출 측은 피어별로 상태를 보관하며 매 틱 advance 한다.
 * - 어택은 즉시(말하기 시작하면 바로 입이 열리고), 릴리스는 반감기
 *   120ms로 감쇠해 말이 끝난 뒤에도 입이 잠깐 머물다 닫힌다.
 * - 발화 중 낮은 레벨에서는 85ms 위상으로 open↔closed를 번갈아
 *   2프레임 립 플랩을 만든다. reduced motion이면 플랩 없이 고정한다.
 *
 * === 렌더러 소비 API ===
 * - 2D 미리보기/음성 패널: `advanceStudioLipsync`의 mouth를 그대로 쓴다.
 * - Phaser 캔버스가 피어 레벨을 받게 되면, 같은 mouth를 캐릭터 시트의
 *   talk 행 프레임 선택에 연결하면 된다 (closed=닫힌 입, open/wide=벌린 입).
 */

/** 입 모양 3단계. */
export type StudioLipsyncMouth = "closed" | "open" | "wide";

export const STUDIO_LIPSYNC_MOUTHS: readonly StudioLipsyncMouth[] = Object.freeze(["closed", "open", "wide"]);

/** 이 레벨 이상이면 말하는 중이다. 발화자 링 임계값(0.15)보다 낮게 잡아 작은 목소리에도 입이 움직인다. */
export const STUDIO_LIPSYNC_SPEAKING_THRESHOLD = 0.06;

/** 이 레벨 이상이면 입을 크게 벌린다. */
export const STUDIO_LIPSYNC_WIDE_THRESHOLD = 0.5;

/** 릴리스 반감기(ms). 말이 끝나고 입이 닫히기까지의 여유. */
export const STUDIO_LIPSYNC_RELEASE_HALF_LIFE_MS = 120;

/** 립 플랩 위상 간격(ms). */
export const STUDIO_LIPSYNC_FLAP_MS = 85;

/** 레벨 샘플이 이보다 오래되면 발화로 취급하지 않는다(ms). */
export const STUDIO_LIPSYNC_STALE_MS = 1_000;

export interface StudioLipsyncState {
  /** 감쇠가 적용된 현재 레벨 (0~1). */
  readonly smoothed: number;
  /** 마지막으로 advance한 시각(ms). */
  readonly updatedAt: number;
}

export interface StudioLipsyncSample {
  readonly state: StudioLipsyncState;
  readonly mouth: StudioLipsyncMouth;
  readonly speaking: boolean;
  /** smoothing된 레벨 (0~1). UI 강도 표시에 재사용할 수 있다. */
  readonly level: number;
}

const INITIAL: StudioLipsyncState = Object.freeze({ smoothed: 0, updatedAt: 0 });

/** 피어별 립싱크 상태 초기값. */
export function createStudioLipsyncState(): StudioLipsyncState {
  return INITIAL;
}

function safeLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function mouthFor(smoothed: number, nowMs: number, reducedMotion: boolean): StudioLipsyncMouth {
  if (smoothed < STUDIO_LIPSYNC_SPEAKING_THRESHOLD) return "closed";
  if (smoothed >= STUDIO_LIPSYNC_WIDE_THRESHOLD) return "wide";
  if (reducedMotion) return "open";
  return Math.floor(nowMs / STUDIO_LIPSYNC_FLAP_MS) % 2 === 0 ? "open" : "closed";
}

/**
 * 레벨 샘플 하나로 립싱크를 전진시킨다.
 * `sampledAt`이 주어지면 오래된(1초 초과) 샘플은 조용함으로 취급한다.
 */
export function advanceStudioLipsync(
  previous: StudioLipsyncState,
  rawLevel: number,
  nowMs: number,
  options: { readonly reducedMotion?: boolean; readonly sampledAt?: number } = {},
): StudioLipsyncSample {
  const now = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  const stale = options.sampledAt !== undefined && Number.isFinite(options.sampledAt) && now - options.sampledAt > STUDIO_LIPSYNC_STALE_MS;
  const level = stale ? 0 : safeLevel(rawLevel);
  const dt = Math.max(0, Math.min(250, now - previous.updatedAt));
  const decayed = previous.smoothed * Math.pow(0.5, dt / STUDIO_LIPSYNC_RELEASE_HALF_LIFE_MS);
  const smoothed = Math.max(level, decayed);
  const state: StudioLipsyncState = Object.freeze({ smoothed, updatedAt: now });
  return Object.freeze({
    state,
    mouth: mouthFor(smoothed, now, options.reducedMotion ?? false),
    speaking: smoothed >= STUDIO_LIPSYNC_SPEAKING_THRESHOLD,
    level: smoothed,
  });
}

/**
 * 상태 없이 강도(0~1, 발화자 링 정규화 값)만으로 입 모양을 구하는 단발 헬퍼.
 * HUD 아바타처럼 이전 프레임을 보관하기 어려운 곳에서 쓴다.
 */
export function studioLipsyncMouthForIntensity(
  intensity: number,
  nowMs: number,
  reducedMotion = false,
): StudioLipsyncMouth {
  const safe = safeLevel(intensity);
  if (safe <= 0) return "closed";
  // 링 강도 0~1을 립싱크 레벨 구간으로 되돌린다 (임계값 위 구간만 들어온다).
  const level = STUDIO_LIPSYNC_SPEAKING_THRESHOLD + safe * (1 - STUDIO_LIPSYNC_SPEAKING_THRESHOLD);
  return mouthFor(level, Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0, reducedMotion);
}
