import {
  AVATAR_FORGE_VERSION,
  sanitizeAvatarForgeState,
  type AvatarForgeHairParams,
} from "./studio-vrm-avatar-forge";

export interface StudioVrmHairTransitionPlan {
  readonly version: 1;
  readonly previousIdentity: string | null;
  readonly identity: string;
  readonly styleChanged: boolean;
  readonly geometryChanged: boolean;
  readonly visibilityChanged: boolean;
  readonly shouldRender: boolean;
  /** A style/shape replacement must not reuse spring or geometry state owned by the previous hair. */
  readonly resetDynamicState: boolean;
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function normalizedHair(hair: AvatarForgeHairParams): AvatarForgeHairParams {
  return sanitizeAvatarForgeState({
    version: AVATAR_FORGE_VERSION,
    hair,
  }).hair;
}

/**
 * Identity of the generated hair surface only. `replaceOriginal` deliberately stays out: toggling
 * the source VRM visibility must not rebuild and reallocate an otherwise identical generated mesh.
 */
export function buildStudioVrmHairGeometryIdentity(
  hairInput: AvatarForgeHairParams,
): string {
  const hair = normalizedHair(hairInput);
  const payload = {
    style: hair.style,
    volume: hair.volume,
    length: hair.length,
    strandWidth: hair.strandWidth,
    fringe: hair.fringe,
    curl: hair.curl,
    shine: hair.shine,
    baseColor: hair.baseColor.toLowerCase(),
    shadowColor: hair.shadowColor?.toLowerCase() ?? null,
    tipColor: hair.tipColor.toLowerCase(),
    bangStyle: hair.bangStyle,
    wave: hair.wave,
    ahoge: hair.ahoge,
    tailHeight: hair.tailHeight,
  };
  return `hair-geometry-v1:${hash(JSON.stringify(payload))}`;
}

export function planStudioVrmHairTransition(
  previousInput: AvatarForgeHairParams | null | undefined,
  nextInput: AvatarForgeHairParams,
): StudioVrmHairTransitionPlan {
  const next = normalizedHair(nextInput);
  const previous = previousInput ? normalizedHair(previousInput) : null;
  const identity = buildStudioVrmHairGeometryIdentity(next);
  const previousIdentity = previous ? buildStudioVrmHairGeometryIdentity(previous) : null;
  const geometryChanged = previousIdentity !== identity;
  return Object.freeze({
    version: 1,
    previousIdentity,
    identity,
    styleChanged: previous?.style !== next.style,
    geometryChanged,
    visibilityChanged: previous?.replaceOriginal !== next.replaceOriginal,
    shouldRender: next.style !== "none",
    resetDynamicState: geometryChanged,
  });
}
