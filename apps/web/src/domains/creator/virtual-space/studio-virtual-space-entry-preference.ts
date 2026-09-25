import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";

export const STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY = "toonspectrum:virtual-space-avatar:v1";
export const STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY = "toonspectrum:virtual-space-entry:v2";
export const STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES = 16;
export const STUDIO_VIRTUAL_SPACE_NICKNAME_MIN_GRAPHEMES = 2;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const NICKNAME_PATTERN = /^[\p{L}\p{N}_\- ]+$/u;
const RESERVED_NICKNAMES = new Set([
  "admin", "administrator", "moderator", "npc", "system", "toonspectrum", "toonstudio",
  "관리자", "운영자", "시스템", "스태프", "엔피시",
]);

export interface StudioVirtualSpaceEntryPreference {
  readonly avatarIndex: number;
  readonly confirmed: boolean;
  readonly nickname: string;
}

function nicknameLength(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }
  return Array.from(value).length;
}

export function normalizeStudioVirtualSpaceNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().replace(/\s+/gu, " ");
  if (!normalized || EMAIL_PATTERN.test(normalized) || !NICKNAME_PATTERN.test(normalized)) return null;
  const count = nicknameLength(normalized);
  if (count < STUDIO_VIRTUAL_SPACE_NICKNAME_MIN_GRAPHEMES || count > STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES) return null;
  if (RESERVED_NICKNAMES.has(normalized.toLocaleLowerCase("en-US"))) return null;
  return normalized;
}

export function studioVirtualSpaceNicknameFromAccount(value: unknown): string | null {
  if (typeof value !== "string" || EMAIL_PATTERN.test(value.trim())) return null;
  return normalizeStudioVirtualSpaceNickname(value);
}

export function validStudioVirtualSpaceAvatarIndex(value: unknown): value is number {
  return Number.isInteger(value)
    && Number(value) >= 0
    && Number(value) < STUDIO_CHARACTER_SKINS.length;
}

export function readStudioVirtualSpaceEntryPreference(): StudioVirtualSpaceEntryPreference {
  if (typeof window === "undefined") {
    return { avatarIndex: -1, confirmed: false, nickname: "" };
  }
  try {
    const saved = window.localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      if (parsed.version === 2 && parsed.confirmed === true && validStudioVirtualSpaceAvatarIndex(parsed.avatarIndex)) {
        return {
          avatarIndex: Number(parsed.avatarIndex),
          confirmed: true,
          nickname: normalizeStudioVirtualSpaceNickname(parsed.nickname) ?? "",
        };
      }
    }
    const legacy = window.localStorage.getItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    if (legacy !== null) {
      const avatarIndex = Number(legacy);
      if (validStudioVirtualSpaceAvatarIndex(avatarIndex)) return { avatarIndex, confirmed: true, nickname: "" };
    }
  } catch {
    // Private browsing or storage denial leaves the character unconfirmed.
  }
  return { avatarIndex: -1, confirmed: false, nickname: "" };
}

export function readStudioVirtualSpaceAvatarIndex(): number {
  return readStudioVirtualSpaceEntryPreference().avatarIndex;
}

export function writeStudioVirtualSpaceEntryPreference(avatarIndex: number, nickname?: string): boolean {
  if (!validStudioVirtualSpaceAvatarIndex(avatarIndex) || typeof window === "undefined") return false;
  const current = readStudioVirtualSpaceEntryPreference();
  const resolvedNickname = nickname === undefined
    ? normalizeStudioVirtualSpaceNickname(current.nickname)
    : normalizeStudioVirtualSpaceNickname(nickname);
  if (nickname !== undefined && !resolvedNickname) return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      confirmed: true,
      avatarIndex,
      ...(resolvedNickname ? { nickname: resolvedNickname } : {}),
    }));
    window.localStorage.setItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY, String(avatarIndex));
    return true;
  } catch {
    return false;
  }
}

export function writeStudioVirtualSpaceAvatarIndex(avatarIndex: number): void {
  void writeStudioVirtualSpaceEntryPreference(avatarIndex);
}
