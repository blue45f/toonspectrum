import { sha256HexPortable } from "./studio-sha256";
import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  parseAvatarForgeState,
  serializeAvatarForgeState,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  admitStudioVrmAvatarReferenceCatalogue,
  isStudioVrmAvatarReferenceRecommendationReceipt,
  type StudioVrmAvatarReferenceCatalogue,
  type StudioVrmAvatarReferenceRecommendationReceipt,
} from "./studio-vrm-avatar-reference-recommendation";

/**
 * The tracked VRM used for a future, reproducible preset render catalogue.
 *
 * This is deliberately an exact content authority rather than a mutable URL. A catalogue build
 * must hash the source bytes before rendering and must use the fixed camera/lighting contract
 * below. `public/vrm/LICENSES.md` documents the bundled VRoidPreset terms.
 */
export const STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY = Object.freeze({
  sourceAssetId: "avatar-a",
  sourceUrl: "/vrm/AvatarSample_A.vrm",
  sourceByteLength: 15_096_320,
  sourceSha256: "b86b0b8a66d48911431d6f920a5211a974226f83aa672eca3f3dfade58ac346e",
  rendererId: "toonspectrum-avatar-forge-front",
  rendererRevision: "1",
  width: 512,
  height: 512,
  camera: "front-head-and-shoulders",
  lighting: "neutral-three-point",
  background: "#f3f0e8",
} as const);

export interface StudioVrmAvatarReferenceCanonicalRenderEntry {
  readonly presetId: string;
  readonly presetStateSha256: string;
  readonly referenceImageSha256: string;
}

export interface StudioVrmAvatarReferenceCatalogueEnvelope {
  readonly authority: typeof STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY;
  readonly renders: readonly StudioVrmAvatarReferenceCanonicalRenderEntry[];
  readonly catalogue: StudioVrmAvatarReferenceCatalogue;
}

export interface StudioVrmAvatarReferenceProductSelection {
  readonly presetId: string;
  readonly state: AvatarForgeState;
  readonly receipt: StudioVrmAvatarReferenceRecommendationReceipt;
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const textEncoder = new TextEncoder();
const PRESET_IDS = Object.freeze(AVATAR_FORGE_PRESETS.map(({ id }) => id).sort());

function snapshotsMatch(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function exactStringArrayMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function studioVrmAvatarReferencePresetStateSha256(presetId: string): string | null {
  if (!AVATAR_FORGE_PRESETS.some((preset) => preset.id === presetId)) return null;
  const canonical = serializeAvatarForgeState(createAvatarForgeState(presetId));
  return sha256HexPortable(textEncoder.encode(JSON.stringify(canonical)));
}

/**
 * Admits output from the offline catalogue build lane.
 *
 * The build lane must render every current preset against the exact tracked VRM authority, hash
 * each transient 512x512 render, embed it with the pinned MediaPipe model, and then discard the
 * render pixels. Runtime ships only this bounded envelope. A partial shelf, stale preset state,
 * altered source model, or untraceable render is rejected instead of silently degrading ranking.
 */
export function admitStudioVrmAvatarReferenceCatalogueEnvelope(
  value: unknown,
): StudioVrmAvatarReferenceCatalogueEnvelope | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<StudioVrmAvatarReferenceCatalogueEnvelope>;
  if (!snapshotsMatch(candidate.authority, STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY)) {
    return null;
  }
  if (!Array.isArray(candidate.renders) || candidate.renders.length !== PRESET_IDS.length) {
    return null;
  }

  let catalogue: StudioVrmAvatarReferenceCatalogue;
  try {
    catalogue = admitStudioVrmAvatarReferenceCatalogue(candidate.catalogue);
  } catch {
    return null;
  }
  const catalogueIds = catalogue.entries.map(({ presetId }) => presetId).sort();
  if (!exactStringArrayMatch(catalogueIds, PRESET_IDS)) return null;

  const renderIds = new Set<string>();
  const imageHashes = new Set<string>();
  const renders: StudioVrmAvatarReferenceCanonicalRenderEntry[] = [];
  for (const raw of candidate.renders) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const entry = raw as Partial<StudioVrmAvatarReferenceCanonicalRenderEntry>;
    if (
      typeof entry.presetId !== "string"
      || renderIds.has(entry.presetId)
      || !catalogueIds.includes(entry.presetId)
      || typeof entry.presetStateSha256 !== "string"
      || entry.presetStateSha256 !== studioVrmAvatarReferencePresetStateSha256(entry.presetId)
      || typeof entry.referenceImageSha256 !== "string"
      || !SHA256_HEX.test(entry.referenceImageSha256)
      || imageHashes.has(entry.referenceImageSha256)
    ) return null;
    renderIds.add(entry.presetId);
    imageHashes.add(entry.referenceImageSha256);
    renders.push(Object.freeze({
      presetId: entry.presetId,
      presetStateSha256: entry.presetStateSha256,
      referenceImageSha256: entry.referenceImageSha256,
    }));
  }
  if (!exactStringArrayMatch([...renderIds].sort(), PRESET_IDS)) return null;

