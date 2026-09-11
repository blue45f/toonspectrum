export interface StudioCharacterVariant {
  readonly id: string;
  readonly eyeColor: string | null;
  readonly hairColor: string | null;
  readonly costumeId: string | null;
  readonly maximumBodyRatioDelta: number | null;
}

export interface StudioCharacterReferenceProfile {
  readonly characterId: string;
  readonly eyeColor: string;
  readonly hairColor: string;
  readonly faceShapeId: string;
  readonly defaultCostumeId: string;
  readonly minimumFaceSimilarity: number;
  readonly maximumBodyRatioDelta: number;
  readonly variants: readonly StudioCharacterVariant[];
}

export interface StudioCharacterObservation {
  readonly id: string;
  readonly characterId: string;
  readonly variantId: string | null;
  readonly faceSimilarity: number;
  readonly eyeColor: string;
  readonly hairColor: string;
  readonly faceShapeId: string;
  readonly costumeId: string;
  readonly bodyRatioDelta: number;
}

export interface StudioCharacterConsistencyIssue {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioCharacterConsistencyResult {
  readonly observationId: string;
  readonly characterId: string;
  readonly status: "consistent" | "review" | "blocked";
  readonly score: number;
  readonly appliedVariantId: string | null;
  readonly issues: readonly StudioCharacterConsistencyIssue[];
}

function normalizedColor(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function issue(
  code: string,
  severity: StudioCharacterConsistencyIssue["severity"],
  messageKo: string,
  messageEn: string,
): StudioCharacterConsistencyIssue {
  return Object.freeze({ code, severity, messageKo, messageEn });
}

export function validateStudioCharacterReference(
  profile: StudioCharacterReferenceProfile,
): readonly string[] {
  const issues: string[] = [];
  if (
    !profile.characterId.trim()
    || !profile.eyeColor.trim()
    || !profile.hairColor.trim()
    || !profile.faceShapeId.trim()
    || !profile.defaultCostumeId.trim()
  ) {
    issues.push("profile-required");
  }
  if (!Number.isFinite(profile.minimumFaceSimilarity)
    || profile.minimumFaceSimilarity < 0
    || profile.minimumFaceSimilarity > 1) {
    issues.push("face-similarity-range");
  }
  if (!Number.isFinite(profile.maximumBodyRatioDelta)
    || profile.maximumBodyRatioDelta < 0) {
    issues.push("body-ratio-range");
  }
  const variantIds = profile.variants.map((variant) => variant.id);
  if (new Set(variantIds).size !== variantIds.length || variantIds.some((id) => !id.trim())) {
    issues.push("variant-id");
  }
  for (const variant of profile.variants) {
    if (variant.maximumBodyRatioDelta !== null
      && (!Number.isFinite(variant.maximumBodyRatioDelta)
        || variant.maximumBodyRatioDelta < 0)) {
      issues.push("variant-body-ratio-range");
    }
  }
  return Object.freeze(issues);
}

export function evaluateStudioCharacterConsistency(
  profile: StudioCharacterReferenceProfile,
  observation: StudioCharacterObservation,
): StudioCharacterConsistencyResult {
  if (validateStudioCharacterReference(profile).length > 0) {
    throw new Error("A valid character reference profile is required.");
  }
  if (
    !observation.id.trim()
    || observation.characterId !== profile.characterId
    || !Number.isFinite(observation.faceSimilarity)
    || observation.faceSimilarity < 0
    || observation.faceSimilarity > 1
    || !Number.isFinite(observation.bodyRatioDelta)
    || observation.bodyRatioDelta < 0
  ) {
    throw new Error("Character observation is invalid.");
  }
  const variant = observation.variantId === null
    ? null
    : profile.variants.find((item) => item.id === observation.variantId) ?? null;
  if (observation.variantId !== null && !variant) {
    throw new Error(`Unknown character variant: ${observation.variantId}`);
  }
  const expectedEyeColor = variant?.eyeColor ?? profile.eyeColor;
  const expectedHairColor = variant?.hairColor ?? profile.hairColor;
  const expectedCostumeId = variant?.costumeId ?? profile.defaultCostumeId;
  const maximumBodyRatioDelta = variant?.maximumBodyRatioDelta
    ?? profile.maximumBodyRatioDelta;
  const issues: StudioCharacterConsistencyIssue[] = [];
  if (observation.faceSimilarity < profile.minimumFaceSimilarity) {
    issues.push(issue("face-similarity", "error", "얼굴 특징이 캐릭터 기준과 크게 다릅니다.", "Facial features differ substantially from the character reference."));
  }
  if (observation.faceShapeId !== profile.faceShapeId) {
    issues.push(issue("face-shape", "warning", "얼굴형이 캐릭터 기준과 다릅니다.", "Face shape differs from the character reference."));
  }
  if (normalizedColor(observation.eyeColor) !== normalizedColor(expectedEyeColor)) {
    issues.push(issue("eye-color", "warning", "눈 색상이 캐릭터 설정과 다릅니다.", "Eye color differs from the character reference."));
  }
  if (normalizedColor(observation.hairColor) !== normalizedColor(expectedHairColor)) {
    issues.push(issue("hair-color", "warning", "머리 색상이 캐릭터 설정과 다릅니다.", "Hair color differs from the character reference."));
  }
  if (observation.costumeId !== expectedCostumeId) {
    issues.push(issue("costume", "warning", "의상이 등록된 기본값 또는 변형과 다릅니다.", "Costume differs from the registered default or variant."));
  }
  if (observation.bodyRatioDelta > maximumBodyRatioDelta) {
    issues.push(issue("body-ratio", "error", "신체 비율이 허용 범위를 벗어납니다.", "Body proportions exceed the allowed variation."));
  }
  const deductions = issues.reduce((sum, current) => sum + (current.severity === "error" ? 0.25 : 0.1), 0);
  const score = Math.max(0, Math.min(1, observation.faceSimilarity - deductions));
  const blocked = issues.some((current) => current.severity === "error");
  return Object.freeze({
    observationId: observation.id,
    characterId: observation.characterId,
    status: blocked ? "blocked" : issues.length > 0 ? "review" : "consistent",
    score,
    appliedVariantId: variant?.id ?? null,
    issues: Object.freeze(issues),
  });
}
