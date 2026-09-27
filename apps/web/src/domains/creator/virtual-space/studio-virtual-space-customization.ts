import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { STUDIO_TOWN_DISTRICT_IDS, type StudioTownDistrictId } from "./studio-virtual-space-town-layout";

export const STUDIO_VIRTUAL_ACCESSORY_KEYS = ["none", "headset", "beret", "star", "glasses"] as const;
export const STUDIO_VIRTUAL_AURA_KEYS = ["none", "sparkle", "focus", "neon"] as const;
export const STUDIO_VIRTUAL_TRAIL_KEYS = ["none", "petal", "star", "pixel"] as const;
export const STUDIO_VIRTUAL_NAMEPLATE_KEYS = ["violet", "rose", "sky", "amber"] as const;
export type StudioVirtualAccessoryKey = typeof STUDIO_VIRTUAL_ACCESSORY_KEYS[number];
export type StudioVirtualAuraKey = typeof STUDIO_VIRTUAL_AURA_KEYS[number];
export type StudioVirtualTrailKey = typeof STUDIO_VIRTUAL_TRAIL_KEYS[number];
export type StudioVirtualNameplateKey = typeof STUDIO_VIRTUAL_NAMEPLATE_KEYS[number];

export interface StudioVirtualCharacterCustomization {
  readonly accessoryKey: StudioVirtualAccessoryKey;
  readonly auraKey: StudioVirtualAuraKey;
  readonly trailKey: StudioVirtualTrailKey;
  readonly nameplateKey: StudioVirtualNameplateKey;
}

export const DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION: StudioVirtualCharacterCustomization = Object.freeze({
  accessoryKey: "none",
  auraKey: "none",
  trailKey: "none",
  nameplateKey: "violet",
});

export const STUDIO_VIRTUAL_DECOR_TYPES = [
  "tree", "flower-bed", "bench", "lamp", "banner", "market-stall",
  "fountain", "portal", "rug", "sign", "parasol", "pet",
  "drawing-desk", "bookshelf", "review-board", "sofa",
] as const;
export type StudioVirtualDecorType = typeof STUDIO_VIRTUAL_DECOR_TYPES[number];
export type StudioVirtualDecorPresetKey = "minimal" | "creator-garden" | "festival" | "night-market";
export type StudioVirtualBackgroundPresentationMode = "minimal" | "decorated" | "festival";

export interface StudioVirtualDecorPlacement extends StudioVirtualSpacePoint {
  readonly id: string;
  readonly type: StudioVirtualDecorType;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly scale: number;
}

export interface StudioVirtualDecorationState {
  readonly presetKey: StudioVirtualDecorPresetKey;
  readonly districtKey: StudioTownDistrictId;
  readonly presentationMode: StudioVirtualBackgroundPresentationMode;
  readonly placements: readonly StudioVirtualDecorPlacement[];
  readonly revision: number;
  /** 이전 저장본은 1280×960 좌표이며, 새 배치는 실제 월드 크기를 함께 저장한다. */
  readonly layoutWidth?: number;
  readonly layoutHeight?: number;
}

const CHARACTER_STORAGE_KEY = "toonspectrum:virtual-space-character-customization:v1";
const DECOR_STORAGE_KEY = "toonspectrum:virtual-space-decoration:v1";
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const MAX_DECORATIONS = 36;
const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 960;

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function parseStudioVirtualCharacterCustomization(value: unknown): StudioVirtualCharacterCustomization | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!oneOf(STUDIO_VIRTUAL_ACCESSORY_KEYS, candidate.accessoryKey)
    || !oneOf(STUDIO_VIRTUAL_AURA_KEYS, candidate.auraKey)
    || !oneOf(STUDIO_VIRTUAL_TRAIL_KEYS, candidate.trailKey)
    || !oneOf(STUDIO_VIRTUAL_NAMEPLATE_KEYS, candidate.nameplateKey)) return null;
  return Object.freeze({
    accessoryKey: candidate.accessoryKey,
    auraKey: candidate.auraKey,
    trailKey: candidate.trailKey,
    nameplateKey: candidate.nameplateKey,
  });
}

