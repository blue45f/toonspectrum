import { STUDIO_VIRTUAL_SPACE_AUTO_AVATAR } from "./studio-virtual-space-model";
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";

export const STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY = "toonspectrum:virtual-space-avatar:v1";
export const STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY = "toonspectrum:virtual-space-entry:v2";

export interface StudioVirtualSpaceEntryPreference {
  readonly avatarIndex: number;
  readonly confirmed: boolean;
}

export function validStudioVirtualSpaceAvatarIndex(value: unknown): value is number {
  return Number.isInteger(value)
    && Number(value) >= STUDIO_VIRTUAL_SPACE_AUTO_AVATAR
    && Number(value) < STUDIO_CHARACTER_SKINS.length;
}

export function readStudioVirtualSpaceEntryPreference(): StudioVirtualSpaceEntryPreference {
  if (typeof window === "undefined") {
    return { avatarIndex: STUDIO_VIRTUAL_SPACE_AUTO_AVATAR, confirmed: false };
  }
  try {
    const saved = window.localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      if (parsed.version === 2 && parsed.confirmed === true && validStudioVirtualSpaceAvatarIndex(parsed.avatarIndex)) {
        return { avatarIndex: Number(parsed.avatarIndex), confirmed: true };
      }
    }
    const legacy = window.localStorage.getItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    if (legacy !== null) {
      const avatarIndex = Number(legacy);
      if (validStudioVirtualSpaceAvatarIndex(avatarIndex)) return { avatarIndex, confirmed: true };
    }
  } catch {
    // Private browsing/storage denial keeps a safe session-only choice.
  }
  return { avatarIndex: STUDIO_VIRTUAL_SPACE_AUTO_AVATAR, confirmed: false };
}

export function readStudioVirtualSpaceAvatarIndex(): number {
  return readStudioVirtualSpaceEntryPreference().avatarIndex;
}

export function writeStudioVirtualSpaceEntryPreference(avatarIndex: number): boolean {
  if (!validStudioVirtualSpaceAvatarIndex(avatarIndex) || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY, JSON.stringify({
      version: 2,
      confirmed: true,
      avatarIndex,
    }));
    if (avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR) {
      window.localStorage.removeItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    } else {
      window.localStorage.setItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY, String(avatarIndex));
    }
    return true;
  } catch {
    return false;
  }
}

export function writeStudioVirtualSpaceAvatarIndex(avatarIndex: number): void {
  void writeStudioVirtualSpaceEntryPreference(avatarIndex);
}
