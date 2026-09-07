export const STUDIO_ASSET_REFERENCE_VERSION = 2 as const;

export type StudioAssetOrigin =
  | "upload"
  | "generated"
  | "marketplace"
  | "built-in"
  | "external-captured";

export type StudioAssetLicenseDecision = "allowed" | "prohibited" | "unknown";

export interface StudioAssetReferenceV2 {
  readonly version: typeof STUDIO_ASSET_REFERENCE_VERSION;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly origin: StudioAssetOrigin;
  readonly createdAt: string;
  readonly licenseRevisionId: string | null;
}

export interface StudioAssetLicenseRevisionV2 {
  readonly id: string;
  readonly assetId: string;
  readonly sourceName: string;
  readonly sourceUrl: string | null;
  readonly creator: string | null;
  readonly commercialUse: StudioAssetLicenseDecision;
  readonly modification: StudioAssetLicenseDecision;
  readonly aiInput: StudioAssetLicenseDecision;
  readonly attributionRequired: boolean;
  readonly attributionText: string;
  readonly redistribution: StudioAssetLicenseDecision;
  readonly effectiveFrom: string;
  readonly capturedAt: string;
  readonly evidenceAssetRevisionId: string | null;
}

export type StudioAssetIssueCode =
  | "invalid-asset-id"
  | "invalid-revision-id"
  | "invalid-content-hash"
  | "invalid-mime-type"
  | "invalid-byte-length"
  | "invalid-dimensions"
  | "invalid-duration"
  | "invalid-timestamp"
  | "license-asset-mismatch"
  | "license-revision-missing"
  | "commercial-use-prohibited"
  | "commercial-use-unknown"
  | "modification-prohibited"
  | "ai-input-prohibited"
  | "ai-input-unknown"
  | "attribution-missing";

export interface StudioAssetIssue {
  readonly code: StudioAssetIssueCode;
  readonly assetId: string;
  readonly revisionId?: string;
  readonly message: string;
  readonly blocking: boolean;
}

export interface StudioAssetUseDecision {
  readonly allowed: boolean;
  readonly issues: readonly StudioAssetIssue[];
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validOptionalPositive(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value > 0);
}

export function validateStudioAssetReferenceV2(
  reference: StudioAssetReferenceV2,
): readonly StudioAssetIssue[] {
  const issues: StudioAssetIssue[] = [];
  if (!SAFE_ID.test(reference.assetId)) {
    issues.push({
      code: "invalid-asset-id",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset ID is invalid.",
      blocking: true,
    });
  }
  if (!SAFE_ID.test(reference.revisionId)) {
    issues.push({
      code: "invalid-revision-id",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset revision ID is invalid.",
      blocking: true,
    });
  }
  if (!SHA256.test(reference.contentHash)) {
    issues.push({
      code: "invalid-content-hash",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset revision must have a canonical sha256 digest.",
      blocking: true,
    });
  }
  if (!MIME_TYPE.test(reference.mimeType)) {
    issues.push({
      code: "invalid-mime-type",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset MIME type is invalid.",
      blocking: true,
    });
  }
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength <= 0) {
    issues.push({
      code: "invalid-byte-length",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset byte length must be a positive safe integer.",
      blocking: true,
    });
  }
  if (!validOptionalPositive(reference.width) || !validOptionalPositive(reference.height)) {
    issues.push({
      code: "invalid-dimensions",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset dimensions must be positive finite values when present.",
      blocking: true,
    });
  }
  if (!validOptionalPositive(reference.durationMs)) {
    issues.push({
      code: "invalid-duration",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset duration must be positive when present.",
      blocking: true,
    });
  }
  if (!validTimestamp(reference.createdAt)) {
    issues.push({
      code: "invalid-timestamp",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Asset revision timestamp is invalid.",
      blocking: true,
    });
  }
  return issues;
}

