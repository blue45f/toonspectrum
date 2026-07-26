/**
 * Local-first package contract shared by Studio assets, brushes, filters, palettes,
 * templates and 3D presets.
 *
 * This module deliberately contains no payment or server persistence implementation.
 * A package must declare those boundaries explicitly so the UI cannot imply that an
 * unavailable checkout, cloud sync or creator payout completed successfully.
 */

export const STUDIO_MARKETPLACE_PACKAGE_SCHEMA =
  "toonspectrum.studio-marketplace-package" as const;
export const STUDIO_MARKETPLACE_SHARE_MANIFEST_SCHEMA =
  "toonspectrum.studio-marketplace-share-manifest" as const;
export const STUDIO_MARKETPLACE_LIBRARY_STORAGE_KEY =
  "toonspectrum.studio-marketplace-library.v1" as const;
export const STUDIO_MARKETPLACE_LIBRARY_VERSION = 1 as const;
export const STUDIO_MARKETPLACE_MAX_LIBRARY_PACKAGES = 200;

export const STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE =
  "다른 마켓에서 받은 소재와 구매 파일은 무료 여부와 관계없이 재배포할 수 없습니다. 직접 만든 원본, CC0, 재배포가 허용된 퍼미시브 라이선스, 또는 권리자의 명시적 허가가 있는 자료만 공유할 수 있습니다." as const;

export type StudioMarketplacePackageKind =
  | "raster-asset"
  | "vector-asset"
  | "brush"
  | "filter"
  | "palette"
  | "template"
  | "3d-preset";

export type StudioMarketplaceAccessModel = "free" | "paid" | "subscription";
export type StudioMarketplaceOrigin =
  | "original-procedural"
  | "original-handmade"
  | "cc0"
  | "permissive"
  | "explicit-permission";
export type StudioMarketplaceRuntimeBoundary =
  | "bundled"
  | "local-only"
  | "server-required"
  | "unavailable";
export type StudioMarketplacePlacementPreset =
  | "current-view"
  | "pointer"
  | "panel-fit"
  | "background-cover";

export interface StudioMarketplaceCreator {
  readonly id: string;
  readonly name: string;
  readonly verified: boolean;
}

export interface StudioMarketplaceLicense {
  readonly id: string;
  readonly label: string;
  readonly url: string | null;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean;
  readonly derivativesAllowed: boolean;
  readonly redistributionAllowed: boolean;
  readonly sourceVerifiedAt: string;
  readonly summary: string;
}

export interface StudioMarketplaceCompatibility {
  readonly studioVersion: string;
  readonly renderer: readonly ("canvas2d" | "svg" | "webgl" | "webgpu")[];
  readonly devices: readonly ("desktop" | "tablet" | "mobile")[];
  readonly formats: readonly string[];
}

export interface StudioMarketplaceIncludedItem {
  readonly id: string;
  readonly name: string;
  readonly kind: StudioMarketplacePackageKind;
  readonly format: string;
  readonly contentFingerprint: string;
  readonly tags: readonly string[];
}

export interface StudioMarketplaceChangelogEntry {
  readonly version: string;
  readonly releasedAt: string;
  readonly changes: readonly string[];
}

export interface StudioMarketplaceAvailability {
  readonly catalog: StudioMarketplaceRuntimeBoundary;
  readonly library: StudioMarketplaceRuntimeBoundary;
  readonly payment: StudioMarketplaceRuntimeBoundary;
  readonly cloudSync: StudioMarketplaceRuntimeBoundary;
  readonly exportManifest: StudioMarketplaceRuntimeBoundary;
}

export interface StudioMarketplacePackage {
  readonly schema: typeof STUDIO_MARKETPLACE_PACKAGE_SCHEMA;
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly kind: StudioMarketplacePackageKind;
  readonly access: StudioMarketplaceAccessModel;
  readonly accessLabel: string;
  readonly origin: StudioMarketplaceOrigin;
  readonly creator: StudioMarketplaceCreator;
  readonly version: string;
  readonly packageFingerprint: string;
  readonly compatibility: StudioMarketplaceCompatibility;
  readonly license: StudioMarketplaceLicense;
  readonly includedItems: readonly StudioMarketplaceIncludedItem[];
  readonly changelog: readonly StudioMarketplaceChangelogEntry[];
  readonly placementPresets: readonly StudioMarketplacePlacementPreset[];
  readonly availability: StudioMarketplaceAvailability;
  readonly updatedAt: string;
}

