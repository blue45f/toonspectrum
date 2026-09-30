/**
 * 가상 스튜디오 포스트잇(스티키 노트) 순수 로직.
 *
 * P2P 보드(`studio-virtual-space-p2p-board.ts`)의 note 엔티티와 상호 변환할 수 있는
 * 칸반 스타일 스티키 노트 모델이다. 모든 함수는 불변(immutable) 객체를 반환하며
 * 네트워크·DOM에 의존하지 않는다.
 */
import {
  STUDIO_P2P_BOARD_COLORS,
  type StudioP2pBoardColor,
  type StudioP2pBoardNote,
} from "./studio-virtual-space-p2p-board";

/** 스티키 노트 전용 파스텔 6색 팔레트. */
export const STUDIO_STICKY_NOTE_COLORS = [
  "#ffd166",
  "#ffb3c7",
  "#b8e986",
  "#a8d8ff",
  "#d7a6ff",
  "#ffc78f",
] as const;
export type StudioStickyNoteColor = (typeof STUDIO_STICKY_NOTE_COLORS)[number];

export const STUDIO_STICKY_NOTE_MAX_TEXT_LENGTH = 160;
export const STUDIO_STICKY_NOTE_DEFAULT_WIDTH = 0.17;
export const STUDIO_STICKY_NOTE_DEFAULT_HEIGHT = 0.13;
export const STUDIO_STICKY_NOTE_MIN_WIDTH = 0.08;
export const STUDIO_STICKY_NOTE_MAX_WIDTH = 0.46;
export const STUDIO_STICKY_NOTE_MIN_HEIGHT = 0.06;
export const STUDIO_STICKY_NOTE_MAX_HEIGHT = 0.5;

export interface StudioStickyNote {
  readonly id: string;
  /** 보드 단위 좌표(0..1) 기준 좌상단 위치. */
  readonly x: number;
  readonly y: number;
  /** 보드 단위 좌표(0..1) 기준 크기. */
  readonly width: number;
  readonly height: number;
  readonly color: StudioStickyNoteColor;
  readonly text: string;
  readonly authorSessionId: string;
  readonly authorName: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 칸반 "완료" 체크 상태. */
  readonly done: boolean;
}

export interface StudioStickyNoteCreateInput {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color?: StudioStickyNoteColor;
  readonly width?: number;
  readonly height?: number;
  readonly authorSessionId: string;
  readonly authorName: string;
  /** 테스트 주입용. 미지정 시 현재 시각. */
  readonly nowMs?: number;
  /** 테스트 주입용. 미지정 시 생성. */
  readonly id?: string;
}

const COLOR_SET = new Set<string>(STUDIO_STICKY_NOTE_COLORS);
const BOARD_COLOR_SET = new Set<string>(STUDIO_P2P_BOARD_COLORS);

