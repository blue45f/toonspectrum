/** Presentation hints only. These values never authorize media, seats, or collaboration actions. */
export const STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS = Object.freeze([
  "idle", "walk-down", "walk-left", "walk-right", "walk-up", "talk", "draw", "review", "wave", "sit",
] as const);

export type StudioVirtualSpaceAppearanceClip = typeof STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS[number];

export interface StudioVirtualSpaceAppearance {
  readonly skinKey: string;
  readonly registryRevision: string;
  readonly capabilities: readonly StudioVirtualSpaceAppearanceClip[];
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
  readonly issues: readonly StudioVirtualSpaceAppearanceIssue[];
}

const APPEARANCE_KEYS = new Set(["skinKey", "registryRevision", "capabilities"]);
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
  return Object.freeze({
    skinKey: candidate.skinKey,
    registryRevision: candidate.registryRevision,
    capabilities: Object.freeze(capabilities),
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
  const index = Number.isInteger(avatarIndex) && avatarIndex >= 0 ? avatarIndex : identity ? hash >>> 0 : 0;
  return registry.skins[index % registry.skins.length] ?? fallbackSkin(registry);
}

/** Preserve local avatar selection and advertise its key so another registry order cannot change it. */
export function createStudioVirtualSpaceAppearance(
  registry: StudioVirtualSpaceAppearanceRegistry,
  avatarIndex: number,
  identity?: string,
): StudioVirtualSpaceAppearance {
  const skin = legacySkin(registry, avatarIndex, identity);
  const appearance = parseStudioVirtualSpaceAppearance({
    skinKey: skin.key,
    registryRevision: registry.revision,
    capabilities: skin.capabilities,
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
    issues: Object.freeze(issues),
  });
}
