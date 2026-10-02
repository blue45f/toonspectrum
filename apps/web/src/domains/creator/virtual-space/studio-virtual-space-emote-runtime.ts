/**
 * 머리 위 이모트 말풍선과 몸동작 런타임.
 *
 * - 재생 일정(팝인·뜨기·몸동작·춤 방향)은 순수 함수로 계산해 테스트한다.
 * - Phaser 객체 생성은 StudioEmoteRuntime이 맡는다. Canvas는 play·place·pose만 부른다.
 * - 말풍선 색은 CSS 토큰(--color-panel·--color-fg·--color-accent·--color-accent-2)에서 읽고,
 *   아이콘 색만 픽셀 아트 팔레트(emote-art)를 쓴다.
 * - 모션 줄이기에서는 정적 아이콘만 보이고 몸동작·팝인·뜨기가 없다.
 */
import type * as Phaser from "phaser";

import {
  studioSpaceEmoteById,
  type StudioSpaceEmoteExpression,
  type StudioSpaceEmoteId,
  type StudioSpaceEmoteMotion,
} from "./studio-virtual-space-emote-catalog";
import { rasterizeStudioSpaceEmote, STUDIO_SPACE_EMOTE_ART_SIZE } from "./studio-virtual-space-emote-art";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

export interface StudioEmotePlayback {
  readonly id: StudioSpaceEmoteId;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly motion: StudioSpaceEmoteMotion;
  readonly expression: StudioSpaceEmoteExpression | null;
  /** 같은 이모트를 다시 요청하면 증가한다. 렌더러가 애니메이션을 처음부터 다시 그리는 기준이다. */
  readonly sequence: number;
}

export interface StudioEmotePose {
  readonly bubbleScale: number;
  readonly bubbleAlpha: number;
  /** 말풍선이 위로 떠오른 거리(px, 양수 = 위). */
  readonly bubbleRise: number;
  readonly bodyX: number;
  readonly bodyY: number;
  readonly bodyAngle: number;
  /** 춤 동작 중 방향 프레임 순환. null이면 원래 방향을 쓴다. */
  readonly facing: StudioVirtualSpaceFacing | null;
  readonly expression: StudioSpaceEmoteExpression | null;
}

const POP_IN_MS = 180;
const POP_SETTLE_MS = 320;
const FADE_OUT_MS = 280;
const RISE_PX = 10;
const DANCE_STEP_MS = 180;
const DANCE_FACINGS: readonly StudioVirtualSpaceFacing[] = ["down", "left", "up", "right"];

/** 요청한 이모트의 재생 상태를 만든다. 같은 id를 다시 요청해도 처음부터 다시 재생한다. */
export function startStudioEmotePlayback(
  id: StudioSpaceEmoteId,
  time: number,
  previousSequence = 0,
): StudioEmotePlayback | null {
  const definition = studioSpaceEmoteById(id);
  if (!definition || !Number.isFinite(time)) return null;
  return Object.freeze({
    id: definition.id,
    startedAt: time,
    durationMs: definition.durationMs,
    motion: definition.motion,
    expression: definition.expression,
    sequence: (Number.isSafeInteger(previousSequence) ? previousSequence : 0) + 1,
  });
}

