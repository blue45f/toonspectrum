import {
  STUDIO_BG3D_PROCEDURAL_STARTER_PACK_ID,
} from "./studio-bg3d-procedural-starter-pack";
import {
  sanitizeBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import {
  type StudioCreatorInstalledFilterPreset,
  type StudioCreatorPackStorage,
} from "./studio-creator-pack-runtime";
import {
  STUDIO_MARKETPLACE_PACKAGE_SCHEMA,
  type StudioMarketplaceLicense,
  type StudioMarketplaceOrigin,
  type StudioMarketplacePackage,
} from "./studio-marketplace-packages";
import {
  findStudioOriginalFreeAsset,
  type StudioOriginalFreeAsset,
} from "./studio-original-free-asset-packs";
import { type StudioNamedPalette } from "./studio-palette-library";
import {
  SCENE_TEMPLATES,
} from "./studio-scene-templates";

import type {
  StudioCreatorPackDefinition,
  StudioCreatorPackEntry,
  StudioCreatorPackKind,
} from "./studio-creator-pack-catalog";
import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import {
  createCreatorMarketplacePortableDelivery,
} from "@/src/infrastructure/creator-marketplace-client";

const LICENSE_METADATA: Readonly<
  Record<CreatorMarketplaceResourceLicense, Omit<StudioMarketplaceLicense, "sourceVerifiedAt">>
> = Object.freeze({
  "toonspectrum-standard": {
    id: "toonspectrum-standard",
    label: "ToonSpectrum 표준 사용권",
    url: null,
    commercialUse: true,
    attributionRequired: false,
    derivativesAllowed: true,
    redistributionAllowed: false,
    summary: "작품에는 사용할 수 있지만 리소스 파일 자체의 재배포는 허용하지 않습니다.",
  },
  "cc0-1.0": {
    id: "cc0-1.0",
    label: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    commercialUse: true,
    attributionRequired: false,
    derivativesAllowed: true,
    redistributionAllowed: true,
    summary: "상업 이용·수정·재배포가 가능한 공개 리소스입니다.",
  },
  "cc-by-4.0": {
    id: "cc-by-4.0",
    label: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    commercialUse: true,
    attributionRequired: true,
    derivativesAllowed: true,
    redistributionAllowed: true,
    summary: "저작자 표시를 유지하면 상업 이용·수정·재배포할 수 있습니다.",
  },
  "cc-by-nc-4.0": {
    id: "cc-by-nc-4.0",
    label: "CC BY-NC 4.0",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
    commercialUse: false,
    attributionRequired: true,
    derivativesAllowed: true,
    redistributionAllowed: true,
    summary: "저작자 표시가 필요하며 상업 작품에는 사용할 수 없습니다.",
  },
});

const COMMUNITY_INSTALLABLE_KINDS = new Set<StudioCreatorPackKind>([
  "brush",
  "filter",
  "palette",
  "template",
  "3d-preset",
]);

const FORMAT_BY_KIND: Readonly<Record<StudioCreatorPackKind, string>> =
  Object.freeze({
    brush: "application/vnd.toonspectrum.brush+json",
    filter: "application/vnd.toonspectrum.filter+json",
    palette: "application/vnd.toonspectrum.palette+json",
    template: "application/vnd.toonspectrum.template+json",
    "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
  });

export type StudioCommunityPackProjection =
  | Readonly<{
      status: "installable";
      pack: StudioCreatorPackDefinition;
      reason: null;
    }>
  | Readonly<{
      status: "unsupported";
      pack: null;
      reason: string;
    }>;

export interface StudioCommunityAssetProjection {
  readonly assets: readonly StudioOriginalFreeAsset[];
  readonly unsupportedCount: number;
  readonly reason: string | null;
}

export type StudioCommunityShareCandidateKind = "brush" | "filter" | "palette";

export interface StudioCommunityShareCandidate {
  readonly id: string;
  readonly kind: StudioCommunityShareCandidateKind;
  readonly name: string;
  readonly definition: Record<string, CreatorMarketplaceJsonValue>;
}

export interface StudioCommunityPublishOptions {
  readonly description?: string;
  readonly license: CreatorMarketplaceResourceLicense;
  readonly attributionText?: string;
  readonly containsAi: boolean;
  readonly creatorOwnsRights: boolean;
  readonly recognizableMarketplaceDerivative: boolean;
}

function licenseForRecord(
  record: Pick<CreatorMarketplaceResourceRecord, "license" | "updatedAt">,
): StudioMarketplaceLicense {
  return Object.freeze({
    ...LICENSE_METADATA[record.license],
    sourceVerifiedAt: record.updatedAt,
  });
}

function originForRecord(
  record: Pick<CreatorMarketplaceResourceRecord, "provenance">,
): StudioMarketplaceOrigin {
  return record.provenance.origin === "original"
    ? "original-handmade"
    : "permissive";
}

function rendererForRecord(
  record: Pick<CreatorMarketplaceResourceRecord, "compatibility">,
): StudioMarketplacePackage["compatibility"]["renderer"] {
  const renderers = new Set<"canvas2d" | "svg" | "webgl" | "webgpu">();
  for (const engine of record.compatibility.engines) {
    if (engine === "canvas2d") renderers.add("canvas2d");
    if (engine === "webgl2" || engine === "three") renderers.add("webgl");
    if (engine === "webgpu") renderers.add("webgpu");
  }
  if (renderers.size === 0) renderers.add("canvas2d");
  return [...renderers];
}

function portableDefinition(
  entry: CreatorMarketplaceResourceRecord["entries"][number],
): Record<string, unknown> | null {
  if (
    entry.delivery.mode !== "portable-json"
    && entry.delivery.mode !== "procedural-recipe"
  ) {
    return null;
  }
  return entry.delivery.payload.definition;
}

function stableCommunityId(record: CreatorMarketplaceResourceRecord): string {
  return `community:${record.id}`;
}

function projectEntry(
  kind: StudioCreatorPackKind,
  entry: CreatorMarketplaceResourceRecord["entries"][number],
): StudioCreatorPackEntry | null {
  if (entry.kind !== kind) return null;
  if (kind === "brush" || kind === "filter" || kind === "palette") {
    const definition = portableDefinition(entry);
    if (!definition || entry.delivery.mode !== "portable-json") return null;
    return {
      id: entry.id,
      name: entry.name,
      kind,
      delivery: {
        mode: "portable-json",
        definition,
      },
    };
  }
  if (kind === "template") {
    if (entry.delivery.mode === "builtin-ref") {
      return {
        id: entry.id,
        name: entry.name,
        kind,
        delivery: {
          mode: "builtin-ref",
          runtimeRef: entry.delivery.runtimeRef,
        },
      };
    }
    const definition = portableDefinition(entry);
    const templateId = definition?.templateId;
    if (
      typeof templateId !== "string"
      || !SCENE_TEMPLATES.some((template) => template.id === templateId)
    ) {
      return null;
    }
    return {
      id: entry.id,
      name: entry.name,
      kind,
      delivery: {
        mode: "builtin-ref",
        runtimeRef: `studio-scene-template:${templateId}`,
      },
    };
  }
  if (entry.delivery.mode === "builtin-ref") {
    return {
      id: entry.id,
      name: entry.name,
      kind,
      delivery: {
        mode: "builtin-ref",
        runtimeRef: entry.delivery.runtimeRef,
      },
    };
  }
  const definition = portableDefinition(entry);
  return definition?.recipeId === STUDIO_BG3D_PROCEDURAL_STARTER_PACK_ID
    ? {
        id: entry.id,
        name: entry.name,
        kind,
        delivery: {
          mode: "builtin-ref",
          runtimeRef: STUDIO_BG3D_PROCEDURAL_STARTER_PACK_ID,
        },
      }
    : null;
}

function metadataForRecord(
  record: CreatorMarketplaceResourceRecord,
  kind: StudioCreatorPackKind,
): StudioMarketplacePackage {
  const format = FORMAT_BY_KIND[kind];
  return Object.freeze({
    schema: STUDIO_MARKETPLACE_PACKAGE_SCHEMA,
    id: stableCommunityId(record),
    name: record.name,
    summary: record.description || `${record.publisher.name}님의 공유 리소스`,
    category: `community-${kind}`,
    tags: Object.freeze([...record.tags]),
    kind,
    access: "free",
    accessLabel: "무료 공유",
    origin: originForRecord(record),
    creator: Object.freeze({
      id: record.publisher.id,
      name: record.publisher.name,
      verified: false,
    }),
    version: record.resourceVersion,
    packageFingerprint: record.manifestHash,
    compatibility: Object.freeze({
      studioVersion: record.minimumStudioVersion,
      renderer: Object.freeze(rendererForRecord(record)),
      devices: Object.freeze(["desktop", "tablet", "mobile"] as const),
      formats: Object.freeze([format]),
    }),
    license: licenseForRecord(record),
    includedItems: Object.freeze(record.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind,
      format,
      contentFingerprint: entry.delivery.sha256,
      tags: Object.freeze([...record.tags]),
    }))),
    changelog: Object.freeze([{
      version: record.resourceVersion,
      releasedAt: record.updatedAt,
      changes: Object.freeze(["커뮤니티 공유 버전"]),
    }]),
    placementPresets: Object.freeze([]),
    availability: Object.freeze({
      catalog: "server-required",
      library: "local-only",
      payment: "unavailable",
      cloudSync: "unavailable",
      exportManifest: "local-only",
    }),
    updatedAt: record.updatedAt,
  });
}

