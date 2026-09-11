import {
  STUDIO_ASSET_DESTINATIONS,
  evaluateStudioAssetUsage,
  type StudioAssetDestination,
  type StudioAssetPassport,
  type StudioAssetUsageContext,
  type StudioAssetUsageDecision,
} from "./studio-asset-passport";
import {
  evaluateStudioAssetEntitlement,
  evaluateStudioAssetProviderRequest,
  type StudioAssetEntitlement,
  type StudioAssetEntitlementDecision,
  type StudioAssetProviderDecision,
  type StudioAssetProviderDefinition,
} from "./studio-asset-provider";
import {
  auditStudioFonts,
  type StudioFontAuditReport,
  type StudioFontManifest,
  type StudioFontTextRun,
} from "./studio-font-audit";
import {
  evaluateStudioMarketplaceSubmission,
  type StudioMarketplaceSubmission,
  type StudioMarketplaceSubmissionReadiness,
} from "./studio-marketplace-submission";
import {
  STUDIO_PLUGIN_PERMISSIONS,
  evaluateStudioPluginInstall,
  type StudioPluginInstallDecision,
  type StudioPluginManifest,
  type StudioPluginPermission,
} from "./studio-plugin-registry";
import {
  auditStudioRightsGraph,
  type StudioRightsAuditReport,
  type StudioRightsGraph,
  type StudioRightsStatus,
} from "./studio-rights-graph";

export const STUDIO_ASSET_GOVERNANCE_UPDATED_EVENT =
  "toonspectrum:studio-asset-governance-updated";

export type StudioAssetGovernanceStatus = "ready" | "review" | "blocked";

export interface StudioAssetGovernancePreferences {
  readonly destination: StudioAssetDestination;
  readonly commercial: boolean;
  readonly teamSeats: number;
  readonly modifiesAsset: boolean;
  readonly deliversSourceFiles: boolean;
  readonly usesAsAiReference: boolean;
  readonly usesForAiTraining: boolean;
  readonly attributionIncluded: boolean;
  readonly providerAccountConnected: boolean;
  readonly confirmedPluginPermissions: readonly StudioPluginPermission[];
  readonly sourceReferencesCleared: boolean;
}

export interface StudioAssetGovernanceInput {
  readonly projectId: string;
  readonly evaluatedAt: string;
  readonly preferences: StudioAssetGovernancePreferences;
  readonly passport: StudioAssetPassport;
  readonly provider: StudioAssetProviderDefinition;
  readonly entitlement: StudioAssetEntitlement;
  readonly rightsGraph: StudioRightsGraph;
  readonly rootRightsNodeIds: readonly string[];
  readonly fontManifests: readonly StudioFontManifest[];
  readonly fontRuns: readonly StudioFontTextRun[];
  readonly plugin: StudioPluginManifest;
  readonly marketplaceSubmission: StudioMarketplaceSubmission;
}

export interface StudioAssetGovernanceReport {
  readonly status: StudioAssetGovernanceStatus;
  readonly projectId: string;
  readonly usage: StudioAssetUsageDecision;
  readonly provider: StudioAssetProviderDecision;
  readonly entitlement: StudioAssetEntitlementDecision;
  readonly rights: StudioRightsAuditReport;
  readonly fonts: StudioFontAuditReport;
  readonly plugin: StudioPluginInstallDecision;
  readonly marketplace: StudioMarketplaceSubmissionReadiness;
  readonly blockingCount: number;
  readonly reviewCount: number;
  readonly attributionTexts: readonly string[];
}

export interface StudioAssetGovernanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioAssetGovernanceEventTarget {
  dispatchEvent(event: Event): boolean;
}

const CHECKSUM = `sha256:${"a".repeat(64)}`;
const DESTINATION_SET = new Set<string>(STUDIO_ASSET_DESTINATIONS);
const PLUGIN_PERMISSION_SET = new Set<string>(STUDIO_PLUGIN_PERMISSIONS);

function requireProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return value;
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error("A valid Studio asset-governance timestamp is required.");
  }
  return value;
}

