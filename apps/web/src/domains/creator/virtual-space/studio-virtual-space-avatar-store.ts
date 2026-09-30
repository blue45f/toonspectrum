import { useCallback, useState } from "react";

import type {
  StudioVirtualAvatarAccessory,
  StudioVirtualAvatarHairStyle,
  StudioVirtualAvatarOutfitStyle,
  StudioVirtualAvatarProfile,
} from "./studio-virtual-space-model";
import { studioVirtualAvatarProfile } from "./studio-virtual-space-model";
import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_ACCENT_OPTIONS,
  STUDIO_AVATAR_EXPRESSION_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
  STUDIO_AVATAR_SKIN_OPTIONS,
} from "./studio-virtual-space-avatar-options";

/**
 * 꾸민 아바타 프로필 저장소
 *
 * `studioVirtualAvatarProfile()`은 identity 해시 기반 결정적 기본값을 만들 뿐,
 * 사용자가 직접 고른 값은 이 모듈이 localStorage에 저장한다.
 * 저장된 값이 있으면 그것을, 없으면 해시 기본값을 사용한다.
 */

const AVATAR_PROFILE_STORAGE_KEY = "toonspectrum:virtual-space-avatar-profile:v1";

/** 저장 형식을 검증한다. 토큰 위조·구버전 값은 버린다. */
export function parseStudioVirtualAvatarProfile(value: unknown): StudioVirtualAvatarProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const skin = STUDIO_AVATAR_SKIN_OPTIONS.find((option) => option.value === candidate.skin);
  const hair = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === candidate.hair);
  const outfit = STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS.find((option) => option.value === candidate.outfit);
  const accent = STUDIO_AVATAR_ACCENT_OPTIONS.find((option) => option.value === candidate.accent);
  const hairStyle = STUDIO_AVATAR_HAIR_STYLE_OPTIONS.find((option) => option.key === candidate.hairStyle);
  const outfitStyle = STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS.find((option) => option.key === candidate.outfitStyle);
  const accessory = STUDIO_AVATAR_ACCESSORY_OPTIONS.find((option) => option.key === candidate.accessory);
  const expression = STUDIO_AVATAR_EXPRESSION_OPTIONS.find((option) => option.key === candidate.expression);
  if (!skin || !hair || !outfit || !accent || !hairStyle || !outfitStyle || !accessory || !expression) return null;
  return Object.freeze({
    skin: skin.value,
    hair: hair.value,
    hairHighlight: hair.highlight,
    outfit: outfit.value,
    accent: accent.value,
    accessory: accessory.key,
    hairStyle: hairStyle.key,
    outfitStyle: outfitStyle.key,
    expression: expression.key,
  });
}

/** 저장된 꾸밈 프로필을 읽는다. 없거나 깨졌으면 null. */
export function readStudioVirtualAvatarProfile(): StudioVirtualAvatarProfile | null {
  try {
    const raw = localStorage.getItem(AVATAR_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return parseStudioVirtualAvatarProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 꾸밈 프로필을 저장한다. 검증에 실패하면 저장하지 않는다. */
export function writeStudioVirtualAvatarProfile(profile: StudioVirtualAvatarProfile): boolean {
  const parsed = parseStudioVirtualAvatarProfile(profile);
  if (!parsed) return false;
  try {
    localStorage.setItem(AVATAR_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

/** 저장된 꾸밈을 지우고 해시 기본값으로 되돌린다. */
export function clearStudioVirtualAvatarProfile(): void {
  try {
    localStorage.removeItem(AVATAR_PROFILE_STORAGE_KEY);
  } catch {
    // 저장소 접근 실패는 무시하고 기본값을 사용한다.
  }
}

/**
 * 실제 사용할 아바타 프로필을 결정한다.
 * 사용자가 꾸민 값이 있으면 그것을, 없으면 identity 해시 기본값을 사용한다.
 * 오피스 입장·프로필 표시 등 모든 표면에서 이 함수로 통일한다.
 */
export function resolveStudioVirtualAvatarProfile(identity: string): StudioVirtualAvatarProfile {
  return readStudioVirtualAvatarProfile() ?? studioVirtualAvatarProfile(identity);
}

/** 랜덤 아바타 프로필을 만든다 (주사위 버튼용). */
export function randomStudioVirtualAvatarProfile(random: () => number = Math.random): StudioVirtualAvatarProfile {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("아바타 옵션 카탈로그가 비어 있습니다.");
    return item;
  };
  const hair = pick(STUDIO_AVATAR_HAIR_COLOR_OPTIONS);
  return Object.freeze({
    skin: pick(STUDIO_AVATAR_SKIN_OPTIONS).value,
    hair: hair.value,
    hairHighlight: hair.highlight,
    outfit: pick(STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS).value,
    accent: pick(STUDIO_AVATAR_ACCENT_OPTIONS).value,
    accessory: pick(STUDIO_AVATAR_ACCESSORY_OPTIONS).key as StudioVirtualAvatarAccessory,
    hairStyle: pick(STUDIO_AVATAR_HAIR_STYLE_OPTIONS).key as StudioVirtualAvatarHairStyle,
    outfitStyle: pick(STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS).key as StudioVirtualAvatarOutfitStyle,
    expression: pick(STUDIO_AVATAR_EXPRESSION_OPTIONS).key,
  });
}

/** React에서 아바타 프로필을 읽고 저장하는 훅. */
export function useStudioVirtualAvatarProfile(identity: string): {
  readonly profile: StudioVirtualAvatarProfile;
  readonly customized: boolean;
  readonly save: (profile: StudioVirtualAvatarProfile) => boolean;
  readonly reset: () => void;
} {
  const [, bumpRevision] = useState(0);
  const saved = readStudioVirtualAvatarProfile();
  const profile = saved ?? studioVirtualAvatarProfile(identity);
  const save = useCallback((next: StudioVirtualAvatarProfile) => {
    const ok = writeStudioVirtualAvatarProfile(next);
    if (ok) bumpRevision((value) => value + 1);
    return ok;
  }, []);
  const reset = useCallback(() => {
    clearStudioVirtualAvatarProfile();
    bumpRevision((value) => value + 1);
  }, []);
  return { profile, customized: saved !== null, save, reset };
}
