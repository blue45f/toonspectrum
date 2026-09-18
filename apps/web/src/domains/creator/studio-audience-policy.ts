export const STUDIO_CONTENT_RATINGS = ["all", "12", "15", "19"] as const;
export type StudioContentRating = (typeof STUDIO_CONTENT_RATINGS)[number];

export const STUDIO_CONTENT_ADVISORIES = [
  "violence",
  "horror",
  "language",
  "mature-theme",
  "substance",
  "gambling",
  "self-harm",
] as const;
export type StudioContentAdvisory = (typeof STUDIO_CONTENT_ADVISORIES)[number];

export type StudioRestrictedMediaClassification =
  | "general"
  | "self-restricted"
  | "officially-restricted"
  | "unknown";

export interface StudioAudiencePolicy {
  readonly version: 1;
  readonly rating: StudioContentRating;
  readonly advisories: readonly StudioContentAdvisory[];
  readonly restrictedMediaClassification: StudioRestrictedMediaClassification;
  readonly adultAccessGateEnabled: boolean;
  readonly identityVerificationRequired: boolean;
  readonly notes: string;
}

export interface StudioAudiencePolicyReport {
  readonly status: "ready" | "review" | "blocked";
  readonly issues: readonly string[];
  readonly requiresAdultGate: boolean;
  readonly requiresIdentityVerification: boolean;
}

export function createStudioAudiencePolicy(): StudioAudiencePolicy {
  return Object.freeze({
    version: 1,
    rating: "all",
    advisories: Object.freeze([]),
    restrictedMediaClassification: "general",
    adultAccessGateEnabled: false,
    identityVerificationRequired: false,
    notes: "",
  });
}

export function audiencePolicyStorageKey(projectId: string): string {
  return `toonstudio:audience-policy:v1:${encodeURIComponent(projectId)}`;
}

export function evaluateStudioAudiencePolicy(
  policy: StudioAudiencePolicy,
): StudioAudiencePolicyReport {
  const issues: string[] = [];
  const officiallyRestricted = policy.restrictedMediaClassification === "officially-restricted";
  const restricted = policy.rating === "19"
    || officiallyRestricted
    || policy.restrictedMediaClassification === "self-restricted";
  const requiresIdentityVerification = officiallyRestricted;

  if (officiallyRestricted && policy.rating !== "19") issues.push("official-restriction-rating-must-be-19");
  if (restricted && !policy.adultAccessGateEnabled) issues.push("adult-access-gate-required");
  if (requiresIdentityVerification && !policy.identityVerificationRequired) {
    issues.push("age-and-identity-verification-required");
  }
  if (policy.restrictedMediaClassification === "unknown") {
    issues.push("classification-review-required");
  }
  if (policy.rating !== "all" && policy.advisories.length === 0) {
    issues.push("content-advisory-recommended");
  }

  const blocked = issues.some((issue) =>
    issue === "official-restriction-rating-must-be-19"
    || issue === "adult-access-gate-required"
    || issue === "age-and-identity-verification-required"
  );
  return Object.freeze({
    status: blocked ? "blocked" : issues.length > 0 ? "review" : "ready",
    issues: Object.freeze(issues),
    requiresAdultGate: restricted,
    requiresIdentityVerification,
  });
}