function rightsStatus(
  usage: StudioAssetUsageDecision,
  fonts: StudioFontAuditReport,
  plugin: StudioPluginInstallDecision,
): StudioRightsStatus {
  if (usage.status === "blocked" || fonts.status === "blocked" || plugin.status === "blocked") {
    return "blocked";
  }
  if (usage.status === "warning" || fonts.status === "warning" || plugin.status === "confirmation") {
    return "warning";
  }
  return "allowed";
}

function immutablePreferences(
  preferences: StudioAssetGovernancePreferences,
): StudioAssetGovernancePreferences {
  if (!DESTINATION_SET.has(preferences.destination)) {
    throw new Error("A supported asset destination is required.");
  }
  if (!Number.isSafeInteger(preferences.teamSeats) || preferences.teamSeats < 1) {
    throw new Error("Team seats must be a positive integer.");
  }
  const confirmedPluginPermissions = [...new Set(preferences.confirmedPluginPermissions)]
    .filter((permission) => PLUGIN_PERMISSION_SET.has(permission));
  return Object.freeze({
    ...preferences,
    confirmedPluginPermissions: Object.freeze(confirmedPluginPermissions),
  });
}

export function createDefaultStudioAssetGovernancePreferences(): StudioAssetGovernancePreferences {
  return Object.freeze({
    destination: "webtoon",
    commercial: true,
    teamSeats: 3,
    modifiesAsset: true,
    deliversSourceFiles: false,
    usesAsAiReference: false,
    usesForAiTraining: false,
    attributionIncluded: true,
    providerAccountConnected: false,
    confirmedPluginPermissions: Object.freeze([]),
    sourceReferencesCleared: true,
  });
}

export function studioAssetGovernanceStorageKey(projectId: string): string {
  return `toonspectrum:studio-asset-governance:v1:${encodeURIComponent(requireProjectId(projectId))}`;
}

export function readStudioAssetGovernancePreferences(
  storage: StudioAssetGovernanceStorage,
  projectId: string,
): StudioAssetGovernancePreferences {
  const fallback = createDefaultStudioAssetGovernancePreferences();
  const raw = storage.getItem(studioAssetGovernanceStorageKey(projectId));
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StudioAssetGovernancePreferences> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return immutablePreferences({
      destination: typeof parsed.destination === "string" && DESTINATION_SET.has(parsed.destination)
        ? parsed.destination as StudioAssetDestination
        : fallback.destination,
      commercial: typeof parsed.commercial === "boolean" ? parsed.commercial : fallback.commercial,
      teamSeats: Number.isSafeInteger(parsed.teamSeats) && Number(parsed.teamSeats) > 0
        ? Number(parsed.teamSeats)
        : fallback.teamSeats,
      modifiesAsset: typeof parsed.modifiesAsset === "boolean" ? parsed.modifiesAsset : fallback.modifiesAsset,
      deliversSourceFiles: typeof parsed.deliversSourceFiles === "boolean"
        ? parsed.deliversSourceFiles
        : fallback.deliversSourceFiles,
      usesAsAiReference: typeof parsed.usesAsAiReference === "boolean"
        ? parsed.usesAsAiReference
        : fallback.usesAsAiReference,
      usesForAiTraining: typeof parsed.usesForAiTraining === "boolean"
        ? parsed.usesForAiTraining
        : fallback.usesForAiTraining,
      attributionIncluded: typeof parsed.attributionIncluded === "boolean"
        ? parsed.attributionIncluded
        : fallback.attributionIncluded,
      providerAccountConnected: typeof parsed.providerAccountConnected === "boolean"
        ? parsed.providerAccountConnected
        : fallback.providerAccountConnected,
      confirmedPluginPermissions: Array.isArray(parsed.confirmedPluginPermissions)
        ? parsed.confirmedPluginPermissions.filter((permission): permission is StudioPluginPermission => (
          typeof permission === "string" && PLUGIN_PERMISSION_SET.has(permission)
        ))
        : fallback.confirmedPluginPermissions,
      sourceReferencesCleared: typeof parsed.sourceReferencesCleared === "boolean"
        ? parsed.sourceReferencesCleared
        : fallback.sourceReferencesCleared,
    });
  } catch {
    return fallback;
  }
}

