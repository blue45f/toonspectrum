import type {
  StudioExportTargetId,
  StudioExportTargetProfile,
} from "./studio-export-preflight";

export interface StudioPlatformPolicy {
  readonly id: string;
  readonly platformId: string;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly target: StudioExportTargetId;
  readonly allowedFormats: readonly string[];
  readonly exactWidth: number | null;
  readonly maxSegmentHeight: number | null;
  readonly maxFileSizeBytes: number | null;
  readonly minimumTextPx: number | null;
  readonly allowedColorSpaces: readonly string[];
  readonly supportedLocales: readonly string[];
  readonly requireReadingOrder: boolean;
  readonly requireRightsClearance: boolean;
  readonly requireAiDisclosure: boolean;
  readonly requireAltText: boolean;
  readonly requireCaptions: boolean;
}

export interface StudioPlatformPolicySelection {
  readonly status: "active" | "upcoming" | "missing";
  readonly policy: StudioPlatformPolicy | null;
}

function validDate(value: string | null): boolean {
  return value !== null && Number.isFinite(Date.parse(value));
}

export function validateStudioPlatformPolicies(
  policies: readonly StudioPlatformPolicy[],
): readonly string[] {
  const issues: string[] = [];
  const ids = policies.map((policy) => policy.id);
  if (new Set(ids).size !== ids.length) issues.push("policy-id-duplicate");
  const platformVersions = policies.map((policy) => `${policy.platformId}\u0000${policy.version}`);
  if (new Set(platformVersions).size !== platformVersions.length) {
    issues.push("platform-version-duplicate");
  }
  for (const policy of policies) {
    if (
      !policy.id.trim()
      || !policy.platformId.trim()
      || !policy.version.trim()
      || !validDate(policy.effectiveFrom)
    ) {
      issues.push("policy-required");
    }
    if (policy.effectiveUntil !== null
      && (!validDate(policy.effectiveUntil)
        || Date.parse(policy.effectiveUntil) <= Date.parse(policy.effectiveFrom))) {
      issues.push("policy-date-range");
    }
    if (policy.allowedFormats.length === 0 || policy.allowedColorSpaces.length === 0) {
      issues.push("policy-output-required");
    }
    if (new Set(policy.supportedLocales).size !== policy.supportedLocales.length) {
      issues.push("policy-locale-duplicate");
    }
    for (const value of [
      policy.exactWidth,
      policy.maxSegmentHeight,
      policy.maxFileSizeBytes,
      policy.minimumTextPx,
    ]) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        issues.push("policy-positive-limit");
      }
    }
  }
  const byPlatform = new Map<string, StudioPlatformPolicy[]>();
  for (const policy of policies) {
    byPlatform.set(policy.platformId, [...(byPlatform.get(policy.platformId) ?? []), policy]);
  }
  for (const platformPolicies of byPlatform.values()) {
    const sorted = [...platformPolicies].sort(
      (left, right) => Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current) continue;
      const previousEnd = previous.effectiveUntil === null
        ? Number.POSITIVE_INFINITY
        : Date.parse(previous.effectiveUntil);
      if (Date.parse(current.effectiveFrom) < previousEnd) issues.push("policy-overlap");
    }
  }
  return Object.freeze([...new Set(issues)]);
}

export function selectStudioPlatformPolicy(
  policies: readonly StudioPlatformPolicy[],
  platformId: string,
  at: string,
): StudioPlatformPolicySelection {
  if (validateStudioPlatformPolicies(policies).length > 0) {
    throw new Error("Platform policies must be valid before selection.");
  }
  if (!platformId.trim() || !validDate(at)) throw new Error("Platform id and date are required.");
  const timestamp = Date.parse(at);
  const candidates = policies
    .filter((policy) => policy.platformId === platformId)
    .sort((left, right) => Date.parse(left.effectiveFrom) - Date.parse(right.effectiveFrom));
  const active = candidates.find((policy) => {
    const start = Date.parse(policy.effectiveFrom);
    const end = policy.effectiveUntil === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(policy.effectiveUntil);
    return start <= timestamp && timestamp < end;
  });
  if (active) return Object.freeze({ status: "active", policy: active });
  const upcoming = candidates.find((policy) => Date.parse(policy.effectiveFrom) > timestamp) ?? null;
  return Object.freeze({ status: upcoming ? "upcoming" : "missing", policy: upcoming });
}

export function studioPlatformPolicyToExportProfile(
  policy: StudioPlatformPolicy,
): StudioExportTargetProfile {
  if (validateStudioPlatformPolicies([policy]).length > 0) {
    throw new Error("A valid platform policy is required.");
  }
  return Object.freeze({
    id: policy.target,
    policyVersion: policy.version,
    labelKo: policy.platformId,
    labelEn: policy.platformId,
    allowedFormats: Object.freeze([...policy.allowedFormats]),
    ...(policy.exactWidth === null ? {} : { exactWidth: policy.exactWidth }),
    ...(policy.maxSegmentHeight === null ? {} : { maxSegmentHeight: policy.maxSegmentHeight }),
    ...(policy.maxFileSizeBytes === null ? {} : { maxFileSizeBytes: policy.maxFileSizeBytes }),
    ...(policy.minimumTextPx === null ? {} : { minimumTextPx: policy.minimumTextPx }),
    allowedColorSpaces: Object.freeze([...policy.allowedColorSpaces]),
    requireReadingOrder: policy.requireReadingOrder,
    requireRightsClearance: policy.requireRightsClearance,
    requireAiDisclosure: policy.requireAiDisclosure,
    requireAltText: policy.requireAltText,
    requireCaptions: policy.requireCaptions,
    preserveEditableStructure: false,
  });
}