export function validateStudioAssetLicenseRevisionV2(
  reference: StudioAssetReferenceV2,
  license: StudioAssetLicenseRevisionV2 | null,
): readonly StudioAssetIssue[] {
  if (reference.licenseRevisionId === null) {
    return license === null
      ? []
      : [{
          code: "license-asset-mismatch",
          assetId: reference.assetId,
          revisionId: reference.revisionId,
          message: "An unpinned license cannot authorize this asset revision.",
          blocking: true,
        }];
  }
  if (license === null || license.id !== reference.licenseRevisionId) {
    return [{
      code: "license-revision-missing",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned asset license revision is unavailable.",
      blocking: true,
    }];
  }
  const issues: StudioAssetIssue[] = [];
  if (license.assetId !== reference.assetId) {
    issues.push({
      code: "license-asset-mismatch",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The license belongs to another logical asset.",
      blocking: true,
    });
  }
  if (!validTimestamp(license.effectiveFrom) || !validTimestamp(license.capturedAt)) {
    issues.push({
      code: "invalid-timestamp",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The asset license revision has an invalid timestamp.",
      blocking: true,
    });
  }
  return issues;
}

export function decideStudioAssetAiReferenceUse(
  reference: StudioAssetReferenceV2,
  license: StudioAssetLicenseRevisionV2 | null,
): StudioAssetUseDecision {
  const issues = [
    ...validateStudioAssetReferenceV2(reference),
    ...validateStudioAssetLicenseRevisionV2(reference, license),
  ];
  if (reference.origin === "built-in" && reference.licenseRevisionId === null) {
    return { allowed: issues.every((issue) => !issue.blocking), issues };
  }
  if (license === null) {
    issues.push({
      code: "ai-input-unknown",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "AI input permission is not established for this asset revision.",
      blocking: true,
    });
  } else if (license.aiInput === "prohibited") {
    issues.push({
      code: "ai-input-prohibited",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned license prohibits AI input use.",
      blocking: true,
    });
  } else if (license.aiInput === "unknown") {
    issues.push({
      code: "ai-input-unknown",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned license does not establish AI input permission.",
      blocking: true,
    });
  }
  return { allowed: issues.every((issue) => !issue.blocking), issues };
}

export function decideStudioAssetPublishUse(
  reference: StudioAssetReferenceV2,
  license: StudioAssetLicenseRevisionV2 | null,
  input: {
    readonly commercial: boolean;
    readonly modified: boolean;
    readonly attributionIncluded: boolean;
  },
): StudioAssetUseDecision {
  const issues = [
    ...validateStudioAssetReferenceV2(reference),
    ...validateStudioAssetLicenseRevisionV2(reference, license),
  ];

  if (reference.origin === "built-in" && reference.licenseRevisionId === null) {
    return { allowed: issues.every((issue) => !issue.blocking), issues };
  }
  if (license === null) {
    if (input.commercial) {
      issues.push({
        code: "commercial-use-unknown",
        assetId: reference.assetId,
        revisionId: reference.revisionId,
        message: "Commercial-use permission is not established.",
        blocking: true,
      });
    }
    return { allowed: issues.every((issue) => !issue.blocking), issues };
  }
  if (input.commercial && license.commercialUse === "prohibited") {
    issues.push({
      code: "commercial-use-prohibited",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned license prohibits commercial publication.",
      blocking: true,
    });
  } else if (input.commercial && license.commercialUse === "unknown") {
    issues.push({
      code: "commercial-use-unknown",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned license does not establish commercial-use permission.",
      blocking: true,
    });
  }
  if (input.modified && license.modification === "prohibited") {
    issues.push({
      code: "modification-prohibited",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "The pinned license prohibits modification.",
      blocking: true,
    });
  }
  if (license.attributionRequired && !input.attributionIncluded) {
    issues.push({
      code: "attribution-missing",
      assetId: reference.assetId,
      revisionId: reference.revisionId,
      message: "Required attribution is missing from the publish package.",
      blocking: true,
    });
  }
  return { allowed: issues.every((issue) => !issue.blocking), issues };
}

export function sameStudioAssetRevision(
  left: StudioAssetReferenceV2,
  right: StudioAssetReferenceV2,
): boolean {
  return (
    left.assetId === right.assetId
    && left.revisionId === right.revisionId
    && left.contentHash === right.contentHash
  );
}

export function replaceStudioAssetRevision(
  current: StudioAssetReferenceV2,
  next: StudioAssetReferenceV2,
): StudioAssetReferenceV2 {
  if (current.assetId !== next.assetId) {
    throw new Error("An asset revision replacement cannot change the logical asset ID.");
  }
  const issues = validateStudioAssetReferenceV2(next);
  if (issues.some((issue) => issue.blocking)) {
    throw new Error("The replacement asset revision is invalid.");
  }
  if (sameStudioAssetRevision(current, next)) return current;
  return next;
}