export function writeStudioAssetGovernancePreferences(
  storage: StudioAssetGovernanceStorage,
  projectId: string,
  preferences: StudioAssetGovernancePreferences,
  target?: StudioAssetGovernanceEventTarget,
): StudioAssetGovernancePreferences {
  const next = immutablePreferences(preferences);
  storage.setItem(studioAssetGovernanceStorageKey(projectId), JSON.stringify(next));
  target?.dispatchEvent(new CustomEvent(STUDIO_ASSET_GOVERNANCE_UPDATED_EVENT, {
    detail: { projectId: requireProjectId(projectId), preferences: next },
  }));
  return next;
}

export function createDefaultStudioAssetGovernance(
  projectId: string,
  evaluatedAt = new Date().toISOString(),
  preferences = createDefaultStudioAssetGovernancePreferences(),
): StudioAssetGovernanceInput {
  const id = requireProjectId(projectId);
  const now = requireTimestamp(evaluatedAt);
  const safePreferences = immutablePreferences(preferences);
  const assetId = `asset:${id}:ink-brush`;
  const fontId = `font:${id}:dialogue`;
  const pluginId = `plugin:${id}:export-helper`;
  const documentId = `document:${id}:episode-1`;

  const passport: StudioAssetPassport = Object.freeze({
    schemaVersion: 1,
    assetId,
    versionId: "v1",
    type: "brush",
    title: "프로젝트 잉크 브러시",
    source: {
      providerId: "toonstudio-market",
      providerName: "ToonStudio Assets",
      authorName: "Studio Team",
      sourceUrl: "https://assets.toonstudio.cloud/brushes/ink",
      receiptId: "receipt:asset-ink",
      importedAt: now,
    },
    quality: {
      status: "verified",
      grade: "A",
      fileSizeBytes: 24_000,
      checksum: CHECKSUM,
      previewAvailable: true,
      compatibility: {
        minStudioVersion: "1.0.0",
        requiredCapabilities: ["brush.basic"],
        supportedPlatforms: ["web", "desktop", "mobile"],
        supportedFormats: ["toon-brush"],
      },
      details: {
        kind: "brush",
        engineIds: ["raster-basic"],
        deterministic: true,
        gpuCost: "low",
        pressure: true,
        tilt: true,
      },
    },
    rights: {
      verified: true,
      licenseId: "commercial-standard",
      licenseName: "Commercial Standard",
      commercialUse: "allowed",
      modification: "allowed",
      clientWork: "allowed",
      publishing: "allowed",
      video: "allowed",
      merchandise: "conditional",
      appEmbedding: "prohibited",
      ebookEmbedding: "allowed",
      sourceRedistribution: "prohibited",
      aiGenerationReference: "conditional",
      aiTraining: "prohibited",
      attributionRequired: true,
      attributionText: "Brush by ToonStudio Assets",
      seatLimit: 5,
      expiresAt: "2035-12-31T23:59:59.000Z",
    },
    ai: {
      classification: "none",
      providerIds: [],
      modelNames: [],
      sourceReferencesCleared: safePreferences.sourceReferencesCleared,
      disclosureRequired: false,
      editedByHuman: true,
    },
    createdAt: now,
    updatedAt: now,
  });

  const provider: StudioAssetProviderDefinition = Object.freeze({
    id: "toonstudio-market",
    name: "ToonStudio Assets",
    mode: "official-api",
    actions: ["search", "purchase", "download", "update", "sync-entitlements"],
    authorizedDomains: ["assets.toonstudio.cloud"],
    requiresAuthentication: true,
    allowsBackgroundSync: true,
  });

  const entitlement: StudioAssetEntitlement = Object.freeze({
    providerId: provider.id,
    assetId,
    versionId: passport.versionId,
    ownerId: id,
    receiptId: "receipt:asset-ink",
    purchasedAt: now,
    expiresAt: "2035-12-31T23:59:59.000Z",
    seatLimit: 5,
  });

  const fontManifests: readonly StudioFontManifest[] = Object.freeze([
    Object.freeze({
      id: fontId,
      family: "ToonStudio Dialogue",
      source: "ToonStudio Fonts",
      coverage: Object.freeze([
        Object.freeze({ from: 0x20, to: 0x7e }),
        Object.freeze({ from: 0xac00, to: 0xd7a3 }),
      ]),
      permissions: Object.freeze({
        webtoon: "allowed",
        print: "allowed",
        video: "allowed",
        app: "conditional",
        ebook: "allowed",
        logo: "conditional",
      }),
      attributionRequired: true,
      attributionText: "Font: ToonStudio Dialogue",
      embeddingAllowed: true,
      expiresAt: null,
    }),
  ]);

  const destination = safePreferences.destination === "internal"
    ? "webtoon"
    : safePreferences.destination === "client-delivery"
      ? "print"
      : safePreferences.destination === "merchandise"
        ? "print"
        : safePreferences.destination;
  const fontDestination = destination === "webtoon"
    || destination === "print"
    || destination === "video"
    || destination === "app"
    || destination === "ebook"
    ? destination
    : "webtoon";
  const fontRuns: readonly StudioFontTextRun[] = Object.freeze([
    Object.freeze({
      id: "run:dialogue-1",
      fontId,
      text: "이제 정말 시작해야 해. ToonStudio",
      destination: fontDestination,
      embedsFont: fontDestination === "ebook" || fontDestination === "app",
    }),
  ]);

  const plugin: StudioPluginManifest = Object.freeze({
    id: pluginId,
    version: "1.0.0",
    name: "게시 패키지 도우미",
    publisher: "toonstudio",
    runtime: "worker",
    signature: "verified",
    permissions: ["document-read", "asset-read", "document-write"],
    networkDomains: [],
    entrypoint: "worker.js",
  });

  const marketplaceSubmission: StudioMarketplaceSubmission = Object.freeze({
    id: `submission:${id}:ink-brush`,
    sellerId: id,
    title: passport.title,
    description: "웹툰 선화에 맞춘 압력·기울기 지원 잉크 브러시입니다.",
    assetType: passport.type,
    status: "draft",
    version: 1,
    priceMinor: 4_900,
    currency: "KRW",
    licenseId: passport.rights.licenseId,
    aiClassification: "none",
    aiProviderNames: [],
    sourceReferencesCleared: safePreferences.sourceReferencesCleared,
    compatibilityTargets: ["web", "desktop", "mobile"],
    qualityScore: 94,
    files: Object.freeze([
      Object.freeze({
        path: "brushes/project-ink.toon-brush",
        role: "primary",
        format: "toon-brush",
        sizeBytes: 24_000,
        checksum: CHECKSUM,
      }),
      Object.freeze({
        path: "previews/project-ink.png",
        role: "preview",
        format: "png",
        sizeBytes: 12_000,
        checksum: CHECKSUM.replace(/a/gu, "b"),
      }),
    ]),
    moderationNotes: Object.freeze([]),
    updatedAt: now,
  });

  const rightsGraph: StudioRightsGraph = Object.freeze({
    nodes: Object.freeze([
      Object.freeze({
        id: documentId,
        kind: "document",
        title: "EP01 원고",
        status: "allowed",
        licenseId: null,
        attributionText: null,
        sourceUrl: null,
      }),
      Object.freeze({
        id: assetId,
        kind: "asset",
        title: passport.title,
        status: "allowed",
        licenseId: passport.rights.licenseId,
        attributionText: passport.rights.attributionText ?? null,
        sourceUrl: passport.source.sourceUrl ?? null,
      }),
      Object.freeze({
        id: fontId,
        kind: "font",
        title: fontManifests[0]!.family,
        status: "allowed",
        licenseId: "font-commercial",
        attributionText: fontManifests[0]!.attributionText,
        sourceUrl: null,
      }),
      Object.freeze({
        id: pluginId,
        kind: "plugin",
        title: plugin.name,
        status: "allowed",
        licenseId: "plugin-standard",
        attributionText: null,
        sourceUrl: null,
      }),
    ]),
    edges: Object.freeze([
      Object.freeze({ fromId: documentId, toId: assetId, kind: "uses" }),
      Object.freeze({ fromId: documentId, toId: fontId, kind: "uses" }),
      Object.freeze({ fromId: documentId, toId: pluginId, kind: "uses" }),
    ]),
  });

  return Object.freeze({
    projectId: id,
    evaluatedAt: now,
    preferences: safePreferences,
    passport,
    provider,
    entitlement,
    rightsGraph,
    rootRightsNodeIds: Object.freeze([documentId]),
    fontManifests,
    fontRuns,
    plugin,
    marketplaceSubmission,
  });
}

