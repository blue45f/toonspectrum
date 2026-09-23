/**
 * Thin adapters between shaper-grade pure session APIs and the production binding/host path.
 *
 * ReferenceDrawer recommend + photo/camera pose call these helpers, then commit through the
 * existing apply-plan / host surface so one undo step restores the prior host snapshot.
 */

import { findCharacterSlotEntry } from "./character-shaper-catalog";
import {
  applyShaperPose,
  applyShaperPosePreset,
  applyShaperPresetSuggestion,
  createShaperCharacter,
  mirrorShaperPose,
  parseShaperCharacter,
  poseFromShaperImage,
  recommendShaperPresets,
  serializeShaperCharacter,
  type ShaperCharacter,
  type ShaperImage,
  type ShaperPose,
  type ShaperPresetSuggestion,
} from "./character-shaper-grade";

import type { CharacterApplyStep, CharacterRecipe } from "./character-shaper-contract";

export interface ShaperGradeRecommendCommit {
  readonly ok: true;
  readonly suggestion: ShaperPresetSuggestion;
  readonly character: ShaperCharacter;
  readonly undo: ShaperCharacter;
  /** Catalog entry ids the binding should commit (face / hair / clothes). */
  readonly entryIds: readonly string[];
  readonly label: string;
}

export interface ShaperGradePoseCommit {
  readonly ok: true;
  readonly character: ShaperCharacter;
  readonly detected: ShaperPose;
  readonly source: "photo" | "camera";
  readonly label: string;
}

export interface ShaperGradeMirrorCommit {
  readonly character: ShaperCharacter;
  readonly undo: ShaperCharacter;
  readonly label: string;
}

export function shaperCharacterFromRecipe(
  recipe: CharacterRecipe,
  pose?: ShaperPose,
): ShaperCharacter {
  const face = recipe.slots["face-shape"] ?? "face-shape:balanced";
  const hair = recipe.slots.hair ?? "hair:short";
  const clothes = recipe.slots.top ?? "top:tshirt";
  return createShaperCharacter({
    face,
    hair: hair ?? "",
    clothes,
    pose,
    recipe,
  });
}

export function serializeShaperSession(character: ShaperCharacter): string {
  return serializeShaperCharacter(character);
}

export function restoreShaperSession(raw: string): ShaperCharacter {
  return parseShaperCharacter(raw);
}

/** Round-trip helper used by dialog open/close and favorites smoke tests. */
export function roundTripShaperSession(character: ShaperCharacter): ShaperCharacter {
  return restoreShaperSession(serializeShaperSession(character));
}

export function slotEntryIdsFromSuggestion(
  suggestion: ShaperPresetSuggestion,
): readonly string[] {
  return [suggestion.face, suggestion.hair, suggestion.clothes].filter((id) =>
    Boolean(findCharacterSlotEntry(id)),
  );
}

export function planShaperGradeRecommend(
  image: ShaperImage,
  character: ShaperCharacter,
): ShaperGradeRecommendCommit | { readonly ok: false; readonly reason: string } {
  const recommendation = recommendShaperPresets(image);
  if (!recommendation.ok) return recommendation;
  const applied = applyShaperPresetSuggestion(character, recommendation.suggestion);
  return {
    ok: true,
    suggestion: recommendation.suggestion,
    character: applied.character,
    undo: applied.undo,
    entryIds: slotEntryIdsFromSuggestion(recommendation.suggestion),
    label: "참고 이미지 프리셋 추천",
  };
}

export function planShaperGradePoseFromImage(
  image: ShaperImage,
  character: ShaperCharacter,
  source: "photo" | "camera" = "photo",
):
  | ShaperGradePoseCommit
  | { readonly ok: false; readonly reason: string; readonly character: ShaperCharacter } {
  const read = poseFromShaperImage(image, character, source);
  if (!read.ok) {
    return { ok: false, reason: read.reason, character: read.character };
  }
  return {
    ok: true,
    character: read.character,
    detected: read.detected,
    source: read.source,
    label: source === "camera" ? "카메라 포즈" : "사진 포즈",
  };
}

export function planShaperGradeMirror(character: ShaperCharacter): ShaperGradeMirrorCommit {
  return {
    character: mirrorShaperPose(character),
    undo: character,
    label: "포즈 좌우 반전",
  };
}

export function planShaperGradePosePreset(
  character: ShaperCharacter,
  presetId: string,
): {
  readonly character: ShaperCharacter;
  readonly steps: readonly CharacterApplyStep[];
  readonly label: string;
} {
  const normalized = presetId.startsWith("pose:") ? presetId.slice("pose:".length) : presetId;
  return {
    character: applyShaperPosePreset(character, presetId),
    steps: [{ kind: "pose-preset", presetId: normalized }],
    label: "포즈 프리셋",
  };
}

export function applyDetectedPoseToCharacter(
  character: ShaperCharacter,
  pose: ShaperPose,
): ShaperCharacter {
  return applyShaperPose(character, pose);
}