function parsePlacement(value: unknown, width: number, height: number): StudioVirtualDecorPlacement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !TOKEN.test(candidate.id)
    || !oneOf(STUDIO_VIRTUAL_DECOR_TYPES, candidate.type)
    || typeof candidate.x !== "number" || !Number.isFinite(candidate.x)
    || typeof candidate.y !== "number" || !Number.isFinite(candidate.y)
    || candidate.x < 0 || candidate.x > width
    || candidate.y < 0 || candidate.y > height
    || typeof candidate.rotation !== "number" || ![0, 90, 180, 270].includes(candidate.rotation)
    || typeof candidate.scale !== "number" || !Number.isFinite(candidate.scale) || candidate.scale < .65 || candidate.scale > 1.35) return null;
  return Object.freeze({
    id: candidate.id,
    type: candidate.type,
    x: Math.round(candidate.x),
    y: Math.round(candidate.y),
    rotation: candidate.rotation as 0 | 90 | 180 | 270,
    scale: Math.round(candidate.scale * 100) / 100,
  });
}

export function parseStudioVirtualDecorationState(value: unknown): StudioVirtualDecorationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!["minimal", "creator-garden", "festival", "night-market"].includes(String(candidate.presetKey))
    || !Array.isArray(candidate.placements) || candidate.placements.length > MAX_DECORATIONS
    || typeof candidate.revision !== "number" || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0) return null;
  const presetKey = candidate.presetKey as StudioVirtualDecorPresetKey;
  const districtKey = oneOf(STUDIO_TOWN_DISTRICT_IDS, candidate.districtKey) ? candidate.districtKey : "commons-market";
  const fallbackMode: StudioVirtualBackgroundPresentationMode = presetKey === "minimal" ? "minimal"
    : presetKey === "festival" || presetKey === "night-market" ? "festival" : "decorated";
  const presentationMode = oneOf(["minimal", "decorated", "festival"] as const, candidate.presentationMode)
    ? candidate.presentationMode : fallbackMode;
  const hasDimensions = candidate.layoutWidth !== undefined || candidate.layoutHeight !== undefined;
  const dimension = (value: unknown): value is number => typeof value === "number"
    && Number.isSafeInteger(value) && value >= 32 && value <= 10000;
  if (hasDimensions && (!dimension(candidate.layoutWidth) || !dimension(candidate.layoutHeight))) return null;
  const width = dimension(candidate.layoutWidth) ? candidate.layoutWidth : WORLD_WIDTH;
  const height = dimension(candidate.layoutHeight) ? candidate.layoutHeight : WORLD_HEIGHT;
  const placements = candidate.placements.map((item) => parsePlacement(item, width, height));
  if (placements.some((item) => !item)) return null;
  const valid = placements as StudioVirtualDecorPlacement[];
  if (new Set(valid.map((item) => item.id)).size !== valid.length) return null;
  return Object.freeze({
    presetKey,
    districtKey,
    presentationMode,
    placements: Object.freeze(valid),
    revision: candidate.revision,
    ...(hasDimensions ? { layoutWidth: width, layoutHeight: height } : {}),
  });
}

