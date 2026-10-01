import { studioSpaceEmoteById, type StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import { spriteDirectionToFacing, type StudioSpriteDirection } from "./studio-virtual-space-sprite";
import {
  spriteSheetCell,
  spriteSheetIdleCell,
  spriteSheetPreviewFrame,
  spriteSheetWalkFrameCount,
  type StudioSpriteSheetConfig,
} from "./studio-virtual-space-sprite-sheet";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 캐릭터 모션·감정 시스템 (트랙1 소유: 모션 데이터·블렌딩·렌더링)
 *
 * `studio-virtual-space-motion.ts`(물리 이동: 속도·가감속, 트랙3 소유)와 구분되는
 * 캐릭터 애니메이션 모듈이다.
 *
 * - 감정(Emotion): 기쁨·슬픔·놀람·수면·집중 등 얼굴 표정 변형. presence의
 *   Emote/userStatus와 연동된다 (`resolveAvatarEmotion`).
 * - 모션(Motion): 걷기·뛰기·점프·앉기·눕기·인사·손흔들기·박수·춤·일하기 등
 *   몸 동작. 상태머신이 전이·블렌딩을 맡는다.
 * - 커스텀 스프라이트 시트에는 모션 전용 행이 없으므로, 모든 모션은 시트의
 *   걷기 사이클/정지 프레임에 매핑 + 렌더 변형(bob·기울기·회전)으로 표현한다.
 *   프로시저럴 폴백도 같은 매핑을 쓴다.
 *
 * === 트랙3(이동) 소비 API ===
 * 트랙3은 "언제 어떤 모션으로 전이할지(물리/입력)"를 소유한다. 이 모듈이 제공하는 API:
 * - `createMotionStateMachine(initial, now)` — 장면당 하나의 머신을 만든다.
 * - `requestMotionState(machine, kind, now)` — 물리/입력에서 뽑은 모션을 요청한다.
 *   같은 kind면 머신을 그대로 돌려준다. 새 객체(immutable)를 반환한다.
 * - `sampleMotionRender(machine, now)` — 렌더 샘플(오프셋·회전·스케일·블렌딩).
 * - `motionOneShotFinished(machine, now)` — 점프·인사 같은 단발 모션 종료 여부.
 * - `sampleCustomSheetMotionCell(config, machine, direction, now, reducedMotion)`
 *   — 2D 미리보기/폴백용 셀 샘플.
 * - `motionKindToLegacyState(kind)` — 기존 스킨 파이프라인용 매핑.
 * - `resolveAvatarEmotion(...)` — presence → 감정.
 * 트랙1이 렌더링(Phaser 오버레이·2D 미리보기)을, 트랙3이 전이 결정을 맡는다. 중복 구현 금지.
 */

/* ---------------- 감정 ---------------- */

export type StudioEmotionKind = "neutral" | "joy" | "sadness" | "surprise" | "sleep" | "focus";

export const STUDIO_EMOTION_KINDS: readonly StudioEmotionKind[] = Object.freeze([
  "neutral", "joy", "sadness", "surprise", "sleep", "focus",
]);

export const STUDIO_EMOTION_LABELS: Readonly<Record<StudioEmotionKind, { readonly ko: string; readonly en: string }>> = Object.freeze({
  neutral: { ko: "평온", en: "Neutral" },
  joy: { ko: "기쁨", en: "Joy" },
  sadness: { ko: "슬픔", en: "Sadness" },
  surprise: { ko: "놀람", en: "Surprise" },
  sleep: { ko: "수면", en: "Sleep" },
  focus: { ko: "집중", en: "Focus" },
});

/** 프로시저럴 얼굴 표정 변형 데이터. */
export interface StudioEmotionFace {
  readonly eyes: "open" | "joyful" | "sad" | "surprised" | "closed" | "focused";
  readonly mouth: "smile" | "grin" | "frown" | "open" | "flat" | "sleepy";
  readonly blush: boolean;
  readonly tear: boolean;
  readonly sweat: boolean;
  readonly zzz: boolean;
}

export function studioEmotionFace(emotion: StudioEmotionKind): StudioEmotionFace {
  switch (emotion) {
    case "joy":
      return Object.freeze({ eyes: "joyful", mouth: "grin", blush: true, tear: false, sweat: false, zzz: false });
    case "sadness":
      return Object.freeze({ eyes: "sad", mouth: "frown", blush: false, tear: true, sweat: false, zzz: false });
    case "surprise":
      return Object.freeze({ eyes: "surprised", mouth: "open", blush: false, tear: false, sweat: true, zzz: false });
    case "sleep":
      return Object.freeze({ eyes: "closed", mouth: "sleepy", blush: false, tear: false, sweat: false, zzz: true });
    case "focus":
      return Object.freeze({ eyes: "focused", mouth: "flat", blush: false, tear: false, sweat: false, zzz: false });
    case "neutral":
    default:
      return Object.freeze({ eyes: "open", mouth: "smile", blush: false, tear: false, sweat: false, zzz: false });
  }
}

const EMOTE_EMOTION: Readonly<Record<StudioSpaceEmoteId, StudioEmotionKind>> = Object.freeze({
  "wave": "joy",
  "heart": "joy",
  "party": "joy",
  "thumbs-up": "joy",
  "laugh": "joy",
  "clap": "joy",
  "dance": "joy",
  "sparkles": "joy",
  "wow": "surprise",
  "question": "surprise",
  "exclaim": "surprise",
  "think": "focus",
  "idea": "focus",
  "coffee": "neutral",
  "music": "neutral",
  "sleep": "sleep",
});

/** 이모트 → 감정. 없거나 모르면 neutral. */
export function studioEmotionFromEmote(emote: StudioSpaceEmoteId | null | undefined): StudioEmotionKind {
  if (!emote) return "neutral";
  return EMOTE_EMOTION[emote] ?? "neutral";
}

/** 사용자 상태 → 감정. */
export function studioEmotionFromUserStatus(status: StudioUserStatus | null | undefined): StudioEmotionKind {
  switch (status) {
    case "in-meeting": return "focus";
    case "away":
    case "break": return "sleep";
    case "available":
    default: return "neutral";
  }
}

export interface StudioAvatarEmotionInput {
  readonly emote?: StudioSpaceEmoteId | null;
  /** 이모트 시작 시각(ms epoch). */
  readonly emoteStartedAt?: number;
  readonly userStatus?: StudioUserStatus | null;
  readonly now?: number;
}

/**
 * presence에서 감정을 구한다. 유효한(만료 전) 이모트가 있으면 이모트 감정이,
 * 없으면 사용자 상태 감정이 된다.
 */
export function resolveAvatarEmotion(input: StudioAvatarEmotionInput): StudioEmotionKind {
  const now = input.now ?? Date.now();
  const startedAt = input.emoteStartedAt ?? 0;
  if (input.emote && Number.isFinite(startedAt) && startedAt > 0) {
    const ttl = studioSpaceEmoteById(input.emote)?.durationMs ?? 2_400;
    if (now - startedAt < ttl) return studioEmotionFromEmote(input.emote);
  }
  return studioEmotionFromUserStatus(input.userStatus ?? null);
}

/* ---------------- 모션 ---------------- */

export type StudioMotionKind =
  | "idle" | "walk" | "run" | "jump"
  | "sit" | "lie"
  | "wave" | "greet" | "clap" | "dance" | "work"
  | "talk" | "draw" | "review";

export const STUDIO_MOTION_KINDS: readonly StudioMotionKind[] = Object.freeze([
  "idle", "walk", "run", "jump", "sit", "lie",
  "wave", "greet", "clap", "dance", "work",
  "talk", "draw", "review",
]);

export interface StudioMotionProfile {
  readonly kind: StudioMotionKind;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 렌더 프레임 소스: 걷기 사이클 or 정지 프레임. */
  readonly frameSource: "walk-cycle" | "idle-frame";
  /** 걷기 사이클 재생 속도 배율. */
  readonly cycleRate: number;
  /** 단발성 모션 길이(ms). 0이면 루프. */
  readonly oneShotMs: number;
  /** 전이 블렌딩 시간(ms). */
  readonly blendMs: number;
  /** 점프 호핑 높이(px). */
  readonly hopHeightPx: number;
  /** 인사 기울기(rad). */
  readonly tiltRad: number;
  /** 눕기 회전(deg). */
  readonly rotationDeg: number;
  /** 앉기 스쿼시. */
  readonly scaleY: number;
  /** 정적 수직 오프셋(px, 양수=아래). */
  readonly offsetYPx: number;
}

function motionProfile(profile: StudioMotionProfile): StudioMotionProfile {
  return Object.freeze(profile);
}

export const STUDIO_MOTION_PROFILES: Readonly<Record<StudioMotionKind, StudioMotionProfile>> = Object.freeze({
  idle: motionProfile({ kind: "idle", labelKo: "대기", labelEn: "Idle", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  walk: motionProfile({ kind: "walk", labelKo: "걷기", labelEn: "Walk", frameSource: "walk-cycle", cycleRate: 1, oneShotMs: 0, blendMs: 120, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  run: motionProfile({ kind: "run", labelKo: "뛰기", labelEn: "Run", frameSource: "walk-cycle", cycleRate: 1.8, oneShotMs: 0, blendMs: 120, hopHeightPx: 0, tiltRad: 0.06, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  jump: motionProfile({ kind: "jump", labelKo: "점프", labelEn: "Jump", frameSource: "walk-cycle", cycleRate: 0, oneShotMs: 600, blendMs: 80, hopHeightPx: 26, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  sit: motionProfile({ kind: "sit", labelKo: "앉기", labelEn: "Sit", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 250, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 0.82, offsetYPx: 7 }),
  lie: motionProfile({ kind: "lie", labelKo: "눕기", labelEn: "Lie down", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 400, hopHeightPx: 0, tiltRad: 0, rotationDeg: -72, scaleY: 1, offsetYPx: 10 }),
  wave: motionProfile({ kind: "wave", labelKo: "손흔들기", labelEn: "Wave", frameSource: "walk-cycle", cycleRate: 0.8, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  greet: motionProfile({ kind: "greet", labelKo: "인사", labelEn: "Greet", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 1200, blendMs: 150, hopHeightPx: 0, tiltRad: 0.22, rotationDeg: 0, scaleY: 0.94, offsetYPx: 3 }),
  clap: motionProfile({ kind: "clap", labelKo: "박수", labelEn: "Clap", frameSource: "walk-cycle", cycleRate: 1.2, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  dance: motionProfile({ kind: "dance", labelKo: "춤", labelEn: "Dance", frameSource: "walk-cycle", cycleRate: 1.5, oneShotMs: 0, blendMs: 200, hopHeightPx: 0, tiltRad: 0.1, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  work: motionProfile({ kind: "work", labelKo: "일하기", labelEn: "Work", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 200, hopHeightPx: 0, tiltRad: 0.05, rotationDeg: 0, scaleY: 0.97, offsetYPx: 1 }),
  talk: motionProfile({ kind: "talk", labelKo: "대화", labelEn: "Talk", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  draw: motionProfile({ kind: "draw", labelKo: "그리기", labelEn: "Draw", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0.05, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  review: motionProfile({ kind: "review", labelKo: "검토", labelEn: "Review", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
});

/** 기존 스킨 파이프라인(Phaser 클립)이 아는 상태로 매핑한다. */
export function motionKindToLegacyState(kind: StudioMotionKind): StudioCharacterMotionState {
  switch (kind) {
    case "run":
    case "jump":
    case "dance":
      return "walk";
    case "lie":
      return "sit";
    case "greet":
    case "clap":
      return "wave";
    case "work":
      return "talk";
    default:
      return kind;
  }
}

/* ---------------- 상태머신 ---------------- */

export interface StudioMotionState {
  readonly kind: StudioMotionKind;
  readonly startedAt: number;
  /** 블렌딩 중이면 이전 모션, 아니면 null. */
  readonly blendFrom: StudioMotionKind | null;
  readonly blendUntil: number;
}

/** 장면당 하나의 머신을 만든다. */
export function createMotionStateMachine(initial: StudioMotionKind = "idle", now = 0): StudioMotionState {
  return Object.freeze({ kind: initial, startedAt: now, blendFrom: null, blendUntil: now });
}

/**
 * 모션 전이를 요청한다 (트랙3이 물리/입력에서 호출).
 * 같은 모션이면 머신을 그대로 돌려주고, 단발 모션 재요청이면 처음부터 다시 재생한다.
 */
export function requestMotionState(machine: StudioMotionState, kind: StudioMotionKind, now: number): StudioMotionState {
  const profile = STUDIO_MOTION_PROFILES[kind];
  if (machine.kind === kind) {
    // 단발 모션은 같은 요청이 와도 다시 시작한다 (점프 연타 등).
    if (profile.oneShotMs > 0) {
      return Object.freeze({ kind, startedAt: now, blendFrom: null, blendUntil: now });
    }
    return machine;
  }
  const blendMs = Math.max(0, profile.blendMs);
  return Object.freeze({
    kind,
    startedAt: now,
    blendFrom: blendMs > 0 ? machine.kind : null,
    blendUntil: now + blendMs,
  });
}

/** 블렌딩 진행률 0~1 (smoothstep easing). 블렌딩 중이 아니면 1. */
export function motionBlendFactor(machine: StudioMotionState, now: number): number {
  if (!machine.blendFrom || now >= machine.blendUntil) return 1;
  const total = machine.blendUntil - machine.startedAt;
  if (total <= 0) return 1;
  const raw = Math.max(0, Math.min(1, (now - machine.startedAt) / total));
  return raw * raw * (3 - 2 * raw);
}

/** 단발 모션(점프·인사)이 끝났는지. 루프 모션은 항상 false. */
export function motionOneShotFinished(machine: StudioMotionState, now: number): boolean {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  return profile.oneShotMs > 0 && now - machine.startedAt >= profile.oneShotMs;
}

/* ---------------- 렌더 샘플 ---------------- */

export interface StudioMotionRenderSample {
  readonly kind: StudioMotionKind;
  readonly elapsedMs: number;
  readonly blendFactor: number;
  readonly blendFrom: StudioMotionKind | null;
  /** 추가 수직 오프셋(px, 음수=위로). */
  readonly offsetYPx: number;
  readonly rotationDeg: number;
  /** 인사 기울기에 단발 엔벨로프를 곱한 값(rad). */
  readonly tiltRad: number;
  readonly scaleY: number;
  /** 걷기 사이클 재생 속도 배율 (Phaser anim timeScale용). */
  readonly cycleRate: number;
}

/** 렌더러(Phaser 오버레이·2D 미리보기)가 매 프레임 호출한다. */
export function sampleMotionRender(machine: StudioMotionState, now: number): StudioMotionRenderSample {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  const elapsedMs = Math.max(0, now - machine.startedAt);
  let offsetYPx = profile.offsetYPx;
  let tiltRad = profile.tiltRad;
  if (machine.kind === "jump" && profile.oneShotMs > 0) {
    const phase = Math.min(1, elapsedMs / profile.oneShotMs);
    offsetYPx += -profile.hopHeightPx * Math.sin(Math.PI * phase);
  }
  if (machine.kind === "greet" && profile.oneShotMs > 0) {
    const phase = Math.min(1, elapsedMs / profile.oneShotMs);
    tiltRad *= Math.sin(Math.PI * phase);
  }
  if (machine.kind === "dance") {
    tiltRad *= Math.sin(elapsedMs * 0.012);
    offsetYPx += -Math.abs(Math.sin(elapsedMs * 0.012)) * 4;
  }
  return Object.freeze({
    kind: machine.kind,
    elapsedMs,
    blendFactor: motionBlendFactor(machine, now),
    blendFrom: machine.blendFrom,
    offsetYPx,
    rotationDeg: profile.rotationDeg,
    tiltRad,
    scaleY: profile.scaleY,
    cycleRate: profile.cycleRate,
  });
}

export interface StudioMotionCellSample {
  readonly row: number;
  readonly column: number;
  readonly frameIndex: number;
  /** 호흡·호핑 바운스(px, 음수=위로). */
  readonly bobYPx: number;
  readonly rotationDeg: number;
  readonly scaleY: number;
  readonly tiltRad: number;
}

/**
 * 커스텀 시트(또는 프로시저럴 폴백) 2D 미리보기용 셀 샘플.
 * 모션 전용 행이 없어도 걷기 사이클/정지 프레임 매핑 + 변형으로 전부 표현한다.
 */
export function sampleCustomSheetMotionCell(
  config: StudioSpriteSheetConfig,
  machine: StudioMotionState,
  direction: StudioSpriteDirection,
  now: number,
  reducedMotion: boolean,
): StudioMotionCellSample {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  const render = sampleMotionRender(machine, now);
  const walkFrames = spriteSheetWalkFrameCount(config);
  let row: number;
  let column: number;
  let bobYPx = 0;
  let extraOffsetY = 0;

  if (profile.frameSource === "walk-cycle") {
    const elapsed = reducedMotion ? 0 : render.elapsedMs;
    if (machine.kind === "jump") {
      // 점프는 중간 스텝 프레임 고정 + 호핑
      const cell = spriteSheetCell(config, direction, Math.min(1, walkFrames - 1));
      row = cell.row; column = cell.column;
      extraOffsetY = render.offsetYPx;
    } else if (machine.kind === "wave") {
      // 손흔들기는 앞 2프레임을 빠르게 왕복
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * 1.4, Math.min(2, walkFrames), reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      bobYPx = reducedMotion ? 0 : -Math.abs(Math.sin(elapsed * 0.02)) * 3;
    } else if (machine.kind === "clap") {
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * 1.2, walkFrames, reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      bobYPx = reducedMotion ? 0 : -Math.abs(Math.sin(elapsed * 0.025)) * 2;
    } else {
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * profile.cycleRate, walkFrames, reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      if (machine.kind === "dance") bobYPx = render.offsetYPx;
      else if (machine.kind === "run") bobYPx = reducedMotion ? 0 : -Math.abs(Math.sin(elapsed * 0.03)) * 3;
    }
  } else {
    const cell = spriteSheetIdleCell(config, spriteDirectionToFacing(direction));
    row = cell.row; column = cell.column;
    if (!reducedMotion) {
      if (machine.kind === "idle") bobYPx = Math.sin(render.elapsedMs * (Math.PI * 2 / 2400)) * 1.5;
      else if (machine.kind === "work") bobYPx = -Math.abs(Math.sin(render.elapsedMs * 0.03)) * 1.2;
    }
    extraOffsetY = render.offsetYPx;
  }

  return Object.freeze({
    row,
    column,
    frameIndex: row * config.framesPerDirection + column,
    bobYPx: bobYPx + extraOffsetY,
    rotationDeg: render.rotationDeg,
    scaleY: render.scaleY,
    tiltRad: render.tiltRad,
  });
}

/** facing 쿼리용 편의 래퍼 (Phaser는 4 facing만 쓴다). */
export function facingToSpriteDirection(facing: StudioVirtualSpaceFacing): StudioSpriteDirection {
  switch (facing) {
    case "left": return "left";
    case "right": return "right";
    case "up": return "up";
    case "down":
    default: return "down";
  }
}
