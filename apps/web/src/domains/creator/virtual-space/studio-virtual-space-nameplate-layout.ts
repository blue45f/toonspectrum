import type { StudioVirtualNameplateMode } from "./studio-virtual-space-experience-preference";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

export type StudioVirtualNameplateLod = "full" | "compact" | "dot" | "hidden";

export interface StudioVirtualNameplatePresentation {
  readonly lod: StudioVirtualNameplateLod;
  readonly visible: boolean;
  readonly text: string;
  readonly alpha: number;
  readonly scale: number;
}

/** 명시적 사용자 상태 접미사. available은 접미사 없음. */
const NAMEPLATE_USER_STATUS_SUFFIX: Record<StudioUserStatus, string> = {
  available: "",
  "in-meeting": " · MEETING",
  away: " · AWAY",
  break: " · BREAK",
};

export function studioVirtualDisambiguatedName(
  name: string,
  sessionId: string,
  duplicateCount: number,
): string {
  if (duplicateCount <= 1) return name;
  const suffix = sessionId.replace(/[^a-z0-9]/giu, "").slice(-4).toUpperCase() || "0000";
  return `${name} · ${suffix}`;
}

export function studioVirtualNameplatePresentation(input: {
  readonly name: string;
  readonly sessionId: string;
  readonly duplicateCount: number;
  readonly distance: number;
  readonly mode: StudioVirtualNameplateMode;
  readonly important?: boolean;
  readonly activity?: "available" | "focused" | "reviewing" | "away";
  /**
   * 명시적 사용자 상태 (presence `userStatus` 필드). 있으면 활동 접미사를 덮어쓴다.
   * 팀원 목록의 `teammateStatusBadge`와 같은 override 의미다.
   * B 트랙은 피어 presence state의 `userStatus`를 그대로 넘기면 된다.
   */
  readonly userStatus?: StudioUserStatus;
}): StudioVirtualNameplatePresentation {
  const distance = Number.isFinite(input.distance) ? Math.max(0, input.distance) : Number.POSITIVE_INFINITY;
  let lod: StudioVirtualNameplateLod;
  if (input.mode !== "auto") lod = input.mode;
  else if (input.important || distance <= 170) lod = "full";
  else if (distance <= 340) lod = "compact";
  else if (distance <= 560) lod = "dot";
  else lod = "hidden";
  const status = input.userStatus !== undefined
    ? NAMEPLATE_USER_STATUS_SUFFIX[input.userStatus]
    : input.activity === "focused" ? " · FOCUS"
    : input.activity === "reviewing" ? " · REVIEW"
      : input.activity === "away" ? " · AWAY" : "";
  const fullName = studioVirtualDisambiguatedName(input.name, input.sessionId, input.duplicateCount);
  const text = lod === "full" ? `${fullName}${status}` : lod === "compact" ? fullName : lod === "dot" ? "●" : "";
  return Object.freeze({
    lod,
    visible: lod !== "hidden",
    text,
    alpha: lod === "full" ? 1 : lod === "compact" ? .86 : lod === "dot" ? .68 : 0,
    scale: lod === "full" ? 1 : lod === "compact" ? .88 : .72,
  });
}

export interface StudioVirtualNameplateCandidate {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly priority: number;
}

export interface StudioVirtualNameplateOffset {
  readonly x: number;
  readonly y: number;
}

function overlaps(a: StudioVirtualNameplateCandidate, b: StudioVirtualNameplateCandidate): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 3;
}

/** Greedy screen-space decluttering; higher-priority labels stay closest to their actor. */
export function layoutStudioVirtualNameplates(
  candidates: readonly StudioVirtualNameplateCandidate[],
): ReadonlyMap<string, StudioVirtualNameplateOffset> {
  const placed: StudioVirtualNameplateCandidate[] = [];
  const result = new Map<string, StudioVirtualNameplateOffset>();
  const ordered = [...candidates].sort((left, right) => right.priority - left.priority || right.y - left.y || left.id.localeCompare(right.id));
  for (const candidate of ordered) {
    let shifted = candidate;
    let offsetY = 0;
    for (let attempt = 0; attempt < 6 && placed.some((entry) => overlaps(shifted, entry)); attempt += 1) {
      offsetY -= candidate.height + 3;
      shifted = { ...candidate, y: candidate.y + offsetY };
    }
    placed.push(shifted);
    result.set(candidate.id, Object.freeze({ x: 0, y: offsetY }));
  }
  return result;
}

