/**
 * Character Shaper — hand-pose card glyph tables.
 *
 * One row per `CharacterHandPoseType`, derived from the finger eulers `applyHandPosePreset`
 * (useStudioVrmPoserPoseEdit.ts) writes: curl ≈ mean joint flexion / 85°, so a card predicts the
 * shape the runtime actually produces instead of a generic hand icon. Pure data — no DOM, no
 * three.js — so the preview renderer and its tests stay in the node environment.
 */
import type { CharacterHandPoseType } from "./character-shaper-contract";

/** Per-finger curl, thumb → little, 0 = fully extended, 1 = folded into the palm. */
export type CharacterHandGlyphCurls = readonly [number, number, number, number, number];

/** Small object drawn with the hand so grips read as what they hold. */
export type CharacterHandGlyphProp = "phone" | "pen" | "cup" | "rod" | "heart" | "ring";

export interface CharacterHandGlyphLayout {
  readonly curls: CharacterHandGlyphCurls;
  /** 0 = fingers parallel, 1 = fully fanned. */
  readonly spread: number;
  /** Thumb direction in degrees from straight up; negative leans away from the fingers. */
  readonly thumbAngle: number;
  readonly prop: CharacterHandGlyphProp | null;
}

export const CHARACTER_HAND_GLYPH_POSE_TYPES: readonly CharacterHandPoseType[] = Object.freeze([
  "fist",
  "open",
  "point",
  "peace",
  "thumbsUp",
  "holding",
  "phoneGrip",
  "penGrip",
  "fingerHeart",
  "cupGrip",
  "rockRoll",
  "okSign",
  "relaxed",
]);

function layout(
  curls: CharacterHandGlyphCurls,
  spread: number,
  thumbAngle: number,
  prop: CharacterHandGlyphProp | null = null,
): CharacterHandGlyphLayout {
  return Object.freeze({ curls: Object.freeze(curls) as CharacterHandGlyphCurls, spread, thumbAngle, prop });
}

/*
 * Curl reference (runtime eulers → 0..1):
 *   fist / point / peace / thumbsUp / rockRoll: 85° on every segment → 1
 *   holding 68/75/55 → 0.78 · phoneGrip index 32/28/15 → 0.29, others 65/60/40 → 0.65
 *   penGrip index 45/52/22 → 0.47, middle 50/58/35 → 0.56, ring·little 78 → 0.92
 *   fingerHeart index 38/48/15 → 0.4, others 82 → 0.96 · cupGrip 52/45/25 → 0.48
 *   okSign index 58/55/38 → 0.59, others −8 → 0 · relaxed 20 → 0.24
 */
const HAND_GLYPH_TABLE: Readonly<Record<CharacterHandPoseType, CharacterHandGlyphLayout>> = Object.freeze({
  fist: layout([0.9, 1, 1, 1, 1], 0, 35),
  open: layout([0, 0, 0, 0, 0], 1, -55),
  point: layout([0.6, 0, 1, 1, 1], 0.15, -25),
  peace: layout([0.7, 0, 0, 1, 1], 0.75, 20),
  thumbsUp: layout([0, 1, 1, 1, 1], 0, -8),
  holding: layout([0.85, 0.8, 0.8, 0.8, 0.8], 0.05, 30, "rod"),
  phoneGrip: layout([0.35, 0.3, 0.65, 0.65, 0.65], 0.2, -10, "phone"),
  penGrip: layout([0.55, 0.47, 0.56, 0.92, 0.92], 0.2, 15, "pen"),
  fingerHeart: layout([0.6, 0.4, 0.96, 0.96, 0.96], 0.15, 25, "heart"),
  cupGrip: layout([0.4, 0.48, 0.48, 0.48, 0.48], 0.15, 0, "cup"),
  rockRoll: layout([0.85, 0, 1, 1, 0], 0.7, 30),
  okSign: layout([0.7, 0.6, 0, 0, 0], 0.65, 20, "ring"),
  relaxed: layout([0.2, 0.24, 0.24, 0.24, 0.24], 0.35, -40),
});

/** Full glyph layout; unknown ids (foreign catalog data) fall back to the relaxed hand. */
export function characterHandGlyphLayout(poseType: CharacterHandPoseType): CharacterHandGlyphLayout {
  return HAND_GLYPH_TABLE[poseType] ?? HAND_GLYPH_TABLE.relaxed;
}

/** Thumb → little finger curls in 0..1. */
export function characterHandGlyphCurls(poseType: CharacterHandPoseType): CharacterHandGlyphCurls {
  return characterHandGlyphLayout(poseType).curls;
}

/** Finger fan amount in 0..1. */
export function characterHandGlyphSpread(poseType: CharacterHandPoseType): number {
  return characterHandGlyphLayout(poseType).spread;
}
