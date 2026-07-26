import type {
  CreatorMarketplaceJsonValue,
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
  CreatorMarketplaceResourceListPage,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import { loadChunkWithReloadRecovery } from "@/lib/chunk-load-recovery";
import {
  CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND,
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplacePortablePayloadSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@/lib/creator-marketplace-resource-contract";

const MEDIA_TYPE_BY_KIND = {
  asset: "application/vnd.toonspectrum.asset+json",
  brush: "application/vnd.toonspectrum.brush+json",
  filter: "application/vnd.toonspectrum.filter+json",
  palette: "application/vnd.toonspectrum.palette+json",
  template: "application/vnd.toonspectrum.template+json",
  "3d-preset": "application/vnd.toonspectrum.3d-preset+json",
} as const;

export interface CreatorMarketplaceListParams {
  limit?: number;
  cursor?: string;
  search?: string;
  tag?: string;
  kind?: CreatorMarketplaceResourceKind;
  license?: CreatorMarketplaceResourceLicense;
}

function loadCreatorMarketplaceNetworkClient() {
  return loadChunkWithReloadRecovery(
    () => import("./creator-marketplace-client-network"),
    "CreatorMarketplaceNetworkClient"
  );
}

async function creatorMarketplaceSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function createCreatorMarketplaceBuiltinDelivery(
  kind: keyof typeof CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND,
  runtimeRef: string
) {
  const expectedPrefix = CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND[kind];
  if (
    !runtimeRef.startsWith(expectedPrefix) ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/u.test(
      runtimeRef.slice(expectedPrefix.length)
    )
  ) {
    throw new Error("지원되는 안정적인 built-in 참조가 아닙니다.");
  }
  return {
    mode: "builtin-ref" as const,
    runtimeRef,
    byteSize: 0 as const,
    sha256: await creatorMarketplaceSha256(
      canonicalizeCreatorMarketplaceJson({
        mode: "builtin-ref",
        runtimeRef,
      })
    ),
  };
}

export async function createCreatorMarketplacePortableDelivery(
  kind: CreatorMarketplaceResourceKind,
  definition: Record<string, CreatorMarketplaceJsonValue>
) {
  const payload = {
    schemaVersion: 1 as const,
    resourceKind: kind,
    runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND[kind],
    definition,
  };
  const validatedPayload = CreatorMarketplacePortablePayloadSchema.parse(payload);
  const canonical = canonicalizeCreatorMarketplaceJson(validatedPayload);
  return {
    mode:
      kind === "asset" || kind === "3d-preset"
        ? ("procedural-recipe" as const)
        : ("portable-json" as const),
    mediaType: MEDIA_TYPE_BY_KIND[kind],
    payload: validatedPayload,
    byteSize: creatorMarketplaceJsonByteSize(validatedPayload),
    sha256: await creatorMarketplaceSha256(canonical),
  };
}

export async function listCreatorMarketplaceResources(
  params: CreatorMarketplaceListParams = {},
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceListPage> {
  const client = await loadCreatorMarketplaceNetworkClient();
  return client.listCreatorMarketplaceResources(params, signal);
}

export async function listMyCreatorMarketplaceResources(
  params: CreatorMarketplaceListParams = {},
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceListPage> {
  const client = await loadCreatorMarketplaceNetworkClient();
  return client.listMyCreatorMarketplaceResources(params, signal);
}

export async function publishCreatorMarketplaceResource(
  input: CreatorMarketplaceResourceManifest,
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceRecord> {
  const client = await loadCreatorMarketplaceNetworkClient();
  return client.publishCreatorMarketplaceResource(input, signal);
}

export async function deleteCreatorMarketplaceResource(id: string): Promise<void> {
  const client = await loadCreatorMarketplaceNetworkClient();
  return client.deleteCreatorMarketplaceResource(id);
}