function safeRead(key: string): unknown {
  if (typeof window === "undefined") return null;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function writeCharacterCustomization(value: StudioVirtualCharacterCustomization): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function decorationStorageKey(scope?: string): string {
  return scope ? `${DECOR_STORAGE_KEY}:${encodeURIComponent(scope)}` : DECOR_STORAGE_KEY;
}

function writeDecorationState(value: StudioVirtualDecorationState, scope?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(decorationStorageKey(scope), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStudioVirtualCharacterCustomization(): StudioVirtualCharacterCustomization {
  return parseStudioVirtualCharacterCustomization(safeRead(CHARACTER_STORAGE_KEY))
    ?? DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION;
}

export function writeStudioVirtualCharacterCustomization(value: StudioVirtualCharacterCustomization): boolean {
  const parsed = parseStudioVirtualCharacterCustomization(value);
  return parsed ? writeCharacterCustomization(parsed) : false;
}

function placement(id: string, type: StudioVirtualDecorType, x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0, scale = 1): StudioVirtualDecorPlacement {
  return Object.freeze({ id, type, x, y, rotation, scale });
}

export function studioVirtualDecorationPreset(key: StudioVirtualDecorPresetKey): StudioVirtualDecorationState {
  const placements: readonly StudioVirtualDecorPlacement[] = key === "minimal" ? []
    : key === "creator-garden" ? [
      placement("garden-tree-west", "tree", 570, 670, 0, .95),
      placement("garden-tree-east", "tree", 930, 680, 0, .9),
      placement("garden-flower-a", "flower-bed", 575, 735, 0, .85),
      placement("garden-flower-b", "flower-bed", 950, 740, 0, .85),
      placement("garden-bench", "bench", 690, 760, 0, .9),
      placement("garden-lamp", "lamp", 875, 760, 0, .9),
      placement("garden-pet", "pet", 535, 720, 0, .8),
    ] : key === "festival" ? [
      placement("festival-banner-a", "banner", 645, 620, 0, .85),
      placement("festival-banner-b", "banner", 915, 620, 0, .85),
      placement("festival-stall-a", "market-stall", 575, 775, 0, .8),
      placement("festival-stall-b", "market-stall", 990, 775, 0, .8),
      placement("festival-parasol", "parasol", 505, 680, 0, .85),
      placement("festival-rug", "rug", 780, 780, 0, .85),
      placement("festival-sign", "sign", 780, 835, 0, .72),
    ] : [
      placement("night-stall-a", "market-stall", 565, 765, 0, .84),
      placement("night-stall-b", "market-stall", 990, 765, 0, .84),
      placement("night-lamp-a", "lamp", 625, 690, 0, .92),
      placement("night-lamp-b", "lamp", 935, 690, 0, .92),
      placement("night-banner", "banner", 780, 625, 0, .88),
      placement("night-portal", "portal", 780, 805, 0, .76),
      placement("night-pet", "pet", 540, 710, 0, .78),
    ];
  const districtKey: StudioTownDistrictId = key === "creator-garden" ? "atelier-gardens"
    : key === "festival" ? "sky-port" : key === "night-market" ? "commons-market" : "story-terrace";
  const presentationMode: StudioVirtualBackgroundPresentationMode = key === "minimal" ? "minimal"
    : key === "creator-garden" ? "decorated" : "festival";
  return Object.freeze({ presetKey: key, districtKey, presentationMode, placements: Object.freeze(placements), revision: Date.now() });
}

export function readStudioVirtualDecorationState(scope?: string): StudioVirtualDecorationState {
  if (scope && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(decorationStorageKey(scope));
      if (raw !== null) return parseStudioVirtualDecorationState(JSON.parse(raw)) ?? studioVirtualDecorationPreset("creator-garden");
    } catch { return studioVirtualDecorationPreset("creator-garden"); }
  }
  return parseStudioVirtualDecorationState(safeRead(DECOR_STORAGE_KEY)) ?? studioVirtualDecorationPreset("creator-garden");
}

export function writeStudioVirtualDecorationState(value: StudioVirtualDecorationState, scope?: string): boolean {
  const parsed = parseStudioVirtualDecorationState(value);
  return parsed ? writeDecorationState(parsed, scope) : false;
}

export function addStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  type: StudioVirtualDecorType,
  point: StudioVirtualSpacePoint,
): StudioVirtualDecorationState {
  if (current.placements.length >= MAX_DECORATIONS || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return current;
  const offset = current.placements.length % 6;
  let suffix = current.placements.length;
  const prefix = `decor-${Date.now().toString(36)}`;
  while (current.placements.some((item) => item.id === `${prefix}-${suffix}`)) suffix += 1;
  const candidate = placement(
    `${prefix}-${suffix}`,
    type,
    Math.max(24, Math.min((current.layoutWidth ?? WORLD_WIDTH) - 24, Math.round(point.x + 38 + offset * 7))),
    Math.max(24, Math.min((current.layoutHeight ?? WORLD_HEIGHT) - 24, Math.round(point.y + 25 + offset * 5))),
    0,
    1,
  );
  return Object.freeze({
    ...current,
    placements: Object.freeze([...current.placements, candidate]),
    revision: current.revision + 1,
  });
}

export function removeStudioVirtualDecoration(current: StudioVirtualDecorationState, id: string): StudioVirtualDecorationState {
  if (!TOKEN.test(id)) return current;
  return Object.freeze({
    ...current,
    placements: Object.freeze(current.placements.filter((item) => item.id !== id)),
    revision: current.revision + 1,
  });
}

export const STUDIO_VIRTUAL_DECOR_FRAME: Readonly<Record<StudioVirtualDecorType, number>> = Object.freeze({
  tree: 0, "flower-bed": 1, bench: 2, lamp: 3, banner: 4, "market-stall": 5,
  fountain: 6, portal: 7, rug: 8, sign: 9, parasol: 10, pet: 11,
  "drawing-desk": 12, bookshelf: 13, "review-board": 14, sofa: 15,
});

export const STUDIO_VIRTUAL_ACCESSORY_FRAME: Readonly<Record<StudioVirtualAccessoryKey, number>> = Object.freeze({
  none: 0, headset: 1, beret: 2, star: 3, glasses: 4,
});
