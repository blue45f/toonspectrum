import {
  inspectCharacterCanonicalPartAvailability,
} from "./character-canonical-part-plan";

import type {
  CharacterCanonicalManifestV2,
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartSlot,
} from "./character-canonical-manifest";

export const CHARACTER_PRODUCTION_LIBRARY_SLOTS = Object.freeze([
  "eyes",
  "irises",
  "nose",
  "mouth",
  "ears",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
] as const satisfies readonly CharacterCanonicalPartSlot[]);

const MULTI_LOD_SLOTS = new Set<CharacterCanonicalPartSlot>([
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
]);

export interface CharacterProductionSlotReadiness {
  readonly slot: CharacterCanonicalPartSlot;
  readonly status: "ready" | "degraded" | "missing";
  readonly productionPartCount: number;
  readonly bestQualityScore: number | null;
  readonly reasons: readonly string[];
}

export interface CharacterProductionLibraryReadiness {
  readonly ready: boolean;
  readonly score: number;
  readonly readySlotCount: number;
  readonly degradedSlotCount: number;
  readonly missingSlotCount: number;
  readonly totalSlotCount: number;
  readonly slots: readonly CharacterProductionSlotReadiness[];
  readonly blockers: readonly string[];
}

function hasRequiredGoldenCoverage(part: CharacterCanonicalPartDescriptor): boolean {
  return part.quality.goldenPoseIds.length >= 2 && part.quality.goldenCameraIds.length >= 4;
}

function hasRequiredLodCoverage(part: CharacterCanonicalPartDescriptor): boolean {
  if (!MULTI_LOD_SLOTS.has(part.slot)) return true;
  return part.lods.length >= 3;
}

function isProductionCandidate(
  manifest: CharacterCanonicalManifestV2,
  part: CharacterCanonicalPartDescriptor,
): boolean {
  return inspectCharacterCanonicalPartAvailability(manifest, part).status === "supported"
    && part.quality.accepted
    && part.quality.minimumScore >= 90
    && part.provenance.commercialUse
    && part.provenance.redistribution
    && part.provenance.derivativeUse;
}

function slotReadiness(
  manifest: CharacterCanonicalManifestV2,
  slot: CharacterCanonicalPartSlot,
): CharacterProductionSlotReadiness {
  const candidates = (manifest.parts ?? [])
    .filter((part) => part.slot === slot)
    .filter((part) => isProductionCandidate(manifest, part));
  if (candidates.length === 0) {
    return Object.freeze({
      slot,
      status: "missing",
      productionPartCount: 0,
      bestQualityScore: null,
      reasons: Object.freeze(["승인된 production mesh가 없습니다."]),
    });
  }

  const bestQualityScore = Math.max(...candidates.map((part) => part.quality.minimumScore));
  const hasExcellentQuality = candidates.some((part) => part.quality.minimumScore >= 95);
  const hasGoldenCoverage = candidates.some(hasRequiredGoldenCoverage);
  const hasLodCoverage = candidates.some(hasRequiredLodCoverage);
  const reasons: string[] = [];
  if (!hasExcellentQuality) reasons.push("경쟁 우위 기준 품질 점수 95 이상 에셋이 없습니다.");
  if (!hasGoldenCoverage) reasons.push("골든 포즈 2개·카메라 4개 이상의 검증 커버리지가 없습니다.");
  if (!hasLodCoverage) reasons.push("근·중·원거리 3단계 LOD가 없습니다.");

  return Object.freeze({
    slot,
    status: reasons.length === 0 ? "ready" : "degraded",
    productionPartCount: candidates.length,
    bestQualityScore,
    reasons: Object.freeze(reasons),
  });
}

export function evaluateCharacterProductionLibraryReadiness(
  manifest: CharacterCanonicalManifestV2,
): CharacterProductionLibraryReadiness {
  const slots = CHARACTER_PRODUCTION_LIBRARY_SLOTS.map((slot) => slotReadiness(manifest, slot));
  const readySlotCount = slots.filter((slot) => slot.status === "ready").length;
  const degradedSlotCount = slots.filter((slot) => slot.status === "degraded").length;
  const missingSlotCount = slots.filter((slot) => slot.status === "missing").length;
  const totalSlotCount = slots.length;
  const score = Math.round(((readySlotCount + degradedSlotCount * 0.5) / totalSlotCount) * 100);
  const blockers = slots.flatMap((slot) => (
    slot.status === "ready"
      ? []
      : slot.reasons.map((reason) => `${slot.slot}: ${reason}`)
  ));
  return Object.freeze({
    ready: readySlotCount === totalSlotCount,
    score,
    readySlotCount,
    degradedSlotCount,
    missingSlotCount,
    totalSlotCount,
    slots: Object.freeze(slots),
    blockers: Object.freeze(blockers),
  });
}