export interface StudioMarketplaceLibraryEntry {
  readonly packageId: string;
  readonly version: string;
  readonly packageFingerprint: string;
  readonly addedAt: string;
}

export interface StudioMarketplaceLibraryState {
  readonly version: typeof STUDIO_MARKETPLACE_LIBRARY_VERSION;
  readonly packages: readonly StudioMarketplaceLibraryEntry[];
}

export interface StudioMarketplaceLibrarySaveOptions {
  /**
   * IDs intentionally removed by the current mutation. They must not be restored from a newer
   * localStorage snapshot while merging concurrent tab writes.
   */
  readonly removedPackageIds?: readonly string[];
}

export interface StudioMarketplaceFilter {
  readonly query?: string;
  readonly categories?: readonly string[];
  readonly kinds?: readonly StudioMarketplacePackageKind[];
  readonly access?: readonly StudioMarketplaceAccessModel[];
  readonly origins?: readonly StudioMarketplaceOrigin[];
  readonly libraryPackageIds?: readonly string[];
  readonly libraryOnly?: boolean;
  readonly updateOnly?: boolean;
  readonly installed?: readonly StudioMarketplaceLibraryEntry[];
}

export type StudioMarketplaceImportStatus =
  | "new"
  | "duplicate"
  | "update"
  | "content-conflict"
  | "downgrade-blocked";

export interface StudioMarketplaceImportResolution {
  readonly status: StudioMarketplaceImportStatus;
  readonly recommendedAction: "add" | "skip" | "update" | "clone" | "block";
  readonly installedVersion: string | null;
  readonly message: string;
}

export interface StudioMarketplaceShareManifest {
  readonly schema: typeof STUDIO_MARKETPLACE_SHARE_MANIFEST_SCHEMA;
  readonly version: 1;
  readonly package: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly packageFingerprint: string;
    readonly kind: StudioMarketplacePackageKind;
    readonly origin: StudioMarketplaceOrigin;
    readonly creator: StudioMarketplaceCreator;
    readonly license: StudioMarketplaceLicense;
    readonly compatibility: StudioMarketplaceCompatibility;
    readonly includedItems: readonly StudioMarketplaceIncludedItem[];
  };
  readonly createdAt: string;
  readonly localOnly: true;
  readonly contentIncluded: false;
  readonly notice: typeof STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE;
}

export interface StudioMarketplacePublishRightsInput {
  readonly origin: unknown;
  readonly creatorOwnsRights: boolean;
  readonly containsThirdPartyContent: boolean;
  readonly recognizableMarketplaceDerivative: boolean;
  readonly redistributionPermission: boolean;
  readonly sourceReference?: string;
  readonly permissionEvidence?: string;
}

export interface StudioMarketplacePublishRightsCheck {
  readonly id:
    | "origin"
    | "ownership"
    | "third-party"
    | "marketplace-derivative"
    | "source"
    | "redistribution";
  readonly passed: boolean;
  readonly label: string;
  readonly message: string;
}

export interface StudioMarketplacePublishRightsDecision {
  readonly allowed: boolean;
  readonly normalizedOrigin: StudioMarketplaceOrigin | null;
  readonly checks: readonly StudioMarketplacePublishRightsCheck[];
  readonly notice: typeof STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE;
  readonly localPreflightOnly: true;
}

const ORIGIN_SET = new Set<StudioMarketplaceOrigin>([
  "original-procedural",
  "original-handmade",
  "cc0",
  "permissive",
  "explicit-permission",
]);

const EMPTY_LIBRARY_STATE: StudioMarketplaceLibraryState = Object.freeze({
  version: STUDIO_MARKETPLACE_LIBRARY_VERSION,
  packages: Object.freeze([]),
});

function normalizedSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("ko-KR") : "";
}

function normalizedStringSet(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map(normalizedSearch).filter(Boolean));
}