/** 이름표가 완전히 보이는 최대 거리. */
export const STUDIO_NAMEPLATE_FADE_FULL_DISTANCE = 240;
/** 이 거리부터 이름표가 완전히 사라진다. */
export const STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE = 620;

/**
 * 거리 기반 연속 페이드 alpha (0~1).
 * FULL_DISTANCE 안은 1, HIDDEN_DISTANCE 밖은 0, 사이는 코사인 폴오프로
 * LOD 경계에서 끊기지 않고 부드럽게 사라진다.
 * 기존 `studioVirtualNameplatePresentation`의 계단식 alpha와 곱해서 쓴다.
 */
export function studioVirtualNameplateDistanceAlpha(distance: number): number {
  const safe = Number.isFinite(distance) ? Math.max(0, distance) : Number.POSITIVE_INFINITY;
  if (safe <= STUDIO_NAMEPLATE_FADE_FULL_DISTANCE) return 1;
  if (safe >= STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE) return 0;
  const t = (safe - STUDIO_NAMEPLATE_FADE_FULL_DISTANCE)
    / (STUDIO_NAMEPLATE_FADE_HIDDEN_DISTANCE - STUDIO_NAMEPLATE_FADE_FULL_DISTANCE);
  return (1 + Math.cos(t * Math.PI)) / 2;
}

export type StudioNameplateRole = "owner" | "admin" | "moderator" | "member" | "guest";

export interface StudioNameplateRoleBadge {
  readonly role: StudioNameplateRole;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 뱃지 배경색. */
  readonly color: string;
}

/**
 * 역할 뱃지. member/guest/미지정은 뱃지를 표시하지 않으므로 null.
 */
export function studioVirtualNameplateRoleBadge(
  role: StudioNameplateRole | undefined,
): StudioNameplateRoleBadge | null {
  switch (role) {
    case "owner":
      return { role, labelKo: "소유자", labelEn: "Owner", color: "#f59e0b" };
    case "admin":
      return { role, labelKo: "관리자", labelEn: "Admin", color: "#8b5cf6" };
    case "moderator":
      return { role, labelKo: "모더레이터", labelEn: "Mod", color: "#0ea5e9" };
    default:
      return null;
  }
}

/** 말풍선 최대 글자 수 (이름표 너비에 맞춤). */
export const STUDIO_NAMEPLATE_BUBBLE_MAX_CHARS = 42;

/** 말풍선 텍스트를 한 줄로 다듬고 길면 …으로 자른다. */
export function truncateStudioNameplateBubble(text: string, maxChars: number = STUDIO_NAMEPLATE_BUBBLE_MAX_CHARS): string {
  const singleLine = text.trim().replace(/\s+/gu, " ");
  const chars = [...singleLine];
  if (chars.length <= maxChars) return singleLine;
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

export interface StudioNameplateBubblePlacement {
  /** 말풍선 박스 중심 x. */
  readonly x: number;
  /** 말풍선 꼬리 끝 y (이름표 위쪽). */
  readonly y: number;
  readonly text: string;
}

/**
 * 이름표 위에 말풍선을 올릴 위치를 계산한다.
 * 텍스트가 비어 있으면 null (말풍선을 띄우지 않는다).
 */
export function layoutStudioNameplateBubble(
  nameplateCenterX: number,
  nameplateTopY: number,
  rawText: string,
  bubbleHeight: number,
): StudioNameplateBubblePlacement | null {
  const text = truncateStudioNameplateBubble(rawText);
  if (text.length === 0) return null;
  const height = Number.isFinite(bubbleHeight) && bubbleHeight > 0 ? bubbleHeight : 28;
  return Object.freeze({
    x: nameplateCenterX,
    y: nameplateTopY - height - 6,
    text,
  });
}