export function studioEmotePlaybackActive(playback: StudioEmotePlayback | null, time: number): playback is StudioEmotePlayback {
  if (!playback || !Number.isFinite(time)) return false;
  const elapsed = time - playback.startedAt;
  return elapsed >= 0 && elapsed < playback.durationMs;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 말풍선 팝인 배율: 0 → 1.15 → 1. */
export function studioEmoteBubbleScale(elapsed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (elapsed <= 0) return 0;
  if (elapsed < POP_IN_MS) return 1.15 * Math.min(1, easeOutBack(elapsed / POP_IN_MS) / 1.1);
  if (elapsed < POP_SETTLE_MS) return 1.15 - 0.15 * ((elapsed - POP_IN_MS) / (POP_SETTLE_MS - POP_IN_MS));
  return 1;
}

/** 몸동작 오프셋. 모션 줄이기에서는 모두 0이다. */
export function studioEmoteBodyMotion(
  motion: StudioSpaceEmoteMotion,
  elapsed: number,
  durationMs: number,
  reducedMotion: boolean,
): Pick<StudioEmotePose, "bodyX" | "bodyY" | "bodyAngle" | "facing"> {
  const none = { bodyX: 0, bodyY: 0, bodyAngle: 0, facing: null };
  if (reducedMotion || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= durationMs) return none;
  switch (motion) {
    case "pop":
      return none;
    case "hop":
      return elapsed < 900 ? { ...none, bodyY: -Math.abs(Math.sin(Math.PI * elapsed / 300)) * 6 } : none;
    case "shake": {
      const decay = Math.max(0, 1 - elapsed / 700);
      return { ...none, bodyX: Math.sin(elapsed / 1_000 * Math.PI * 2 * 9) * 2.5 * decay };
    }
    case "sway":
      return { ...none, bodyAngle: Math.sin(elapsed / 1_400 * Math.PI * 2) * 5 };
    case "dance":
      return {
        bodyX: Math.sin(elapsed / 720 * Math.PI * 2) * 2,
        bodyY: -Math.abs(Math.sin(Math.PI * elapsed / 360)) * 5,
        bodyAngle: 0,
        facing: DANCE_FACINGS[Math.floor(elapsed / DANCE_STEP_MS) % DANCE_FACINGS.length] ?? "down",
      };
    case "nod":
      return elapsed < 1_000 ? { ...none, bodyY: Math.max(0, Math.sin(elapsed / 500 * Math.PI * 2)) * 2 } : none;
    case "doze":
      return { ...none, bodyY: Math.sin(elapsed / 1_600 * Math.PI * 2) * 1.5, bodyAngle: Math.sin(elapsed / 3_200 * Math.PI * 2) * 2 };
  }
}

/**
 * 재생 중인 이모트의 한 프레임. 재생이 끝났으면 null.
 * motionTime은 몸동작(깡충·춤 방향)에만 쓰는 시각이다. 기본값은 time과 같다.
 */
export function studioEmotePose(
  playback: StudioEmotePlayback | null,
  time: number,
  reducedMotion: boolean,
  motionTime = time,
): StudioEmotePose | null {
  if (!studioEmotePlaybackActive(playback, time)) return null;
  const elapsed = time - playback.startedAt;
  const remaining = playback.durationMs - elapsed;
  const alpha = reducedMotion ? 1 : Math.max(0, Math.min(1, remaining / FADE_OUT_MS));
  const motionElapsed = Number.isFinite(motionTime) ? motionTime - playback.startedAt : elapsed;
  return {
    bubbleScale: studioEmoteBubbleScale(elapsed, reducedMotion),
    bubbleAlpha: alpha,
    bubbleRise: reducedMotion ? 0 : RISE_PX * Math.min(1, elapsed / playback.durationMs),
    ...studioEmoteBodyMotion(playback.motion, motionElapsed, playback.durationMs, reducedMotion),
    expression: playback.expression,
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* CSS 토큰 → Phaser 색                                                                            */
/* ---------------------------------------------------------------------------------------------- */

let tokenProbe: CanvasRenderingContext2D | null | undefined;

function probeContext(): CanvasRenderingContext2D | null {
  if (tokenProbe !== undefined) return tokenProbe;
  try {
    const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    tokenProbe = canvas?.getContext("2d", { willReadFrequently: true }) ?? null;
  } catch {
    tokenProbe = null;
  }
  return tokenProbe;
}

/**
 * CSS 사용자 정의 속성(예: --color-panel)을 Phaser 색 정수(0xRRGGBB)로 바꾼다.
 * oklch 등 어떤 CSS 색 표기든 1×1 캔버스에 칠해 sRGB로 읽는다. 읽을 수 없으면 fallback.
 */
export function studioCssColorNumber(varName: string, fallback: number, root?: Element | null): number {
  try {
    const element = root ?? (typeof document === "undefined" ? null : document.documentElement);
    if (!element || typeof getComputedStyle !== "function") return fallback;
    const value = getComputedStyle(element).getPropertyValue(varName).trim();
    const context = value ? probeContext() : null;
    if (!context) return fallback;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000000";
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallback;
    return (r << 16) | (g << 8) | b;
  } catch {
    return fallback;
  }
}

function luminance(color: number): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((color >> 16) & 255) + 0.7152 * channel((color >> 8) & 255) + 0.0722 * channel(color & 255);
}

export interface StudioCanvasBubbleColors {
  /** 밝은 말풍선 바탕. 밝은 테마는 --color-panel, 어두운 테마는 --color-fg. */
  readonly paper: number;
  /** 말풍선 글자·외곽선 잉크. paper의 반대편 토큰. */
  readonly ink: number;
  readonly accent: number;
  readonly accent2: number;
}

/** 테마와 관계없이 "밝은 종이 + 어두운 잉크" 말풍선 색을 토큰에서 고른다. */
export function studioCanvasBubbleColors(root?: Element | null): StudioCanvasBubbleColors {
  const panel = studioCssColorNumber("--color-panel", 0x0b101d, root);
  const fg = studioCssColorNumber("--color-fg", 0xf1f4ff, root);
  const panelLight = luminance(panel) >= luminance(fg);
  return {
    paper: panelLight ? panel : fg,
    ink: panelLight ? fg : panel,
    accent: studioCssColorNumber("--color-accent", 0xb39bff, root),
    accent2: studioCssColorNumber("--color-accent-2", 0x6edaff, root),
  };
}

export interface StudioCanvasNameplateColors {
  /** 이름표 바탕(--color-panel)과 글자(--color-fg). */
  readonly plate: number;
  readonly text: number;
  /** 내 이름표는 accent 계열(--color-accent 바탕, --color-on-accent 글자)로 구분한다. */
  readonly self: number;
  readonly selfText: number;
  /** NPC 이름표 글자(--color-accent-2). "NPC ·" 접두어와 함께 실제 접속자와 구분한다. */
  readonly npcText: number;
  /** 상태 색 점. 라벨 글자와 함께 쓰며 색만으로 상태를 전달하지 않는다. */
  readonly status: Readonly<Record<"focused" | "reviewing" | "away" | "break" | "meeting", number>>;
}

/** 캔버스 이름표 색을 CSS 토큰에서 읽는다. */
export function studioCanvasNameplateColors(root?: Element | null): StudioCanvasNameplateColors {
  const accent = studioCssColorNumber("--color-accent", 0xb39bff, root);
  const accent2 = studioCssColorNumber("--color-accent-2", 0x6edaff, root);
  return {
    plate: studioCssColorNumber("--color-panel", 0x0b101d, root),
    text: studioCssColorNumber("--color-fg", 0xf1f4ff, root),
    self: accent,
    selfText: studioCssColorNumber("--color-on-accent", 0x121226, root),
    npcText: accent2,
    status: {
      focused: accent,
      reviewing: accent2,
      away: studioCssColorNumber("--color-warn", 0xf2c45a, root),
      break: studioCssColorNumber("--color-cool", 0x7fc8f0, root),
      // 회의 중은 방해 금지 표시처럼 붉은 점으로 구분한다(라벨과 함께 쓴다).
      meeting: studioCssColorNumber("--color-danger", 0xff8a9a, root),
    },
  };
}

/** Phaser Text 스타일용 "#rrggbb". */
export function studioColorHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

/* ---------------------------------------------------------------------------------------------- */
/* Phaser 런타임                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

export type StudioEmoteBubbleVariant = "person" | "npc";

const ICON_SCALE = 2;
/**
 * 프레임이 아주 느린 기기(백그라운드 탭·저사양 GPU)에서도 이모트가 적어도 몇 번의 렌더 프레임에는
 * 보이도록, 재생 뒤 처음 이만큼의 프레임 동안은 경과 시간을 "다 펼쳐진 상태"로 묶어 둔다.
 * 첫 프레임은 팝인 시작(배율 0)이므로 실제로 보이는 프레임은 이보다 하나 적다. 60fps에서는 영향이 없다.
 * 화면 밖 배우도 프레임을 세므로, 숨어 있던 배우의 이모트가 끝없이 남지 않는다.
 */
const MIN_VISIBLE_FRAMES = 4;

/** 느린 프레임에서도 최소 프레임 수만큼은 보이게 경과 시간을 묶은 재생 시각. */
export function studioEmoteEffectiveTime(playback: StudioEmotePlayback, time: number, framesShown: number): number {
  if (framesShown >= MIN_VISIBLE_FRAMES || !Number.isFinite(time)) return time;
  return Math.min(time, playback.startedAt + POP_SETTLE_MS + framesShown);
}

/**
 * 몸동작용 시각. 아주 느린 프레임에서 경과 시간이 지속 시간을 넘으면 한 주기 안으로 접어,
 * 묶여 보이는 동안에도 춤 방향·깡충이 한 자세로 굳지 않게 한다. 보통 프레임에서는 time 그대로다.
 */
export function studioEmoteMotionTime(playback: StudioEmotePlayback, time: number, framesShown: number): number {
  if (framesShown >= MIN_VISIBLE_FRAMES || !Number.isFinite(time)) return time;
  const elapsed = time - playback.startedAt;
  return elapsed < playback.durationMs ? time : playback.startedAt + (elapsed % playback.durationMs);
}

const BUBBLE_WIDTH = 44;
const BUBBLE_HEIGHT = 40;
const BUBBLE_TAIL = 7;
const BUBBLE_DEPTH = 160_500;

export function studioEmoteIconTextureKey(id: StudioSpaceEmoteId): string {
  return `studio-emote-icon-${id}`;
}

interface ActorEmote {
  playback: StudioEmotePlayback;
  /** 이 재생을 시작한 뒤 지나간 렌더 프레임 수(화면 밖 프레임 포함). */
  frames: number;
  readonly container: Phaser.GameObjects.Container;
  readonly icon: Phaser.GameObjects.Image;
  readonly bubble: Phaser.GameObjects.Image;
  variant: StudioEmoteBubbleVariant;
}

export interface StudioEmoteRuntimeOptions {
  /** Phaser.Textures.FilterMode.NEAREST. 아이콘 픽셀을 흐리지 않게 한다. */
  readonly nearestFilter: number;
  readonly colors: StudioCanvasBubbleColors;
}

type EmoteScene = Pick<Phaser.Scene, "add" | "textures" | "make">;

/** 배우(나·피어·NPC)별 머리 위 이모트 말풍선. */
export class StudioEmoteRuntime {
  private readonly actors = new Map<string, ActorEmote>();
  private readonly sequences = new Map<string, number>();
  private readonly bubbleKeys: Readonly<Record<StudioEmoteBubbleVariant, string>>;

  constructor(private readonly scene: EmoteScene, private readonly options: StudioEmoteRuntimeOptions) {
    this.bubbleKeys = { person: "studio-emote-bubble-person", npc: "studio-emote-bubble-npc" };
    this.ensureBubbleTexture("person");
    this.ensureBubbleTexture("npc");
  }

  private ensureBubbleTexture(variant: StudioEmoteBubbleVariant): void {
    const key = this.bubbleKeys[variant];
    if (this.scene.textures.exists(key)) return;
    const { paper, ink, accent2 } = this.options.colors;
    const graphics = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const stroke = variant === "npc" ? accent2 : ink;
    const cx = BUBBLE_WIDTH / 2 + 1;
    graphics.fillStyle(ink, 0.18).fillRoundedRect(2, 3, BUBBLE_WIDTH, BUBBLE_HEIGHT, 11);
    graphics.fillStyle(paper, 1).fillRoundedRect(1, 1, BUBBLE_WIDTH, BUBBLE_HEIGHT, 11);
    graphics.fillTriangle(cx - 6, BUBBLE_HEIGHT - 1, cx + 6, BUBBLE_HEIGHT - 1, cx, BUBBLE_HEIGHT + BUBBLE_TAIL);
    graphics.lineStyle(2, stroke, variant === "npc" ? 1 : 0.55).strokeRoundedRect(1, 1, BUBBLE_WIDTH, BUBBLE_HEIGHT, 11);
    graphics.fillStyle(paper, 1).fillRect(cx - 5, BUBBLE_HEIGHT - 2, 10, 3);
    graphics.lineStyle(2, stroke, variant === "npc" ? 1 : 0.55)
      .lineBetween(cx - 6, BUBBLE_HEIGHT, cx, BUBBLE_HEIGHT + BUBBLE_TAIL)
      .lineBetween(cx + 6, BUBBLE_HEIGHT, cx, BUBBLE_HEIGHT + BUBBLE_TAIL);
    graphics.generateTexture(key, BUBBLE_WIDTH + 3, BUBBLE_HEIGHT + BUBBLE_TAIL + 2);
    graphics.destroy();
  }

  private ensureIconTexture(id: StudioSpaceEmoteId): string {
    const key = studioEmoteIconTextureKey(id);
    if (this.scene.textures.exists(key)) return key;
    const size = STUDIO_SPACE_EMOTE_ART_SIZE;
    const texture = this.scene.textures.createCanvas(key, size, size);
    const context = texture?.getContext();
    if (!texture || !context) return key;
    const image = context.createImageData(size, size);
    image.data.set(rasterizeStudioSpaceEmote(id));
    context.putImageData(image, 0, 0);
    texture.refresh();
    texture.setFilter(this.options.nearestFilter);
    return key;
  }

  /**
   * 같은 id를 다시 요청해도 처음부터 다시 재생한다.
   * dedupeMs를 주면 같은 id가 그 시간 안에 이미 시작된 경우 다시 시작하지 않는다(중복 알림 합치기).
   */
  play(actorId: string, id: StudioSpaceEmoteId, time: number, variant: StudioEmoteBubbleVariant = "person", dedupeMs = 0): void {
    const previous = this.actors.get(actorId);
    if (previous && dedupeMs > 0 && previous.playback.id === id
      && time >= previous.playback.startedAt && time - previous.playback.startedAt < dedupeMs) return;
    const playback = startStudioEmotePlayback(id, time, this.sequences.get(actorId) ?? 0);
    if (!playback) return;
    this.sequences.set(actorId, playback.sequence);
    const iconKey = this.ensureIconTexture(id);
    if (previous) {
      previous.playback = playback;
      previous.frames = 0;
      previous.icon.setTexture(iconKey);
      if (previous.variant !== variant) { previous.variant = variant; previous.bubble.setTexture(this.bubbleKeys[variant]); }
      previous.container.setVisible(true);
      return;
    }
    const bubble = this.scene.add.image(0, 0, this.bubbleKeys[variant]).setOrigin(0.5, 1);
    const icon = this.scene.add.image(0, -(BUBBLE_TAIL + BUBBLE_HEIGHT / 2) - 1, iconKey)
      .setScale(ICON_SCALE).setOrigin(0.5, 0.5);
    const container = this.scene.add.container(0, 0, [bubble, icon]).setDepth(BUBBLE_DEPTH).setVisible(false);
    this.actors.set(actorId, { playback, frames: 0, container, icon, bubble, variant });
  }

  /** 재생 중인 이모트 id. 없으면 null. */
  activeId(actorId: string, time: number): StudioSpaceEmoteId | null {
    const actor = this.actors.get(actorId);
    return actor && studioEmotePlaybackActive(actor.playback, studioEmoteEffectiveTime(actor.playback, time, actor.frames))
      ? actor.playback.id : null;
  }

  /** DEV 진단용 요약. */
  debug(actorId: string): string {
    const actor = this.actors.get(actorId);
    return actor ? `${actor.playback.id}@${Math.round(actor.playback.startedAt)}#${actor.playback.sequence}:${actor.container.visible ? "on" : "off"}` : "none";
  }

  sequence(actorId: string): number {
    return this.sequences.get(actorId) ?? 0;
  }

  /** 몸동작·표정 계산(렌더 전에 호출). 재생이 끝났으면 null. */
  pose(actorId: string, time: number, reducedMotion: boolean): StudioEmotePose | null {
    const actor = this.actors.get(actorId);
    return actor ? studioEmotePose(actor.playback, studioEmoteEffectiveTime(actor.playback, time, actor.frames), reducedMotion,
      studioEmoteMotionTime(actor.playback, time, actor.frames)) : null;
  }

  /**
   * 머리 위 기준점(headY)에 말풍선을 놓는다. 끝난 이모트는 숨긴다.
   * 반환값은 말풍선이 차지한 높이(px). 대사 말풍선을 그 위에 쌓을 때 쓴다.
   */
  place(actorId: string, x: number, headY: number, overlayScale: number, time: number, reducedMotion: boolean, visible = true): number {
    const actor = this.actors.get(actorId);
    if (!actor) return 0;
    const pose = studioEmotePose(actor.playback, studioEmoteEffectiveTime(actor.playback, time, actor.frames), reducedMotion);
    actor.frames += 1;
    if (!pose || !visible) { actor.container.setVisible(false); return 0; }
    const scale = Math.max(0.01, pose.bubbleScale) * overlayScale;
    actor.container.setVisible(pose.bubbleScale > 0.01)
      .setPosition(x, headY - pose.bubbleRise * overlayScale)
      .setScale(scale)
      .setAlpha(pose.bubbleAlpha);
    return (BUBBLE_HEIGHT + BUBBLE_TAIL + 4) * overlayScale;
  }

  remove(actorId: string): void {
    this.actors.get(actorId)?.container.destroy();
    this.actors.delete(actorId);
    this.sequences.delete(actorId);
  }

  destroy(): void {
    for (const actor of this.actors.values()) actor.container.destroy();
    this.actors.clear();
    this.sequences.clear();
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* 말풍선(대사) 런타임                                                                              */
/* ---------------------------------------------------------------------------------------------- */

const SPEECH_PADDING_X = 9;
const SPEECH_PADDING_Y = 6;
const SPEECH_TAIL = 7;
const SPEECH_RADIUS = 10;
const SPEECH_DEPTH = 160_400;
const SPEECH_FONT_PX = 12;

interface SpeechBubble {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  content: string;
  variant: StudioEmoteBubbleVariant;
  height: number;
  /** 시간 지정 표시(showTimed)의 시작 시각. null이면 시간 무지정 표시다. */
  shownAtMs: number | null;
  /** 시간 지정 표시의 만료 시각. 지나면 페이드 아웃이 끝난 것으로 본다. */
  expiresAtMs: number | null;
}

/** 말풍선이 서서히 나타나는 시간(ms). */
export const STUDIO_SPEECH_BUBBLE_FADE_IN_MS = 150;
/** 만료 직전 말풍선이 서서히 사라지는 시간(ms). */
export const STUDIO_SPEECH_BUBBLE_FADE_OUT_MS = 500;

/**
 * 시간 지정 말풍선의 투명도(0~1).
 * shownAtMs가 없으면(시간 무지정 표시) 항상 1이다. 나타난 직후에는 페이드 인,
 * 만료가 가까우면 페이드 아웃, 만료를 넘기면 0이다. 모션 줄이기 여부와 무관하게
 * 투명도만 다루므로 갑자기 사라지는 느낌만 없앤다.
 */
export function studioSpeechBubbleAlpha(input: {
  readonly shownAtMs: number | null;
  readonly expiresAtMs: number | null;
}, nowMs: number): number {
  if (input.shownAtMs === null || !Number.isFinite(nowMs)) return 1;
  let alpha = Math.min(1, Math.max(0, (nowMs - input.shownAtMs) / STUDIO_SPEECH_BUBBLE_FADE_IN_MS));
  if (input.expiresAtMs !== null) {
    const remaining = input.expiresAtMs - nowMs;
    if (remaining <= 0) return 0;
    if (remaining < STUDIO_SPEECH_BUBBLE_FADE_OUT_MS) alpha *= remaining / STUDIO_SPEECH_BUBBLE_FADE_OUT_MS;
  }
  return alpha;
}

/**
 * 흰 둥근 말풍선 + 꼬리. NPC 말풍선은 --color-accent-2 테두리로 실제 접속자와 구분한다.
 * 글자는 12px(최소 11px 규칙 이상), 색은 토큰 잉크를 쓴다.
 */
export class StudioSpeechBubbleRuntime {
  private readonly bubbles = new Map<string, SpeechBubble>();

  constructor(private readonly scene: Pick<Phaser.Scene, "add">, private readonly colors: StudioCanvasBubbleColors) {}

  private redraw(bubble: SpeechBubble): void {
    const { paper, ink, accent2 } = this.colors;
    const width = Math.ceil(bubble.text.width) + SPEECH_PADDING_X * 2;
    const height = Math.ceil(bubble.text.height) + SPEECH_PADDING_Y * 2;
    const left = -width / 2, top = -(height + SPEECH_TAIL);
    const stroke = bubble.variant === "npc" ? accent2 : ink;
    const strokeAlpha = bubble.variant === "npc" ? 1 : 0.5;
    bubble.background.clear()
      .fillStyle(ink, 0.16).fillRoundedRect(left + 1, top + 2, width, height, SPEECH_RADIUS)
      .fillStyle(paper, 1).fillRoundedRect(left, top, width, height, SPEECH_RADIUS)
      .fillTriangle(-6, -SPEECH_TAIL - 1, 6, -SPEECH_TAIL - 1, 0, 0)
      .lineStyle(2, stroke, strokeAlpha).strokeRoundedRect(left, top, width, height, SPEECH_RADIUS)
      .fillStyle(paper, 1).fillRect(-5, -SPEECH_TAIL - 2, 10, 3)
      .lineStyle(2, stroke, strokeAlpha).lineBetween(-6, -SPEECH_TAIL, 0, 0).lineBetween(6, -SPEECH_TAIL, 0, 0);
    bubble.text.setPosition(0, top + height / 2);
    bubble.height = height + SPEECH_TAIL;
  }

  show(actorId: string, content: string, variant: StudioEmoteBubbleVariant = "npc"): void {
    const existing = this.bubbles.get(actorId);
    if (existing) {
      if (existing.content !== content || existing.variant !== variant) {
        existing.content = content;
        existing.variant = variant;
        existing.shownAtMs = null;
        existing.expiresAtMs = null;
        existing.text.setText(content);
        this.redraw(existing);
      }
      return;
    }
    const background = this.scene.add.graphics();
    const text = this.scene.add.text(0, 0, content, {
      fontFamily: "Pretendard, Inter, sans-serif",
      fontSize: `${SPEECH_FONT_PX}px`,
      fontStyle: "bold",
      color: studioColorHex(this.colors.ink),
      align: "center",
      wordWrap: { width: 196, useAdvancedWrap: true },
    }).setOrigin(0.5, 0.5);
    const container = this.scene.add.container(0, 0, [background, text]).setDepth(SPEECH_DEPTH).setVisible(false);
    const bubble: SpeechBubble = { container, background, text, content, variant, height: 0, shownAtMs: null, expiresAtMs: null };
    this.redraw(bubble);
    this.bubbles.set(actorId, bubble);
  }

  /**
   * TTL이 있는 말풍선 표시(프레즌스 채팅용). 같은 내용을 반복 호출해도 만료가
   * 연장되지 않는다 — 송신 측 TTL과 같은 시점에 함께 사라지기 위해서다.
   * place에 nowMs를 넘기면 페이드 인/아웃이 적용된다.
   */
  showTimed(actorId: string, content: string, variant: StudioEmoteBubbleVariant, ttlMs: number, nowMs: number): void {
    const existing = this.bubbles.get(actorId);
    if (existing && existing.content === content && existing.variant === variant && existing.expiresAtMs !== null) return;
    this.show(actorId, content, variant);
    const bubble = this.bubbles.get(actorId);
    if (!bubble) return;
    bubble.shownAtMs = nowMs;
    bubble.expiresAtMs = nowMs + Math.max(0, ttlMs);
  }

  /** 꼬리 끝을 (x, bottomY)에 맞춘다. 반환값은 화면에 차지한 높이(다음 겹침 계산용). */
  place(actorId: string, x: number, bottomY: number, overlayScale: number, visible = true, nowMs?: number): number {
    const bubble = this.bubbles.get(actorId);
    if (!bubble) return 0;
    const alpha = nowMs !== undefined && bubble.shownAtMs !== null ? studioSpeechBubbleAlpha(bubble, nowMs) : 1;
    const shown = visible && alpha > 0;
    bubble.container.setVisible(shown).setPosition(x, bottomY).setScale(overlayScale).setAlpha(alpha);
    return shown ? bubble.height * overlayScale : 0;
  }

  hide(actorId: string): void {
    this.bubbles.get(actorId)?.container.setVisible(false);
  }

  text(actorId: string): string | null {
    const bubble = this.bubbles.get(actorId);
    return bubble?.container.visible ? bubble.content : null;
  }

  remove(actorId: string): void {
    this.bubbles.get(actorId)?.container.destroy();
    this.bubbles.delete(actorId);
  }

  destroy(): void {
    for (const bubble of this.bubbles.values()) bubble.container.destroy();
    this.bubbles.clear();
  }
}
