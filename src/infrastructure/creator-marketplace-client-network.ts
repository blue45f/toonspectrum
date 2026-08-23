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
import { NotFoundError } from "@/src/infrastructure/use-api-resource";

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
        publisher: params.publisher,
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

export async function getCreatorMarketplaceResource(
  id: string,
  signal?: AbortSignal
): Promise<CreatorMarketplaceResourceRecord> {
  try {
    const response = await api.get<unknown>(
      `${BASE}/${encodeURIComponent(id)}`,
      { signal }
    );
    return CreatorMarketplaceResourceRecordSchema.parse(response);
  } catch (error) {
    // 404는 흐름 제어(notFound)로 다룬다 — useApiResource 계약과 동일.
    // ky HTTPError는 response.status를 노출하므로 instanceof 대신 형태로 판별한다.
    if (
      error && typeof error === "object"
      && "response" in error
      && (error as { response?: { status?: number } }).response?.status === 404
    ) {
      throw new NotFoundError();
    }
    throw await toApiError(error, "공유 리소스를 불러오지 못했습니다.");
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