function packageSearchText(pkg: StudioMarketplacePackage): string {
  return [
    pkg.name,
    pkg.summary,
    pkg.category,
    pkg.creator.name,
    pkg.version,
    pkg.license.label,
    ...pkg.tags,
    ...pkg.compatibility.formats,
    ...pkg.compatibility.renderer,
    ...pkg.compatibility.devices,
    ...pkg.includedItems.flatMap((item) => [item.name, item.format, ...item.tags]),
  ].join("\n").toLocaleLowerCase("ko-KR");
}

function semverParts(version: string): readonly number[] {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version.trim());
  if (!match) return [0, 0, 0];
  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10),
  ];
}

export function compareStudioMarketplaceVersions(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function filterStudioMarketplacePackages(
  packages: readonly StudioMarketplacePackage[],
  filter: StudioMarketplaceFilter = {}
): StudioMarketplacePackage[] {
  const query = normalizedSearch(filter.query);
  const categories = normalizedStringSet(filter.categories);
  const kinds = new Set(filter.kinds ?? []);
  const access = new Set(filter.access ?? []);
  const origins = new Set(filter.origins ?? []);
  const libraryIds = new Set(filter.libraryPackageIds ?? []);
  const installedById = new Map(
    (filter.installed ?? []).map((entry) => [entry.packageId, entry] as const)
  );

  return packages.filter((pkg) => {
    if (query && !packageSearchText(pkg).includes(query)) return false;
    if (categories.size > 0 && !categories.has(normalizedSearch(pkg.category))) return false;
    if (kinds.size > 0 && !kinds.has(pkg.kind)) return false;
    if (access.size > 0 && !access.has(pkg.access)) return false;
    if (origins.size > 0 && !origins.has(pkg.origin)) return false;
    if (filter.libraryOnly && !libraryIds.has(pkg.id)) return false;
    if (filter.updateOnly) {
      const installed = installedById.get(pkg.id);
      if (!installed || compareStudioMarketplaceVersions(pkg.version, installed.version) <= 0) {
        return false;
      }
    }
    return true;
  });
}

function isLibraryEntry(value: unknown): value is StudioMarketplaceLibraryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<StudioMarketplaceLibraryEntry>;
  return (
    typeof entry.packageId === "string"
    && entry.packageId.length > 0
    && entry.packageId.length <= 160
    && typeof entry.version === "string"
    && entry.version.length > 0
    && entry.version.length <= 80
    && typeof entry.packageFingerprint === "string"
    && entry.packageFingerprint.length > 0
    && entry.packageFingerprint.length <= 160
    && typeof entry.addedAt === "string"
    && Number.isFinite(Date.parse(entry.addedAt))
  );
}

export function loadStudioMarketplaceLibrary(
  storage: Pick<Storage, "getItem"> | null | undefined
): StudioMarketplaceLibraryState {
  if (!storage) return EMPTY_LIBRARY_STATE;
  try {
    const raw = storage.getItem(STUDIO_MARKETPLACE_LIBRARY_STORAGE_KEY);
    if (!raw) return EMPTY_LIBRARY_STATE;
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      packages?: unknown;
    };
    if (
      parsed.version !== STUDIO_MARKETPLACE_LIBRARY_VERSION
      || !Array.isArray(parsed.packages)
    ) {
      return EMPTY_LIBRARY_STATE;
    }
    const seen = new Set<string>();
    const packages = parsed.packages
      .filter(isLibraryEntry)
      .filter((entry) => {
        if (seen.has(entry.packageId)) return false;
        seen.add(entry.packageId);
        return true;
      })
      .slice(0, STUDIO_MARKETPLACE_MAX_LIBRARY_PACKAGES);
    return {
      version: STUDIO_MARKETPLACE_LIBRARY_VERSION,
      packages,
    };
  } catch {
    return EMPTY_LIBRARY_STATE;
  }
}

