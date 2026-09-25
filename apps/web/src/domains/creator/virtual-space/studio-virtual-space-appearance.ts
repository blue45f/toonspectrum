import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  STUDIO_VIRTUAL_ACCESSORY_KEYS,
  STUDIO_VIRTUAL_AURA_KEYS,
  STUDIO_VIRTUAL_NAMEPLATE_KEYS,
  STUDIO_VIRTUAL_TRAIL_KEYS,
  type StudioVirtualCharacterCustomization,
} from "./studio-virtual-space-customization";

/** Presentation hints only. These values never authorize media, seats, or collaboration actions. */
export const STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS = Object.freeze([
  "idle", "walk-down", "walk-left", "walk-right", "walk-up", "talk", "draw", "review", "wave", "sit",
] as const);

export type StudioVirtualSpaceAppearanceClip = typeof STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS[number];

export interface StudioVirtualSpaceAppearance {
  readonly skinKey: string;
  readonly registryRevision: string;
  readonly capabilities: readonly StudioVirtualSpaceAppearanceClip[];
  readonly accessoryKey?: StudioVirtualCharacterCustomization["accessoryKey"];
  readonly auraKey?: StudioVirtualCharacterCustomization["auraKey"];
  readonly trailKey?: StudioVirtualCharacterCustomization["trailKey"];
  readonly nameplateKey?: StudioVirtualCharacterCustomization["nameplateKey"];
}

/** Supplied by the local, bundled registry. Remote packets cannot extend this registry. */
export interface StudioVirtualSpaceAppearanceRegistry {
  readonly revision: string;
  readonly fallbackSkinKey: string;
  readonly skins: readonly {
    readonly key: string;
    readonly capabilities: readonly StudioVirtualSpaceAppearanceClip[];
  }[];
}

export type StudioVirtualSpaceAppearanceIssue =
  | "legacy-index"
  | "invalid-appearance"
  | "unknown-skin"
  | "registry-mismatch"
  | "unsupported-clip";

export interface StudioVirtualSpaceResolvedAppearance {
  readonly skinKey: string;
  readonly clip: StudioVirtualSpaceAppearanceClip;
  readonly capabilities: readonly StudioVirtualSpaceAppearanceClip[];
  readonly source: "stable-key" | "legacy-index";
  readonly accessoryKey: StudioVirtualCharacterCustomization["accessoryKey"];
  readonly auraKey: StudioVirtualCharacterCustomization["auraKey"];
  readonly trailKey: StudioVirtualCharacterCustomization["trailKey"];
  readonly nameplateKey: StudioVirtualCharacterCustomization["nameplateKey"];
  readonly issues: readonly StudioVirtualSpaceAppearanceIssue[];
}

const APPEARANCE_KEYS = new Set(["skinKey", "registryRevision", "capabilities", "accessoryKey", "auraKey", "trailKey", "nameplateKey"]);
const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const MAX_ADVERTISED_CAPABILITIES = 16;

/** Only canonical identifiers cross the wire; asset URLs and arbitrary feature flags do not. */
export function parseStudioVirtualSpaceAppearance(value: unknown): StudioVirtualSpaceAppearance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some((key) => !APPEARANCE_KEYS.has(key))
    || typeof candidate.skinKey !== "string" || !TOKEN.test(candidate.skinKey)
    || typeof candidate.registryRevision !== "string" || !TOKEN.test(candidate.registryRevision)
    || !Array.isArray(candidate.capabilities)
    || candidate.capabilities.length > MAX_ADVERTISED_CAPABILITIES
    || candidate.capabilities.some((capability) => typeof capability !== "string" || !TOKEN.test(capability))
  ) return null;

  // Future presentation tokens can be ignored by an older client. No unknown token survives
  // into the runtime, including tokens that resemble permissions such as camera or seat-owner.
  const advertised = candidate.capabilities;
  const capabilities = STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS.filter((clip) => advertised.includes(clip));
  const optionalToken = <T extends readonly string[]>(values: T, value: unknown): T[number] | undefined =>
    typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : undefined;
  if ((candidate.accessoryKey !== undefined && optionalToken(STUDIO_VIRTUAL_ACCESSORY_KEYS, candidate.accessoryKey) === undefined)
    || (candidate.auraKey !== undefined && optionalToken(STUDIO_VIRTUAL_AURA_KEYS, candidate.auraKey) === undefined)
    || (candidate.trailKey !== undefined && optionalToken(STUDIO_VIRTUAL_TRAIL_KEYS, candidate.trailKey) === undefined)
    || (candidate.nameplateKey !== undefined && optionalToken(STUDIO_VIRTUAL_NAMEPLATE_KEYS, candidate.nameplateKey) === undefined)) return null;
  return Object.freeze({
    skinKey: candidate.skinKey,
    registryRevision: candidate.registryRevision,
    capabilities: Object.freeze(capabilities),
    ...(candidate.accessoryKey ? { accessoryKey: optionalToken(STUDIO_VIRTUAL_ACCESSORY_KEYS, candidate.accessoryKey) } : {}),
    ...(candidate.auraKey ? { auraKey: optionalToken(STUDIO_VIRTUAL_AURA_KEYS, candidate.auraKey) } : {}),
    ...(candidate.trailKey ? { trailKey: optionalToken(STUDIO_VIRTUAL_TRAIL_KEYS, candidate.trailKey) } : {}),
    ...(candidate.nameplateKey ? { nameplateKey: optionalToken(STUDIO_VIRTUAL_NAMEPLATE_KEYS, candidate.nameplateKey) } : {}),
  });
}

