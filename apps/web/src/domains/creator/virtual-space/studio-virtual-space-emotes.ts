/**
 * 스튜디오 이모트 시스템 (Gather Town식 감정 표현)
 *
 * Gather Town의 Z키 춤추기·이모트 휠에서 착안한 캐릭터 감정 표현:
 * - 단축키(숫자·Z)로 즉시 실행, 이모트 바 UI에서도 선택
 * - 루프형(춤·수면)과 단발형(박수·인사) 구분
 * - reduced-motion에서는 정적 포즈로 대체하거나 생략
 *
 * 순수 로직 모듈. 실제 스프라이트 렌더링·키 바인딩은 호출 측에서 담당한다.
 */

/** 이모트 종류. */
export type StudioEmoteKind =
  | "wave"       // 손 흔들기
  | "dance"      // 춤추기 (Gather Z키)
  | "clap"       // 박수
  | "cheer"      // 환호
  | "sit"        // 앉기
  | "sleep"      // 잠자기
  | "think"      // 생각하기
  | "laugh"      // 크게 웃기
  | "bow"        // 정중히 인사
  | "celebrate"; // 축하 (꽃가루)

export interface StudioEmoteDefinition {
  readonly kind: StudioEmoteKind;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 표시용 이모지. */
  readonly icon: string;
  /** 단축키 (null이면 단축키 없음). */
  readonly shortcut: string | null;
  /** 루프 여부. false면 duration 후 자동 종료. */
  readonly loop: boolean;
  /** 단발형 지속 시간(ms). 루프형은 Infinity. */
  readonly durationMs: number;
  /** 이동 중에도 가능한지. */
  readonly allowedWhileMoving: boolean;
}

function emote(def: StudioEmoteDefinition): StudioEmoteDefinition {
  return Object.freeze(def);
}

/** 전체 이모트 정의. 순서는 이모트 바 표시 순서. */
export const STUDIO_EMOTES: readonly StudioEmoteDefinition[] = Object.freeze([
  emote({ kind: "wave", labelKo: "손 흔들기", labelEn: "Wave", icon: "👋", shortcut: "1", loop: false, durationMs: 1_800, allowedWhileMoving: false }),
  emote({ kind: "dance", labelKo: "춤추기", labelEn: "Dance", icon: "💃", shortcut: "Z", loop: true, durationMs: Infinity, allowedWhileMoving: false }),
  emote({ kind: "clap", labelKo: "박수", labelEn: "Clap", icon: "👏", shortcut: "2", loop: false, durationMs: 2_000, allowedWhileMoving: true }),
  emote({ kind: "cheer", labelKo: "환호", labelEn: "Cheer", icon: "🙌", shortcut: "3", loop: false, durationMs: 2_400, allowedWhileMoving: false }),
  emote({ kind: "laugh", labelKo: "크게 웃기", labelEn: "Laugh", icon: "😂", shortcut: "4", loop: false, durationMs: 2_200, allowedWhileMoving: false }),
  emote({ kind: "bow", labelKo: "정중히 인사", labelEn: "Bow", icon: "🙇", shortcut: "5", loop: false, durationMs: 1_600, allowedWhileMoving: false }),
  emote({ kind: "think", labelKo: "생각하기", labelEn: "Think", icon: "🤔", shortcut: "6", loop: true, durationMs: Infinity, allowedWhileMoving: false }),
  emote({ kind: "sit", labelKo: "바닥에 앉기", labelEn: "Sit down", icon: "🧘", shortcut: "7", loop: true, durationMs: Infinity, allowedWhileMoving: false }),
  emote({ kind: "sleep", labelKo: "잠자기", labelEn: "Sleep", icon: "😴", shortcut: "8", loop: true, durationMs: Infinity, allowedWhileMoving: false }),
  emote({ kind: "celebrate", labelKo: "축하하기", labelEn: "Celebrate", icon: "🎉", shortcut: "9", loop: false, durationMs: 3_000, allowedWhileMoving: true }),
]);

const EMOTE_BY_KIND = new Map<StudioEmoteKind, StudioEmoteDefinition>(
  STUDIO_EMOTES.map((definition) => [definition.kind, definition]),
);
const EMOTE_BY_SHORTCUT = new Map<string, StudioEmoteDefinition>(
  STUDIO_EMOTES.filter((definition) => definition.shortcut !== null)
    .map((definition) => [definition.shortcut as string, definition]),
);

export function studioEmoteDefinition(kind: StudioEmoteKind): StudioEmoteDefinition | null {
  return EMOTE_BY_KIND.get(kind) ?? null;
}

export function studioEmoteByShortcut(shortcut: string): StudioEmoteDefinition | null {
  return EMOTE_BY_SHORTCUT.get(shortcut.toUpperCase()) ?? null;
}

/** 이모트 실행 상태. */
export interface StudioEmoteState {
  /** 실행 중인 이모트 (null이면 평상시). */
  readonly active: StudioEmoteKind | null;
  readonly startedAt: number;
  readonly lastTime: number;
}

export const IDLE_EMOTE_STATE: StudioEmoteState = Object.freeze({
  active: null, startedAt: 0, lastTime: 0,
});

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 이모트를 시작한다.
 * - 이미 같은 이모트 실행 중이면 토글 종료 (루프형)
 * - 이동 중 허용되지 않은 이모트는 moving=true일 때 무시
 * - reducedMotion이면 루프형 이모트는 시작하지 않음 (정적 포즈는 표현 레이어에서 처리)
 */
