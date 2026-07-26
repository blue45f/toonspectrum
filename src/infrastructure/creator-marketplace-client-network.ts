import type {
  CreatorMarketplaceListParams,
} from "./creator-marketplace-client";
import type {
  CreatorMarketplaceResourceListPage,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceRecord,
} from "@/lib/creator-marketplace-resource-contract";

import {
  CreatorMarketplaceResourceListPageSchema,
  CreatorMarketplaceResourceManifestSchema,
  CreatorMarketplaceResourceRecordSchema,
} from "@/lib/creator-marketplace-resource-contract";
import { api, toApiError } from "@/src/infrastructure/api";

const BASE = "/creator/marketplace/resources";

export async function listCreatorMarketplaceResources(
  params: CreatorMarketplaceListParams = {},
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceListPage> {
  try {
    const response = await api.get<unknown>(BASE, {
      params: {
        limit: params.limit,
        cursor: params.cursor,
        search: params.search,
        tag: params.tag,
        kind: params.kind,
        license: params.license,
      },
      signal,
    });
    return CreatorMarketplaceResourceListPageSchema.parse(response);
  } catch (error) {
    throw await toApiError(error, "공유 리소스 마켓을 불러오지 못했습니다.");
  }
}

export async function listMyCreatorMarketplaceResources(
  params: CreatorMarketplaceListParams = {},
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceListPage> {
  try {
    const response = await api.get<unknown>(`${BASE}/mine`, {
      params: {
        limit: params.limit,
        cursor: params.cursor,
        search: params.search,
        tag: params.tag,
        kind: params.kind,
        license: params.license,
      },
      signal,
    });
    return CreatorMarketplaceResourceListPageSchema.parse(response);
  } catch (error) {
    throw await toApiError(error, "내 공유 리소스를 불러오지 못했습니다.");
  }
}

export async function publishCreatorMarketplaceResource(
  input: CreatorMarketplaceResourceManifest,
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceRecord> {
  const manifest = CreatorMarketplaceResourceManifestSchema.parse(input);
  try {
    const response = await api.post<unknown>(BASE, manifest, { signal });
    return CreatorMarketplaceResourceRecordSchema.parse(response);
  } catch (error) {
    throw await toApiError(error, "리소스 패키지를 공유하지 못했습니다.");
  }
}

export async function deleteCreatorMarketplaceResource(id: string): Promise<void> {
  try {
    await api.delete(`${BASE}/${encodeURIComponent(id)}`);
  } catch (error) {
    throw await toApiError(error, "공유 리소스를 삭제하지 못했습니다.");
  }
}