function fallbackSkin(registry: StudioVirtualSpaceAppearanceRegistry) {
  const fallback = registry.skins.find((skin) => skin.key === registry.fallbackSkinKey);
  if (!fallback) throw new Error("Virtual Studio appearance registry needs a registered fallback skin");
  return fallback;
}

function legacySkin(registry: StudioVirtualSpaceAppearanceRegistry, avatarIndex: number, identity?: string) {
  let hash = 2166136261;
  for (const char of identity ?? "") {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const explicit = Number.isInteger(avatarIndex) && avatarIndex >= 0;
  const index = explicit ? avatarIndex : identity ? hash >>> 0 : 0;
  // Preserve the established automatic identity mapping; generated bonus skins are explicit choices.
  const candidates = explicit ? registry.skins : registry.skins.filter((skin) => skin.key !== "imagegen25");
  return candidates[index % candidates.length] ?? fallbackSkin(registry);
}

/** Preserve local avatar selection and advertise its key so another registry order cannot change it. */
export function createStudioVirtualSpaceAppearance(
  registry: StudioVirtualSpaceAppearanceRegistry,
  avatarIndex: number,
  identity?: string,
  customization: StudioVirtualCharacterCustomization = DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
): StudioVirtualSpaceAppearance {
  const skin = legacySkin(registry, avatarIndex, identity);
  const appearance = parseStudioVirtualSpaceAppearance({
    skinKey: skin.key,
    registryRevision: registry.revision,
    capabilities: skin.capabilities,
    accessoryKey: customization.accessoryKey,
    auraKey: customization.auraKey,
    trailKey: customization.trailKey,
    nameplateKey: customization.nameplateKey,
  });
  if (!appearance) throw new Error("Virtual Studio appearance registry contains invalid presentation identifiers");
  return appearance;
}

/** Resolve against local assets and the common presentation capabilities, never a peer-provided URL. */
export function resolveStudioVirtualSpaceAppearance(
  registry: StudioVirtualSpaceAppearanceRegistry,
  state: { readonly avatarIndex: number; readonly appearance?: StudioVirtualSpaceAppearance },
  identity?: string,
  requestedClip: StudioVirtualSpaceAppearanceClip = "idle",
): StudioVirtualSpaceResolvedAppearance {
  const issues: StudioVirtualSpaceAppearanceIssue[] = [];
  const appearance = state.appearance === undefined ? undefined : parseStudioVirtualSpaceAppearance(state.appearance);
  const source = state.appearance === undefined ? "legacy-index" : "stable-key";
  let skin;
  if (appearance === undefined) {
    skin = legacySkin(registry, state.avatarIndex, identity);
    issues.push("legacy-index");
  } else if (appearance === null) {
    skin = fallbackSkin(registry);
    issues.push("invalid-appearance");
  } else {
    skin = registry.skins.find((entry) => entry.key === appearance.skinKey);
    if (!skin) {
      skin = fallbackSkin(registry);
      issues.push("unknown-skin");
    }
    if (appearance.registryRevision !== registry.revision) issues.push("registry-mismatch");
  }
  const capabilities = STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS.filter((clip) =>
    clip === "idle" || (appearance !== null && skin.capabilities.includes(clip)
      && (appearance === undefined || appearance.capabilities.includes(clip))),
  );
  const clip = capabilities.includes(requestedClip) ? requestedClip : "idle";
  if (clip !== requestedClip) issues.push("unsupported-clip");
  return Object.freeze({
    skinKey: skin.key,
    clip,
    capabilities: Object.freeze(capabilities),
    source,
    accessoryKey: appearance?.accessoryKey ?? DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION.accessoryKey,
    auraKey: appearance?.auraKey ?? DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION.auraKey,
    trailKey: appearance?.trailKey ?? DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION.trailKey,
    nameplateKey: appearance?.nameplateKey ?? DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION.nameplateKey,
    issues: Object.freeze(issues),
  });
}