export function projectCreatorMarketplaceRecordToStudioPack(
  record: CreatorMarketplaceResourceRecord,
): StudioCommunityPackProjection {
  if (!COMMUNITY_INSTALLABLE_KINDS.has(record.kind as StudioCreatorPackKind)) {
    return {
      status: "unsupported",
      pack: null,
      reason: "2D 에셋은 이 카드에서 바로 삽입하며 로컬 팩 설치 대상이 아닙니다.",
    };
  }
  const kind = record.kind as StudioCreatorPackKind;
  const entries = record.entries.map((entry) => projectEntry(kind, entry));
  if (entries.some((entry) => entry === null)) {
    return {
      status: "unsupported",
      pack: null,
      reason: "현재 Studio에서 안전하게 실행할 수 없는 엔진 또는 내장 참조가 포함되어 있습니다.",
    };
  }
  const pack: StudioCreatorPackDefinition = Object.freeze({
    metadata: metadataForRecord(record, kind),
    resourceKind: kind,
    entries: Object.freeze(entries as StudioCreatorPackEntry[]),
    runtimeDescriptor: Object.freeze({
      engines: Object.freeze([...record.compatibility.engines]),
      budget: Object.freeze({
        entries: entries.length,
        ...(kind === "3d-preset"
          ? { nodes: 2_048, triangles: 250_000, textures: 64 }
          : {}),
      }),
    }),
  });
  return { status: "installable", pack, reason: null };
}

