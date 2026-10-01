/**
 * 가상 스튜디오 이모트 카탈로그(단일 기준).
 *
 * - 배열 순서는 HUD 이모트 선택기 표시 순서다.
 * - 프레즌스 와이어('toonstudio-space-v1')의 reaction 값은 이 id 집합으로만 수신한다.
 *   기존 wave·heart·sparkles·thumbs-up 값은 그대로 유지해 구버전 클라이언트와 호환된다.
 * - expression은 표정 시트가 있는 스킨에서 얼굴 표정 프레임을, motion은 머리 위 말풍선과
 *   몸동작(깡충·흔들기·춤)을 고른다. 렌더링은 emote-runtime이 맡는다.
 */

export const STUDIO_SPACE_EMOTE_IDS = [
  "wave", "heart", "party", "thumbs-up", "laugh", "clap", "wow", "think",
  "idea", "dance", "sparkles", "question", "exclaim", "coffee", "music", "sleep",
] as const;

export type StudioSpaceEmoteId = typeof STUDIO_SPACE_EMOTE_IDS[number];
export type StudioSpaceEmoteExpression = "happy" | "wave" | "surprised" | "calm";
export type StudioSpaceEmoteMotion = "pop" | "hop" | "shake" | "sway" | "dance" | "nod" | "doze";
export type StudioSpaceEmoteShortcut = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "Z";

export interface StudioSpaceEmoteDefinition {
  readonly id: StudioSpaceEmoteId;
  readonly labelKo: string;
  readonly labelEn: string;
  /** DOM 대체 표시용 이모지. 월드에서는 픽셀 아이콘(emote-art)을 우선한다. */
  readonly glyph: string;
  readonly shortcut: StudioSpaceEmoteShortcut | null;
  readonly expression: StudioSpaceEmoteExpression | null;
  readonly motion: StudioSpaceEmoteMotion;
  /** 머리 위 표시·몸동작 지속 시간. 1200~4000ms. */
  readonly durationMs: number;
}

export const STUDIO_SPACE_EMOTE_MIN_DURATION_MS = 1_200;
export const STUDIO_SPACE_EMOTE_MAX_DURATION_MS = 4_000;

/** 수신 패킷의 만료 시각 계산에 쓰는 안전한 지속 시간. 모르는 값은 기본 2400ms. */
export function studioSpaceEmoteDurationMs(id: string): number {
  const duration = studioSpaceEmoteById(id)?.durationMs ?? 2_400;
  return Math.min(STUDIO_SPACE_EMOTE_MAX_DURATION_MS, Math.max(STUDIO_SPACE_EMOTE_MIN_DURATION_MS, duration));
}

function emote(definition: StudioSpaceEmoteDefinition): StudioSpaceEmoteDefinition {
  return Object.freeze(definition);
}

export const STUDIO_SPACE_EMOTES: readonly StudioSpaceEmoteDefinition[] = Object.freeze([
  emote({ id: "wave", labelKo: "손 흔들기", labelEn: "Wave", glyph: "👋", shortcut: "1", expression: "wave", motion: "pop", durationMs: 2_000 }),
  emote({ id: "heart", labelKo: "하트", labelEn: "Heart", glyph: "❤️", shortcut: "2", expression: "happy", motion: "hop", durationMs: 2_400 }),
  emote({ id: "party", labelKo: "축하해요", labelEn: "Party", glyph: "🎉", shortcut: "3", expression: "happy", motion: "hop", durationMs: 2_800 }),
  emote({ id: "thumbs-up", labelKo: "좋아요", labelEn: "Thumbs up", glyph: "👍", shortcut: "4", expression: "happy", motion: "hop", durationMs: 2_000 }),
  emote({ id: "laugh", labelKo: "웃음", labelEn: "Laugh", glyph: "😂", shortcut: "5", expression: "happy", motion: "hop", durationMs: 2_400 }),
  emote({ id: "clap", labelKo: "박수", labelEn: "Clap", glyph: "👏", shortcut: "6", expression: "happy", motion: "hop", durationMs: 2_200 }),
  emote({ id: "wow", labelKo: "놀람", labelEn: "Wow", glyph: "😮", shortcut: "7", expression: "surprised", motion: "shake", durationMs: 2_000 }),
  emote({ id: "think", labelKo: "생각 중", labelEn: "Thinking", glyph: "🤔", shortcut: "8", expression: "calm", motion: "sway", durationMs: 3_200 }),
  emote({ id: "idea", labelKo: "아이디어", labelEn: "Idea", glyph: "💡", shortcut: "9", expression: "calm", motion: "sway", durationMs: 2_400 }),
  emote({ id: "dance", labelKo: "춤추기", labelEn: "Dance", glyph: "💃", shortcut: "Z", expression: null, motion: "dance", durationMs: 4_000 }),
  emote({ id: "sparkles", labelKo: "반짝반짝", labelEn: "Sparkles", glyph: "✨", shortcut: null, expression: "happy", motion: "hop", durationMs: 2_400 }),
  emote({ id: "question", labelKo: "궁금해요", labelEn: "Question", glyph: "❓", shortcut: null, expression: "surprised", motion: "shake", durationMs: 2_600 }),
  emote({ id: "exclaim", labelKo: "잠깐만요", labelEn: "Heads up", glyph: "❗", shortcut: null, expression: "surprised", motion: "shake", durationMs: 1_800 }),
  emote({ id: "coffee", labelKo: "커피 타임", labelEn: "Coffee break", glyph: "☕", shortcut: null, expression: "calm", motion: "sway", durationMs: 3_200 }),
  emote({ id: "music", labelKo: "음악 감상", labelEn: "Music", glyph: "🎵", shortcut: null, expression: "calm", motion: "sway", durationMs: 3_200 }),
  emote({ id: "sleep", labelKo: "졸려요", labelEn: "Sleepy", glyph: "😴", shortcut: null, expression: "calm", motion: "doze", durationMs: 4_000 }),
]);

const EMOTE_BY_ID: ReadonlyMap<string, StudioSpaceEmoteDefinition> = new Map(
  STUDIO_SPACE_EMOTES.map((definition) => [definition.id, definition] as const),
);
const EMOTE_BY_SHORTCUT: ReadonlyMap<string, StudioSpaceEmoteDefinition> = new Map(
  STUDIO_SPACE_EMOTES.flatMap((definition) => definition.shortcut ? [[definition.shortcut, definition] as const] : []),
);

export function isStudioSpaceEmoteId(value: unknown): value is StudioSpaceEmoteId {
  return typeof value === "string" && EMOTE_BY_ID.has(value);
}

export function studioSpaceEmoteById(id: string): StudioSpaceEmoteDefinition | null {
  return EMOTE_BY_ID.get(id) ?? null;
}

/** "1"~"9"와 "z"/"Z"만 받는다. 그 외 키는 null. */
export function studioSpaceEmoteForKey(key: string): StudioSpaceEmoteDefinition | null {
  if (typeof key !== "string" || key.length !== 1) return null;
  return EMOTE_BY_SHORTCUT.get(key.toUpperCase()) ?? null;
}