export function evaluateStudioAssetGovernance(
  input: StudioAssetGovernanceInput,
): StudioAssetGovernanceReport {
  const preferences = immutablePreferences(input.preferences);
  const evaluatedAt = requireTimestamp(input.evaluatedAt);
  const usageContext: StudioAssetUsageContext = Object.freeze({
    destination: preferences.destination,
    commercial: preferences.commercial,
    teamSeats: preferences.teamSeats,
    modifiesAsset: preferences.modifiesAsset,
    deliversSourceFiles: preferences.deliversSourceFiles,
    usesAsAiReference: preferences.usesAsAiReference,
    usesForAiTraining: preferences.usesForAiTraining,
    attributionIncluded: preferences.attributionIncluded,
    now: evaluatedAt,
  });
  const usage = evaluateStudioAssetUsage(input.passport, usageContext);
  const provider = evaluateStudioAssetProviderRequest(input.provider, {
    action: "download",
    authenticated: preferences.providerAccountConnected,
    userInitiated: true,
    sourceUrl: input.passport.source.sourceUrl ?? null,
    bypassesAccessControl: false,
  });
  const entitlement = evaluateStudioAssetEntitlement(input.entitlement, {
    providerId: input.provider.id,
    ownerId: input.projectId,
    teamSeats: preferences.teamSeats,
    now: evaluatedAt,
    requiresReceipt: true,
  });
  const fonts = auditStudioFonts({
    manifests: input.fontManifests,
    runs: input.fontRuns,
    now: evaluatedAt,
  });
  const plugin = evaluateStudioPluginInstall(input.plugin, {
    trustedPublisherIds: ["toonstudio"],
    confirmedPermissions: preferences.confirmedPluginPermissions,
    allowedNetworkDomains: [],
    enterprisePolicyAllowsUnsigned: false,
  });
  const marketplace = evaluateStudioMarketplaceSubmission({
    ...input.marketplaceSubmission,
    sourceReferencesCleared: preferences.sourceReferencesCleared,
  });
  const nodeStatus = rightsStatus(usage, fonts, plugin);
  const rights = auditStudioRightsGraph({
    nodes: input.rightsGraph.nodes.map((node) => node.kind === "document"
      ? node
      : { ...node, status: nodeStatus }),
    edges: input.rightsGraph.edges,
  }, input.rootRightsNodeIds);

  const statuses = [
    usage.status,
    provider.status,
    entitlement.status,
    rights.status,
    fonts.status,
    plugin.status,
    marketplace.status,
  ];
  const blockedValues = new Set(["blocked"]);
  const reviewValues = new Set(["warning", "confirmation", "review"]);
  const blockingCount = statuses.filter((status) => blockedValues.has(status)).length;
  const reviewCount = statuses.filter((status) => reviewValues.has(status)).length;
  const attributionTexts = [...new Set([
    ...rights.attributionTexts,
    ...fonts.attributionTexts,
    input.passport.rights.attributionRequired
      ? input.passport.rights.attributionText?.trim() ?? ""
      : "",
  ].filter(Boolean))].sort();

  return Object.freeze({
    status: blockingCount > 0 ? "blocked" : reviewCount > 0 ? "review" : "ready",
    projectId: requireProjectId(input.projectId),
    usage,
    provider,
    entitlement,
    rights,
    fonts,
    plugin,
    marketplace,
    blockingCount,
    reviewCount,
    attributionTexts: Object.freeze(attributionTexts),
  });
}