function originalAssetIdFromEntry(
  entry: CreatorMarketplaceResourceRecord["entries"][number],
): string | null {
  if (entry.kind !== "asset") return null;
  if (entry.delivery.mode === "builtin-ref") {
    const prefix = "studio-asset:";
    return entry.delivery.runtimeRef.startsWith(prefix)
      ? entry.delivery.runtimeRef.slice(prefix.length)
      : null;
  }
  const definition = portableDefinition(entry);
  return typeof definition?.recipeId === "string"
    ? definition.recipeId
    : null;
}

export function projectCreatorMarketplaceRecordToAssets(
  record: CreatorMarketplaceResourceRecord,
): StudioCommunityAssetProjection {
  if (record.kind !== "asset") {
    return {
      assets: [],
      unsupportedCount: record.entries.length,
      reason: "2D 에셋 패키지가 아닙니다.",
    };
  }
  const assets: StudioOriginalFreeAsset[] = [];
  let unsupportedCount = 0;
  for (const entry of record.entries) {
    const assetId = originalAssetIdFromEntry(entry);
    const asset = assetId ? findStudioOriginalFreeAsset(assetId) : null;
    if (!asset) {
      unsupportedCount += 1;
      continue;
    }
    if (!assets.some((candidate) => candidate.id === asset.id)) assets.push(asset);
  }
  return {
    assets,
    unsupportedCount,
    reason: assets.length > 0
      ? null
      : "현재 기기에 검증된 절차형 2D recipe가 없어 삽입할 수 없습니다.",
  };
}

