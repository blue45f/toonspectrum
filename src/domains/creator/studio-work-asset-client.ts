import { readBoundedStudioAssetResponse } from "./studio-bounded-asset-response";

import type {
  StudioWorkAssetDescriptor,
  StudioWorkAssetManifest,
  StudioWorkAssetType,
} from "@/lib/studio-work-asset-contract";

import {
  parseStudioWorkAssetDescriptor,
  STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE,
  StudioWorkAssetManifestSchema,
} from "@/lib/studio-work-asset-contract";
import { api, apiPath, isHttpError, toApiError } from "@/src/infrastructure/api";

export { readBoundedStudioAssetResponse as readBoundedStudioWorkAssetResponse } from "./studio-bounded-asset-response";


export interface StudioWorkAssetReference {
  assetId: string;
  elementType: StudioWorkAssetType;
}

export interface DownloadedStudioWorkAsset {
  manifest: StudioWorkAssetManifest;
  blob: Blob;
}

export class StudioWorkAssetRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "StudioWorkAssetRequestError";
  }
}

function assetPath(workId: string, assetId: string): string {
  return `/creator/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(assetId)}`;
}

function exactManifest(
  value: unknown,
  expected: StudioWorkAssetReference
): StudioWorkAssetManifest {
  const parsed = StudioWorkAssetManifestSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.assetId !== expected.assetId ||
    parsed.data.elementType !== expected.elementType
  ) {
    throw new StudioWorkAssetRequestError("작품 에셋 응답 형식이 올바르지 않습니다.", null);
  }
  return parsed.data;
}

async function requestError(error: unknown, fallback: string): Promise<StudioWorkAssetRequestError> {
  const status = isHttpError(error) ? error.response.status : null;
  return new StudioWorkAssetRequestError(await toApiError(error, fallback).then((value) => value.message), status, error);
}

export async function getStudioWorkAssetManifest(
  workId: string,
  reference: StudioWorkAssetReference,
  signal?: AbortSignal
): Promise<StudioWorkAssetManifest> {
  try {
    const response = await api.raw.get(apiPath(assetPath(workId, reference.assetId)), {
      searchParams: { elementType: reference.elementType },
      signal,
    });
    return exactManifest(await response.json<unknown>(), reference);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof StudioWorkAssetRequestError) throw error;
    throw await requestError(error, "작품 에셋 정보를 불러오지 못했습니다.");
  }
}

export async function downloadStudioWorkAsset(
  workId: string,
  reference: StudioWorkAssetReference,
  signal?: AbortSignal
): Promise<DownloadedStudioWorkAsset> {
  const manifest = await getStudioWorkAssetManifest(workId, reference, signal);
  try {
    const response = await api.raw.get(
      apiPath(`${assetPath(workId, reference.assetId)}/content`),
      { searchParams: { elementType: reference.elementType }, signal }
    );
    const responseMime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (responseMime !== manifest.mimeType) {
      throw new StudioWorkAssetRequestError("작품 에셋 MIME 형식이 manifest와 다릅니다.", null);
    }
    const bytes = await readBoundedStudioAssetResponse(
      response,
      manifest.byteSize,
      STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE[reference.elementType],
      signal
    );
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (sha256 !== manifest.sha256) {
      throw new StudioWorkAssetRequestError("작품 에셋 무결성 검증에 실패했습니다.", null);
    }
    return {
      manifest,
      blob: new Blob([bytes], { type: manifest.mimeType }),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof StudioWorkAssetRequestError) throw error;
    throw await requestError(error, "작품 에셋 원본을 불러오지 못했습니다.");
  }
}

export async function uploadStudioWorkAsset(
  workId: string,
  reference: StudioWorkAssetReference,
  descriptorValue: StudioWorkAssetDescriptor,
  file: Blob,
  signal?: AbortSignal
): Promise<StudioWorkAssetManifest> {
  const descriptor = parseStudioWorkAssetDescriptor(descriptorValue, reference);
  const form = new FormData();
  form.append("elementType", reference.elementType);
  form.append("descriptor", JSON.stringify(descriptor));
  form.append("file", file, `${reference.assetId}.${reference.elementType === "image" ? "bin" : "glb"}`);
  try {
    const response = await api.raw.put(apiPath(assetPath(workId, reference.assetId)), {
      body: form,
      signal,
    });
    return exactManifest(await response.json<unknown>(), reference);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof StudioWorkAssetRequestError) throw error;
    throw await requestError(error, "작품 에셋을 업로드하지 못했습니다.");
  }
}

/**
 * Best-effort compensation for an upload receipt the editor no longer accepts. The server deletes
 * only the exact SHA uploaded by the caller and only when that identity never entered the durable
 * CRDT scene; this is deliberately not a general-purpose asset deletion API.
 */
export async function deleteUnreferencedStudioWorkAssetUpload(
  workId: string,
  reference: StudioWorkAssetReference,
  expectedSha256: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const response = await api.raw.delete(apiPath(assetPath(workId, reference.assetId)), {
      searchParams: {
        elementType: reference.elementType,
        expectedSha256,
      },
      signal,
    });
    const result = await response.json<unknown>();
    if (
      !result || typeof result !== "object" || Array.isArray(result) ||
      typeof (result as { deleted?: unknown }).deleted !== "boolean"
    ) {
      throw new StudioWorkAssetRequestError("작품 에셋 정리 응답 형식이 올바르지 않습니다.", null);
    }
    return (result as { deleted: boolean }).deleted;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof StudioWorkAssetRequestError) throw error;
    throw await requestError(error, "사용하지 않는 작품 에셋을 정리하지 못했습니다.");
  }
}