export function saveStudioMarketplaceLibrary(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  state: StudioMarketplaceLibraryState,
  options: StudioMarketplaceLibrarySaveOptions = {},
): boolean {
  if (!storage) return false;
  try {
    const removedIds = new Set(options.removedPackageIds ?? []);
    const requestedIds = new Set(state.packages.map((entry) => entry.packageId));
    const latest = loadStudioMarketplaceLibrary(storage);
    const packages = [
      ...state.packages.filter((entry) => !removedIds.has(entry.packageId)),
      ...latest.packages.filter(
        (entry) => !removedIds.has(entry.packageId) && !requestedIds.has(entry.packageId),
      ),
    ].slice(0, STUDIO_MARKETPLACE_MAX_LIBRARY_PACKAGES);
    storage.setItem(
      STUDIO_MARKETPLACE_LIBRARY_STORAGE_KEY,
      JSON.stringify({
        version: STUDIO_MARKETPLACE_LIBRARY_VERSION,
        packages,
      })
    );
    const verified = loadStudioMarketplaceLibrary(storage);
    const verifiedById = new Map(
      verified.packages.map((entry) => [entry.packageId, entry] as const),
    );
    return packages.every((entry) => {
      const persisted = verifiedById.get(entry.packageId);
      return persisted?.version === entry.version
        && persisted.packageFingerprint === entry.packageFingerprint;
    }) && [...removedIds].every((packageId) => !verifiedById.has(packageId));
  } catch {
    return false;
  }
}

function stableMarketplaceFingerprintHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createStudioMarketplaceConflictCloneId(
  pkg: Pick<StudioMarketplacePackage, "id" | "version" | "packageFingerprint">,
): string {
  const suffix = `~conflict-${stableMarketplaceFingerprintHash(
    `${pkg.version}\u0000${pkg.packageFingerprint}`,
  )}`;
  return `${pkg.id.slice(0, Math.max(1, 160 - suffix.length))}${suffix}`;
}

export function resolveStudioMarketplaceImport(
  pkg: StudioMarketplacePackage,
  installed: StudioMarketplaceLibraryEntry | null | undefined
): StudioMarketplaceImportResolution {
  if (!installed) {
    return {
      status: "new",
      recommendedAction: "add",
      installedVersion: null,
      message: "이 기기의 라이브러리에 새 패키지로 추가할 수 있습니다.",
    };
  }
  const versionComparison = compareStudioMarketplaceVersions(pkg.version, installed.version);
  if (
    versionComparison === 0
    && pkg.packageFingerprint === installed.packageFingerprint
  ) {
    return {
      status: "duplicate",
      recommendedAction: "skip",
      installedVersion: installed.version,
      message: "동일한 버전과 내용이 이미 로컬 라이브러리에 있습니다.",
    };
  }
  if (versionComparison > 0) {
    return {
      status: "update",
      recommendedAction: "update",
      installedVersion: installed.version,
      message: `${installed.version}에서 ${pkg.version}(으)로 로컬 패키지를 업데이트할 수 있습니다.`,
    };
  }
  if (versionComparison < 0) {
    return {
      status: "downgrade-blocked",
      recommendedAction: "block",
      installedVersion: installed.version,
      message: `설치된 ${installed.version}보다 오래된 ${pkg.version} 패키지는 덮어쓰지 않습니다.`,
    };
  }
  return {
    status: "content-conflict",
    recommendedAction: "clone",
    installedVersion: installed.version,
    message: "같은 버전 번호에 다른 내용이 감지되어 별도 복제본으로만 가져올 수 있습니다.",
  };
}

export function cloneStudioMarketplacePackageToLibrary(
  state: StudioMarketplaceLibraryState,
  pkg: StudioMarketplacePackage,
  now = new Date().toISOString()
): StudioMarketplaceLibraryState {
  const installed = state.packages.find((candidate) => candidate.packageId === pkg.id);
  const resolution = resolveStudioMarketplaceImport(pkg, installed);
  if (resolution.status === "duplicate" || resolution.status === "downgrade-blocked") {
    return state;
  }
  const packageId = resolution.status === "content-conflict"
    ? createStudioMarketplaceConflictCloneId(pkg)
    : pkg.id;
  const entry: StudioMarketplaceLibraryEntry = {
    packageId,
    version: pkg.version,
    packageFingerprint: pkg.packageFingerprint,
    addedAt: now,
  };
  const packages = [
    entry,
    ...state.packages.filter((candidate) => candidate.packageId !== packageId),
  ].slice(0, STUDIO_MARKETPLACE_MAX_LIBRARY_PACKAGES);
  return {
    version: STUDIO_MARKETPLACE_LIBRARY_VERSION,
    packages,
  };
}

export function removeStudioMarketplacePackageFromLibrary(
  state: StudioMarketplaceLibraryState,
  packageId: string
): StudioMarketplaceLibraryState {
  return {
    version: STUDIO_MARKETPLACE_LIBRARY_VERSION,
    packages: state.packages.filter((entry) => entry.packageId !== packageId),
  };
}