function filterSnapshot(brush: StudioSavedBrush): Record<string, CreatorMarketplaceJsonValue> {
  return sanitizeBrushSnapshot(brush).snapshot as unknown as Record<
    string,
    CreatorMarketplaceJsonValue
  >;
}

export function listStudioCommunityShareCandidates(input: {
  readonly brushes?: readonly StudioSavedBrush[];
  readonly filters?: readonly StudioCreatorInstalledFilterPreset[];
  readonly palettes?: readonly StudioNamedPalette[];
} = {}): StudioCommunityShareCandidate[] {
  // Product callers hydrate all three arrays from the SQLite repositories. Omitted inputs are
  // intentionally empty; this pure projection must never discover pre-V12 localStorage data.
  const brushes = input.brushes ?? [];
  const filters = input.filters ?? [];
  const palettes = input.palettes ?? [];
  return [
    ...brushes.map((brush) => ({
      id: brush.id,
      kind: "brush" as const,
      name: brush.name,
      definition: { snapshot: filterSnapshot(brush) },
    })),
    ...filters.map((filter) => ({
      id: filter.id,
      kind: "filter" as const,
      name: filter.name,
      definition: {
        engine: filter.engine,
        values: filter.values as Record<string, CreatorMarketplaceJsonValue>,
      },
    })),
    ...palettes
      .map((palette) => ({
        ...palette,
        colors: [...new Set(
          palette.colors
            .map((color) => color.toLowerCase())
            .filter((color) => /^#[0-9a-f]{6}$/u.test(color)),
        )].slice(0, 64),
      }))
      .filter((palette) => palette.colors.length > 0)
      .map((palette) => ({
        id: palette.id,
        kind: "palette" as const,
        name: palette.name,
        definition: { colors: palette.colors },
      })),
  ];
}

export function browserStudioCreatorStorage(): StudioCreatorPackStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export async function createStudioCommunityPublishManifest(
  candidate: StudioCommunityShareCandidate,
  options: StudioCommunityPublishOptions,
): Promise<CreatorMarketplaceResourceManifest> {
  if (!options.creatorOwnsRights) {
    throw new Error("직접 제작했거나 게시·재배포 권리를 보유한 리소스만 공유할 수 있습니다.");
  }
  if (options.recognizableMarketplaceDerivative) {
    throw new Error("다른 마켓 상품의 복제·식별 가능한 변형은 공유할 수 없습니다.");
  }
  const delivery = await createCreatorMarketplacePortableDelivery(
    candidate.kind,
    candidate.definition,
  );
  const suffix = hashText(`${candidate.kind}:${candidate.id}`);
  const attributionText = options.attributionText?.trim() ?? "";
  return {
    schemaVersion: 1,
    packageId: `community/${candidate.kind}/${suffix}`,
    name: candidate.name.slice(0, 80),
    description: (options.description?.trim() ?? "").slice(0, 1_000),
    kind: candidate.kind,
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    tags: [candidate.kind, "community"],
    license: options.license,
    attributionText,
    containsAi: options.containsAi,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [{
      id: `${candidate.kind}/${suffix}`,
      kind: candidate.kind,
      name: candidate.name.slice(0, 80),
      delivery,
    }],
  };
}