const isUnit = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function makeId(explicit?: string): string {
  if (explicit && explicit.trim().length > 0 && explicit.length <= 80) return explicit.trim();
  const random = globalThis.crypto?.randomUUID?.();
  return typeof random === "string" && random.length > 0 ? random : `sticky-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function freezeNote(note: StudioStickyNote): StudioStickyNote {
  return Object.freeze({ ...note });
}

/**
 * 스티키 노트를 생성한다. 입력이 유효하지 않으면 null을 반환한다.
 */
export function createStickyNote(input: StudioStickyNoteCreateInput): StudioStickyNote | null {
  const text = input.text.trim();
  const color = input.color ?? STUDIO_STICKY_NOTE_COLORS[0];
  if (
    !isUnit(input.x)
    || !isUnit(input.y)
    || !isNonEmptyText(text)
    || text.length > STUDIO_STICKY_NOTE_MAX_TEXT_LENGTH
    || !COLOR_SET.has(color)
    || !isNonEmptyText(input.authorSessionId)
    || !isNonEmptyText(input.authorName)
  ) return null;
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const width = clamp(round3(input.width ?? STUDIO_STICKY_NOTE_DEFAULT_WIDTH), STUDIO_STICKY_NOTE_MIN_WIDTH, STUDIO_STICKY_NOTE_MAX_WIDTH);
  const height = clamp(round3(input.height ?? STUDIO_STICKY_NOTE_DEFAULT_HEIGHT), STUDIO_STICKY_NOTE_MIN_HEIGHT, STUDIO_STICKY_NOTE_MAX_HEIGHT);
  return freezeNote({
    id: makeId(input.id),
    x: clamp(round3(input.x), 0, 1 - width),
    y: clamp(round3(input.y), 0, 1 - height),
    width,
    height,
    color,
    text,
    authorSessionId: input.authorSessionId.trim(),
    authorName: input.authorName.trim(),
    createdAt: now,
    updatedAt: now,
    done: false,
  });
}

/**
 * 스티키 노트를 드래그 이동한다. 보드 밖으로 나가지 않도록 위치를 보정한다.
 */
export function moveStickyNote(note: StudioStickyNote, x: number, y: number, nowMs?: number): StudioStickyNote {
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  return freezeNote({
    ...note,
    x: clamp(round3(x), 0, 1 - note.width),
    y: clamp(round3(y), 0, 1 - note.height),
    updatedAt: now,
  });
}

/**
 * 스티키 노트 크기를 조절한다. 최소·최대 범위 안으로 보정한다.
 */
export function resizeStickyNote(note: StudioStickyNote, width: number, height: number, nowMs?: number): StudioStickyNote {
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  const nextWidth = clamp(round3(width), STUDIO_STICKY_NOTE_MIN_WIDTH, STUDIO_STICKY_NOTE_MAX_WIDTH);
  const nextHeight = clamp(round3(height), STUDIO_STICKY_NOTE_MIN_HEIGHT, STUDIO_STICKY_NOTE_MAX_HEIGHT);
  return freezeNote({
    ...note,
    width: nextWidth,
    height: nextHeight,
    x: clamp(note.x, 0, 1 - nextWidth),
    y: clamp(note.y, 0, 1 - nextHeight),
    updatedAt: now,
  });
}

/**
 * 스티키 노트 본문을 편집한다. 빈 문자열·제한 초과 입력은 무시하고 원본을 반환한다.
 */
export function editStickyNoteText(note: StudioStickyNote, text: string, nowMs?: number): StudioStickyNote {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > STUDIO_STICKY_NOTE_MAX_TEXT_LENGTH) return note;
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  return freezeNote({ ...note, text: trimmed, updatedAt: now });
}

/**
 * 칸반 "완료" 체크를 토글한다.
 */
export function toggleStickyNoteDone(note: StudioStickyNote, nowMs?: number): StudioStickyNote {
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  return freezeNote({ ...note, done: !note.done, updatedAt: now });
}

/**
 * 색상을 변경한다. 팔레트 밖의 색상은 무시하고 원본을 반환한다.
 */
export function recolorStickyNote(note: StudioStickyNote, color: StudioStickyNoteColor, nowMs?: number): StudioStickyNote {
  if (!COLOR_SET.has(color)) return note;
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  return freezeNote({ ...note, color, updatedAt: now });
}

export function removeStickyNote(
  notes: readonly StudioStickyNote[],
  id: string,
): readonly StudioStickyNote[] {
  return Object.freeze(notes.filter((note) => note.id !== id));
}

/**
 * 칸반 정렬: 미완료가 먼저, 그 안에서는 최근 수정 순.
 */
export function sortStickyNotesKanban(notes: readonly StudioStickyNote[]): readonly StudioStickyNote[] {
  return Object.freeze([...notes].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  }));
}

/** P2P 보드 note 색상과 스티키 노트 색상의 상호 변환표. */
const STICKY_TO_BOARD_COLOR: Record<StudioStickyNoteColor, StudioP2pBoardColor> = {
  "#ffd166": "#ffd166",
  "#ffb3c7": "#f78c6b",
  "#b8e986": "#83d8c5",
  "#a8d8ff": "#8fb3ff",
  "#d7a6ff": "#d7a6ff",
  "#ffc78f": "#f78c6b",
};
const BOARD_TO_STICKY_COLOR: Record<StudioP2pBoardColor, StudioStickyNoteColor> = {
  "#ffd166": "#ffd166",
  "#f78c6b": "#ffb3c7",
  "#83d8c5": "#b8e986",
  "#8fb3ff": "#a8d8ff",
  "#d7a6ff": "#d7a6ff",
  "#f3f4f6": "#ffc78f",
};

export interface StudioStickyToBoardNoteInput {
  /** 보드 note 중심 좌표(0..1). */
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly color: StudioP2pBoardColor;
}

/**
 * 스티키 노트를 P2P 보드의 `addNote(x, y, text, color)` 입력 형태로 변환한다.
 * 보드 note는 중심 좌표만 가지므로 스티키의 중심점을 사용한다.
 */
export function stickyNoteToBoardNoteInput(note: StudioStickyNote): StudioStickyToBoardNoteInput {
  return {
    x: round3(clamp(note.x + note.width / 2, 0, 1)),
    y: round3(clamp(note.y + note.height / 2, 0, 1)),
    text: note.text,
    color: STICKY_TO_BOARD_COLOR[note.color],
  };
}

/**
 * P2P 보드의 note 엔티티를 스티키 노트로 변환한다.
 * 보드 note에 크기가 없으므로 기본 크기를 부여한다.
 */
export function boardNoteToStickyNote(
  entity: StudioP2pBoardNote,
  authorName: string,
  nowMs?: number,
): StudioStickyNote | null {
  if (!entity || entity.kind !== "note" || !BOARD_COLOR_SET.has(entity.color)) return null;
  return createStickyNote({
    x: entity.x,
    y: entity.y,
    text: entity.text,
    color: BOARD_TO_STICKY_COLOR[entity.color],
    authorSessionId: entity.ownerSessionId,
    authorName,
    nowMs,
    id: `imported-${entity.id}`,
  });
}

/**
 * 임의의 보드 엔티티가 note인지 판별하는 타입 가드.
 */
export function isBoardNoteEntity(entity: { readonly kind: string }): entity is StudioP2pBoardNote {
  return entity.kind === "note";
}