export function createStudioMarketplaceShareManifest(
  pkg: StudioMarketplacePackage,
  now = new Date().toISOString()
): StudioMarketplaceShareManifest {
  return {
    schema: STUDIO_MARKETPLACE_SHARE_MANIFEST_SCHEMA,
    version: 1,
    package: {
      id: pkg.id,
      name: pkg.name,
      version: pkg.version,
      packageFingerprint: pkg.packageFingerprint,
      kind: pkg.kind,
      origin: pkg.origin,
      creator: pkg.creator,
      license: pkg.license,
      compatibility: pkg.compatibility,
      includedItems: pkg.includedItems,
    },
    createdAt: now,
    localOnly: true,
    contentIncluded: false,
    notice: STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE,
  };
}

export function evaluateStudioMarketplacePublishRights(
  input: StudioMarketplacePublishRightsInput
): StudioMarketplacePublishRightsDecision {
  const normalizedOrigin = typeof input.origin === "string" && ORIGIN_SET.has(
    input.origin as StudioMarketplaceOrigin
  )
    ? input.origin as StudioMarketplaceOrigin
    : null;
  const externalOrigin = normalizedOrigin === "cc0"
    || normalizedOrigin === "permissive"
    || normalizedOrigin === "explicit-permission";
  const sourceReference = input.sourceReference?.trim() ?? "";
  const permissionEvidence = input.permissionEvidence?.trim() ?? "";
  const sourcePassed = !externalOrigin || sourceReference.length > 0;
  const redistributionPassed = normalizedOrigin === "original-procedural"
    || normalizedOrigin === "original-handmade"
    || (
      input.redistributionPermission
      && (
        normalizedOrigin === "cc0"
        || (
          (normalizedOrigin === "permissive" || normalizedOrigin === "explicit-permission")
          && permissionEvidence.length > 0
        )
      )
    );

  const checks: StudioMarketplacePublishRightsCheck[] = [
    {
      id: "origin",
      passed: normalizedOrigin !== null,
      label: "허용 출처",
      message: normalizedOrigin
        ? "공유 가능한 출처 유형을 선택했습니다."
        : "원본·CC0·퍼미시브·명시적 허가 중 하나여야 합니다.",
    },
    {
      id: "ownership",
      passed: input.creatorOwnsRights,
      label: "권리 보유",
      message: input.creatorOwnsRights
        ? "게시자가 공유 권한을 확인했습니다."
        : "게시자가 직접 만든 원본이거나 공유 권한을 보유해야 합니다.",
    },
    {
      id: "third-party",
      passed: !input.containsThirdPartyContent || externalOrigin,
      label: "제3자 자료",
      message: !input.containsThirdPartyContent || externalOrigin
        ? "제3자 자료가 없거나 허용 출처로 구분했습니다."
        : "제3자 자료는 출처와 재배포 허가를 확인해야 합니다.",
    },
    {
      id: "marketplace-derivative",
      passed: !input.recognizableMarketplaceDerivative,
      label: "상용 마켓 복제 금지",
      message: input.recognizableMarketplaceDerivative
        ? "구매·구독 소재를 알아볼 수 있게 복제하거나 변형한 자료는 공유할 수 없습니다."
        : "상용 마켓 소재의 복제·식별 가능한 변형이 아님을 확인했습니다.",
    },
    {
      id: "source",
      passed: sourcePassed,
      label: "출처 원문",
      message: sourcePassed
        ? "필요한 출처 원문이 확인되었습니다."
        : "외부 라이선스 자료는 원문 URL 또는 식별 가능한 출처가 필요합니다.",
    },
    {
      id: "redistribution",
      passed: redistributionPassed,
      label: "재배포 허가",
      message: redistributionPassed
        ? "재배포 가능한 권리 근거를 확인했습니다."
        : "무료 사용과 재배포 허가는 다릅니다. 재배포 근거를 첨부하세요.",
    },
  ];

  return {
    allowed: checks.every((check) => check.passed),
    normalizedOrigin,
    checks,
    notice: STUDIO_MARKETPLACE_REDISTRIBUTION_NOTICE,
    localPreflightOnly: true,
  };
}