  return Object.freeze({
    authority: STUDIO_VRM_AVATAR_REFERENCE_CANONICAL_RENDER_AUTHORITY,
    renders: Object.freeze(renders.sort((left, right) =>
      left.presetId.localeCompare(right.presetId, "en"),
    )),
    catalogue,
  });
}

/**
 * No approved render envelope exists in the repository yet. Keeping this explicit `null` is the
 * product fail-closed state: the panel reports unavailability and never falls back to fabricated
 * vectors or home-grown image heuristics.
 */
export const STUDIO_VRM_AVATAR_REFERENCE_APPROVED_CATALOGUE:
  StudioVrmAvatarReferenceCatalogue | null = null;

/**
 * Resolves a receipt-bound recommendation into an appearance-only Avatar Forge state.
 * The current body/proportion authority is retained so applying a style cannot unexpectedly
 * rebuild the humanoid rig. The host commits the returned state as one explicit Undo command.
 */
export function resolveStudioVrmAvatarReferenceAppearanceState(input: {
  readonly current: AvatarForgeState;
  readonly selection: StudioVrmAvatarReferenceProductSelection;
  readonly catalogue: StudioVrmAvatarReferenceCatalogue | null;
}): AvatarForgeState | null {
  if (!input.catalogue) return null;
  let catalogue: StudioVrmAvatarReferenceCatalogue;
  try {
    catalogue = admitStudioVrmAvatarReferenceCatalogue(input.catalogue);
  } catch {
    return null;
  }
  const { selection } = input;
  if (!isStudioVrmAvatarReferenceRecommendationReceipt(selection.receipt)) return null;
  const catalogueIds = catalogue.entries.map(({ presetId }) => presetId).sort();
  if (
    selection.receipt.catalogueRevision !== catalogue.catalogueRevision
    || !exactStringArrayMatch(selection.receipt.cataloguePresetIds, catalogueIds)
    || !selection.receipt.recommendations.some(({ presetId }) => presetId === selection.presetId)
  ) return null;

  const canonicalPreset = createAvatarForgeState(selection.presetId);
  if (
    canonicalPreset.presetId !== selection.presetId
    || !snapshotsMatch(serializeAvatarForgeState(selection.state), canonicalPreset)
  ) return null;

  const current = parseAvatarForgeState(input.current);
  return serializeAvatarForgeState({
    ...canonicalPreset,
    // A style recommendation does not own the current body or rig proportions.
    presetId: undefined,
    bodyPresetId: current.bodyPresetId,
    body: current.body,
    proportions: current.proportions,
    ...(current.legacyHipWidth === undefined
      ? { legacyHipWidth: undefined }
      : { legacyHipWidth: current.legacyHipWidth }),
  });
}
