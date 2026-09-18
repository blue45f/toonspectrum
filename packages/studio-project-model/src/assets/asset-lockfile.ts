import type { StudioScopeRefV1 } from "../graph/scope-ref";
import { assertStudioScopeRef } from "../graph/scope-ref";

export interface StudioAssetLockEntryV1 {
  readonly version: 1;
  readonly assetId: string;
  readonly sellerId: string;
  readonly assetVersion: string;
  readonly contentDigest: string;
  readonly licenseGrantId: string;
  readonly seatCount: number;
  readonly allowedUses: readonly string[];
  readonly prohibitedUses: readonly string[];
  readonly projectUses: readonly StudioScopeRefV1[];
  readonly creditRequirement: string | null;
  readonly receiptReference: string;
  readonly lockedAt: string;
}

export interface StudioAssetLockfileV1 {
  readonly version: 1;
  readonly projectId: string;
  readonly generatedAt: string;
  readonly entries: readonly StudioAssetLockEntryV1[];
}

export interface StudioAssetLockfileIssue {
  readonly code:
    | "duplicate-asset-version"
    | "invalid-digest"
    | "invalid-seat-count"
    | "scope-project-mismatch"
    | "missing-license"
    | "missing-receipt"
    | "conflicting-use-policy";
  readonly assetId: string;
  readonly message: string;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function validateStudioAssetLockfile(
  lockfile: StudioAssetLockfileV1,
): readonly StudioAssetLockfileIssue[] {
  const issues: StudioAssetLockfileIssue[] = [];
  const keys = new Set<string>();
  for (const entry of lockfile.entries) {
    const key = `${entry.assetId}@${entry.assetVersion}`;
    if (keys.has(key)) {
      issues.push({
        code: "duplicate-asset-version",
        assetId: entry.assetId,
        message: `Asset lock entry ${key} is duplicated.`,
      });
    }
    keys.add(key);
    if (!DIGEST.test(entry.contentDigest)) {
      issues.push({ code: "invalid-digest", assetId: entry.assetId, message: "Asset digest is invalid." });
    }
    if (!Number.isSafeInteger(entry.seatCount) || entry.seatCount < 1) {
      issues.push({ code: "invalid-seat-count", assetId: entry.assetId, message: "Seat count must be positive." });
    }
    if (!entry.licenseGrantId.trim()) {
      issues.push({ code: "missing-license", assetId: entry.assetId, message: "License grant is required." });
    }
    if (!entry.receiptReference.trim()) {
      issues.push({ code: "missing-receipt", assetId: entry.assetId, message: "Receipt reference is required." });
    }
    const prohibited = new Set(entry.prohibitedUses);
    if (entry.allowedUses.some((use) => prohibited.has(use))) {
      issues.push({
        code: "conflicting-use-policy",
        assetId: entry.assetId,
        message: "The same use cannot be both allowed and prohibited.",
      });
    }
    for (const scope of entry.projectUses) {
      assertStudioScopeRef(scope);
      if (scope.projectId !== lockfile.projectId) {
        issues.push({
          code: "scope-project-mismatch",
          assetId: entry.assetId,
          message: "Asset use belongs to another project.",
        });
      }
    }
  }
  return Object.freeze(issues);
}

export function assertStudioAssetLockfilePublishable(
  lockfile: StudioAssetLockfileV1,
): void {
  const issues = validateStudioAssetLockfile(lockfile);
  if (issues.length > 0) {
    throw new Error(`Asset lockfile is not publishable: ${issues.map((issue) => issue.code).join(", ")}`);
  }
}

export function assetLockEntryKey(entry: StudioAssetLockEntryV1): string {
  return `${entry.assetId}@${entry.assetVersion}:${entry.contentDigest}`;
}
