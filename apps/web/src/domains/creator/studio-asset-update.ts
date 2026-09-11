export interface StudioAssetDependencyState {
  readonly assetId: string;
  readonly versionRange: string;
  readonly resolved: boolean;
}

export interface StudioInstalledAssetVersion {
  readonly assetId: string;
  readonly version: string;
  readonly checksum: string;
  readonly pinnedVersion: string | null;
  readonly capabilities: readonly string[];
  readonly compatibilityTargets: readonly string[];
  readonly dependencies: readonly StudioAssetDependencyState[];
  readonly rightsStatus: "allowed" | "warning" | "blocked";
}

export interface StudioAssetUpdateContext {
  readonly requiredCapabilities: readonly string[];
  readonly activeCompatibilityTargets: readonly string[];
  readonly allowDowngrade: boolean;
  readonly allowPinnedUpdate: boolean;
  readonly warningAccepted: boolean;
  readonly plannedAt: string;
}

export interface StudioAssetRollbackReceipt {
  readonly assetId: string;
  readonly previousVersion: string;
  readonly previousChecksum: string;
  readonly targetVersion: string;
  readonly createdAt: string;
}

export interface StudioAssetUpdatePlan {
  readonly status: "noop" | "ready" | "review" | "blocked";
  readonly blockingCodes: readonly string[];
  readonly warningCodes: readonly string[];
  readonly rollback: StudioAssetRollbackReceipt | null;
}

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/iu;

function validUnique(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0)
    && new Set(values).size === values.length;
}

function versionParts(value: string): readonly number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(first: string, second: string): number {
  const left = versionParts(first);
  const right = versionParts(second);
  if (!left || !right) return first.localeCompare(second, undefined, { numeric: true });
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validateAsset(asset: StudioInstalledAssetVersion): void {
  if (
    !asset.assetId.trim()
    || !asset.version.trim()
    || !CHECKSUM_PATTERN.test(asset.checksum)
    || !validUnique(asset.capabilities)
    || !validUnique(asset.compatibilityTargets)
    || !validUnique(asset.dependencies.map((dependency) => `${dependency.assetId}@${dependency.versionRange}`))
    || asset.dependencies.some((dependency) => !dependency.assetId.trim() || !dependency.versionRange.trim())
    || (asset.pinnedVersion !== null && !asset.pinnedVersion.trim())
  ) {
    throw new Error(`Asset version is invalid: ${asset.assetId}`);
  }
}

function rightsRank(status: StudioInstalledAssetVersion["rightsStatus"]): number {
  if (status === "allowed") return 2;
  if (status === "warning") return 1;
  return 0;
}

export function planStudioAssetUpdate(
  installed: StudioInstalledAssetVersion,
  candidate: StudioInstalledAssetVersion,
  context: StudioAssetUpdateContext,
): StudioAssetUpdatePlan {
  validateAsset(installed);
  validateAsset(candidate);
  if (installed.assetId !== candidate.assetId) {
    throw new Error("An asset update must target the installed asset id.");
  }
  if (!validUnique(context.requiredCapabilities)
    || !validUnique(context.activeCompatibilityTargets)
    || !Number.isFinite(Date.parse(context.plannedAt))) {
    throw new Error("Asset update context is invalid.");
  }
  if (installed.version === candidate.version && installed.checksum === candidate.checksum) {
    return Object.freeze({
      status: "noop",
      blockingCodes: Object.freeze([]),
      warningCodes: Object.freeze([]),
      rollback: null,
    });
  }

  const blockingCodes: string[] = [];
  const warningCodes: string[] = [];
  if (installed.pinnedVersion !== null
    && installed.pinnedVersion !== candidate.version
    && !context.allowPinnedUpdate) {
    blockingCodes.push("version-pinned");
  }
  if (compareVersions(candidate.version, installed.version) < 0 && !context.allowDowngrade) {
    blockingCodes.push("downgrade-not-allowed");
  }
  const missingCapabilities = context.requiredCapabilities.filter(
    (capability) => !candidate.capabilities.includes(capability),
  );
  if (missingCapabilities.length > 0) blockingCodes.push("required-capability-missing");
  const incompatibleTargets = context.activeCompatibilityTargets.filter(
    (target) => !candidate.compatibilityTargets.includes(target),
  );
  if (incompatibleTargets.length > 0) blockingCodes.push("compatibility-regression");
  if (candidate.dependencies.some((dependency) => !dependency.resolved)) {
    blockingCodes.push("dependency-unresolved");
  }
  if (rightsRank(candidate.rightsStatus) < rightsRank(installed.rightsStatus)) {
    if (candidate.rightsStatus === "blocked") blockingCodes.push("rights-regression");
    else warningCodes.push("rights-review-required");
  }
  if (installed.checksum !== candidate.checksum && installed.version === candidate.version) {
    warningCodes.push("same-version-content-changed");
  }
  if (warningCodes.length > 0 && !context.warningAccepted) {
    warningCodes.push("warning-confirmation-required");
  }

  const uniqueBlocking = [...new Set(blockingCodes)];
  const uniqueWarnings = [...new Set(warningCodes)];
  const rollback: StudioAssetRollbackReceipt | null = uniqueBlocking.length > 0
    ? null
    : Object.freeze({
        assetId: installed.assetId,
        previousVersion: installed.version,
        previousChecksum: installed.checksum,
        targetVersion: candidate.version,
        createdAt: context.plannedAt,
      });
  return Object.freeze({
    status: uniqueBlocking.length > 0
      ? "blocked"
      : uniqueWarnings.length > 0 && !context.warningAccepted ? "review" : "ready",
    blockingCodes: Object.freeze(uniqueBlocking),
    warningCodes: Object.freeze(uniqueWarnings),
    rollback,
  });
}