export function startStudioEmote(
  previous: StudioEmoteState | null,
  input: {
    readonly kind: StudioEmoteKind;
    readonly time: number;
    readonly moving: boolean;
    readonly reducedMotion: boolean;
  },
): StudioEmoteState {
  const time = safeTime(input.time);
  const definition = studioEmoteDefinition(input.kind);
  if (!definition) return previous ?? IDLE_EMOTE_STATE;
  const current = previous && time >= previous.lastTime ? previous : IDLE_EMOTE_STATE;
  // 같은 이모트 토글 종료
  if (current.active === input.kind) {
    return Object.freeze({ active: null, startedAt: time, lastTime: time });
  }
  if (input.moving && !definition.allowedWhileMoving) return current;
  if (input.reducedMotion && definition.loop) return current;
  return Object.freeze({ active: input.kind, startedAt: time, lastTime: time });
}

/**
 * 시간 경과에 따라 단발형 이모트를 자동 종료한다.
 * 이동 시작 시 이동 불가 이모트도 종료한다.
 */
export function stepStudioEmote(
  previous: StudioEmoteState | null,
  input: { readonly time: number; readonly moving: boolean },
): StudioEmoteState {
  const time = safeTime(input.time);
  const current = previous && time >= previous.lastTime ? previous : IDLE_EMOTE_STATE;
  if (current.active === null) return current;
  const definition = studioEmoteDefinition(current.active);
  if (!definition) return Object.freeze({ active: null, startedAt: time, lastTime: time });
  if (input.moving && !definition.allowedWhileMoving) {
    return Object.freeze({ active: null, startedAt: time, lastTime: time });
  }
  if (!definition.loop && time - current.startedAt >= definition.durationMs) {
    return Object.freeze({ active: null, startedAt: time, lastTime: time });
  }
  return Object.freeze({ ...current, lastTime: time });
}

/** 이모트 강제 종료 (다른 행동 시작 시). */
export function stopStudioEmote(state: StudioEmoteState | null, time: number): StudioEmoteState {
  const safe = safeTime(time);
  return Object.freeze({ active: null, startedAt: safe, lastTime: safe });
}

/** 단축키 입력 → 이모트 kind (매칭 없으면 null). 대소문자 무시. */
export function studioEmoteKindForKey(key: string): StudioEmoteKind | null {
  if (key.length !== 1) return null;
  return studioEmoteByShortcut(key)?.kind ?? null;
}

/* ---------------- 렌더 힌트 (B 트랙 캔버스 렌더러 계약) ---------------- */

/**
 * 이모트별 스프라이트 렌더 힌트.
 *
 * B 트랙(Phaser 캔버스)이 이모트 실행 중 캐릭터에 적용하는 시각 효과 데이터다.
 * 실제 스프라이트 합성·파티클 렌더링은 호출 측이 담당하고, 이 모듈은
 * 이모트 정의와 1:1로 매칭되는 선언적 힌트만 제공한다.
 */
export type StudioEmoteArmPose =
  | "neutral" // 기본 팔
  | "wave"    // 손 흔들기 (wave)
  | "clap"    // 박수 (clap)
  | "raised"  // 만세 (cheer, celebrate)
  | "chin"    // 턱 괴기 (think)
  | "bowed";  // 숙이기 (bow)

export type StudioEmoteParticle =
  | "confetti" // 축하 폭죽 (celebrate)
  | "music"    // 음표 (dance)
  | "zzz"      // 수면 "Zzz" (sleep)
  | "sweat"    // 고민 땀방울 (think)
  | "sparkle"  // 반짝임 (wave, laugh)
  | "hearts";  // 하트 (cheer)

export interface StudioEmoteRenderHint {
  /** y 오프셋(px). 음수면 위로 뜬다 (dance 바운스·cheer 점프). */
  readonly bobOffset?: number;
  readonly armPose?: StudioEmoteArmPose;
  readonly particle?: StudioEmoteParticle;
}

function renderHint(hint: StudioEmoteRenderHint): StudioEmoteRenderHint {
  return Object.freeze(hint);
}

/** 10종 이모트 각각의 렌더 힌트. 순서는 STUDIO_EMOTES와 무관하게 kind 키로 조회한다. */
const EMOTE_RENDER_HINTS: Readonly<Record<StudioEmoteKind, StudioEmoteRenderHint>> = Object.freeze({
  wave: renderHint({ armPose: "wave", particle: "sparkle" }),
  dance: renderHint({ bobOffset: -6, particle: "music" }),
  clap: renderHint({ armPose: "clap" }),
  cheer: renderHint({ armPose: "raised", bobOffset: -8, particle: "hearts" }),
  laugh: renderHint({ bobOffset: -4, particle: "sparkle" }),
  bow: renderHint({ armPose: "bowed", bobOffset: 6 }),
  think: renderHint({ armPose: "chin", particle: "sweat" }),
  sit: renderHint({ bobOffset: 10 }),
  sleep: renderHint({ bobOffset: 4, particle: "zzz" }),
  celebrate: renderHint({ armPose: "raised", bobOffset: -6, particle: "confetti" }),
});

/**
 * 이모트 kind → 렌더 힌트. 정의되지 않은 kind(타입 밖 입력)에는 빈 힌트를 돌려준다.
 * B 트랙은 `hint.bobOffset`을 스프라이트 y에, `armPose`를 팔 포즈 분기에,
 * `particle`을 머리 위 파티클 스포너에 연결한다.
 */
export function studioEmoteRenderHint(kind: StudioEmoteKind): StudioEmoteRenderHint {
  return EMOTE_RENDER_HINTS[kind] ?? renderHint({});
}
