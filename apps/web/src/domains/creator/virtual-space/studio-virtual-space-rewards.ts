import type {
  StudioVirtualAccessoryKey,
  StudioVirtualAuraKey,
  StudioVirtualCharacterCustomization,
  StudioVirtualNameplateKey,
  StudioVirtualTrailKey,
} from "./studio-virtual-space-customization";

export const STUDIO_VIRTUAL_REWARD_IDS = [
  "navigator-badge", "review-sparkle", "producer-title", "team-emote", "explorer-frame", "decorator-pin",
  "storyboard-badge", "color-swatch", "expression-emote", "archivist-pin", "architect-frame", "team-banner",
] as const;
export type StudioVirtualRewardId = typeof STUDIO_VIRTUAL_REWARD_IDS[number];

export interface StudioVirtualRewardDefinition {
  readonly id: StudioVirtualRewardId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cosmetic: Partial<{
    accessoryKey: StudioVirtualAccessoryKey;
    auraKey: StudioVirtualAuraKey;
    trailKey: StudioVirtualTrailKey;
    nameplateKey: StudioVirtualNameplateKey;
  }>;
}

export interface StudioVirtualRewardInventory {
  readonly version: 1;
  readonly unlocked: readonly StudioVirtualRewardId[];
}
export const STUDIO_VIRTUAL_REWARDS: readonly StudioVirtualRewardDefinition[] = Object.freeze([
  { id: "navigator-badge", labelKo: "길잡이 배지", labelEn: "Navigator badge", cosmetic: { nameplateKey: "sky" } },
  { id: "review-sparkle", labelKo: "리뷰 반짝임", labelEn: "Review sparkle", cosmetic: { auraKey: "sparkle" } },
  { id: "producer-title", labelKo: "프로듀서 타이틀", labelEn: "Producer title", cosmetic: { nameplateKey: "amber" } },
  { id: "team-emote", labelKo: "팀 별빛", labelEn: "Team starlight", cosmetic: { trailKey: "star" } },
  { id: "explorer-frame", labelKo: "탐험가 프레임", labelEn: "Explorer frame", cosmetic: { nameplateKey: "violet" } },
  { id: "decorator-pin", labelKo: "데코레이터 핀", labelEn: "Decorator pin", cosmetic: { accessoryKey: "star" } },
  { id: "storyboard-badge", labelKo: "스토리보드 배지", labelEn: "Storyboard badge", cosmetic: { accessoryKey: "beret" } },
  { id: "color-swatch", labelKo: "컬러 스와치", labelEn: "Color swatch", cosmetic: { trailKey: "petal" } },
  { id: "expression-emote", labelKo: "표정 오라", labelEn: "Expression aura", cosmetic: { auraKey: "focus" } },
  { id: "archivist-pin", labelKo: "아키비스트 핀", labelEn: "Archivist pin", cosmetic: { accessoryKey: "glasses" } },
  { id: "architect-frame", labelKo: "아키텍트 프레임", labelEn: "Architect frame", cosmetic: { nameplateKey: "rose" } },
  { id: "team-banner", labelKo: "팀 배너 트레일", labelEn: "Team banner trail", cosmetic: { trailKey: "pixel" } },
]);

const STORAGE_KEY = "toonspectrum:virtual-space-rewards:v1";
const EMPTY_INVENTORY: StudioVirtualRewardInventory = Object.freeze({ version: 1, unlocked: Object.freeze([]) });
const rewardIds = new Set<string>(STUDIO_VIRTUAL_REWARD_IDS);

export function studioVirtualRewardById(id: StudioVirtualRewardId): StudioVirtualRewardDefinition {
  return STUDIO_VIRTUAL_REWARDS.find((reward) => reward.id === id)!;
}
export function parseStudioVirtualRewardInventory(value: unknown): StudioVirtualRewardInventory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.unlocked) || candidate.unlocked.length > STUDIO_VIRTUAL_REWARD_IDS.length) return null;
  const unlocked = candidate.unlocked.filter((id): id is StudioVirtualRewardId => typeof id === "string" && rewardIds.has(id));
  if (unlocked.length !== candidate.unlocked.length) return null;
  return Object.freeze({ version: 1, unlocked: Object.freeze([...new Set(unlocked)]) });
}

export function readStudioVirtualRewardInventory(): StudioVirtualRewardInventory {
  if (typeof window === "undefined") return EMPTY_INVENTORY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseStudioVirtualRewardInventory(JSON.parse(raw)) ?? EMPTY_INVENTORY : EMPTY_INVENTORY;
  } catch {
    return EMPTY_INVENTORY;
  }
}

export function writeStudioVirtualRewardInventory(value: StudioVirtualRewardInventory): boolean {
  const parsed = parseStudioVirtualRewardInventory(value);
  if (!parsed || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
export function unlockStudioVirtualReward(
  inventory: StudioVirtualRewardInventory,
  id: StudioVirtualRewardId,
): StudioVirtualRewardInventory {
  if (inventory.unlocked.includes(id)) return inventory;
  return Object.freeze({ version: 1, unlocked: Object.freeze([...inventory.unlocked, id]) });
}

export function applyStudioVirtualReward(
  customization: StudioVirtualCharacterCustomization,
  id: StudioVirtualRewardId,
): StudioVirtualCharacterCustomization {
  return Object.freeze({ ...customization, ...studioVirtualRewardById(id).cosmetic });
}

export function studioVirtualRewardUnlocked(
  inventory: StudioVirtualRewardInventory,
  id: StudioVirtualRewardId,
): boolean {
  return inventory.unlocked.includes(id);
}
