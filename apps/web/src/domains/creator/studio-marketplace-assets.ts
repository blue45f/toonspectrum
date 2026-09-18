import { createStudioCc0ImageRecord } from "./studio-cc0-asset-delivery";
import {
  findGeneratedStudio2dAsset,
  type GeneratedStudio2dAsset,
} from "./studio-2d-generated-backgrounds";
import { findStudioMarketplaceCc0Asset } from "./studio-marketplace-cc0-registry";
import { createStudioOriginalFreeAssetRecord, findStudioOriginalFreeAsset } from "./studio-original-free-asset-packs";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioCc0Asset } from "./studio-cc0-asset-delivery";
import type { StudioOriginalFreeAsset } from "./studio-original-free-asset-packs";

export type StudioMarketplaceImageAsset =
  | StudioOriginalFreeAsset
  | StudioCc0Asset
  | GeneratedStudio2dAsset;

const MAX_GENERATED_IMAGE_BYTES = 16 * 1024 * 1024;

export function findStudioMarketplaceImageAsset(id: string): StudioMarketplaceImageAsset | null {
  const original = findStudioOriginalFreeAsset(id);
  if (original) return original;
  const generated = findGeneratedStudio2dAsset(id);
  if (generated) return generated;
  const cc0 = findStudioMarketplaceCc0Asset(id);
  return cc0 && cc0.kind !== "model" ? cc0 : null;
}

function trustedGeneratedAssetUrl(asset: GeneratedStudio2dAsset): string {
  const trusted = findGeneratedStudio2dAsset(asset.id);
  if (
    !trusted
    || trusted.src !== asset.src
    || trusted.sha256 !== asset.sha256
    || trusted.bytes !== asset.bytes
    || !/^\/assets\/studio\/generated-backgrounds\/gpt25-v1\/[a-z0-9-]+\/[a-z0-9-]+\/background\.png$/u.test(asset.src)
  ) {
    throw new TypeError("검증된 1차 생성 배경 참조가 아닙니다.");
  }
  return trusted.src;
}

async function boundedGeneratedBytes(
  url: string,
  limit: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, {
    signal,
    credentials: "same-origin",
    redirect: "error",
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || declaredLength > limit) {
    throw new Error("생성 배경을 불러오지 못했습니다.");
  }
  if (!response.body) throw new Error("생성 배경 응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("생성 배경 다운로드 크기 제한을 초과했습니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function createStudioGeneratedImageRecord(
  asset: GeneratedStudio2dAsset,
  signal?: AbortSignal,
): Promise<StudioAsset> {
  signal?.throwIfAborted();
  if (asset.bytes > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error("생성 배경 다운로드 크기 제한을 초과했습니다.");
  }
  const bytes = await boundedGeneratedBytes(
    trustedGeneratedAssetUrl(asset),
    asset.bytes,
    signal,
  );
  if (bytes.byteLength !== asset.bytes) {
    throw new Error("생성 배경 파일 크기가 일치하지 않습니다.");
  }
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== asset.sha256) {
    throw new Error("생성 배경 무결성 검증에 실패했습니다.");
  }
  if (
    bytes.byteLength < 24
    || Array.from(bytes.subarray(0, 8)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
      !== "89504e470d0a1a0a"
  ) {
    throw new Error("생성 배경 PNG 헤더가 올바르지 않습니다.");
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    if (bitmap.width !== asset.width || bitmap.height !== asset.height) {
      throw new Error("생성 배경 이미지 크기가 일치하지 않습니다.");
    }
  } finally {
    bitmap.close();
  }
  signal?.throwIfAborted();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return {
    id: `gpt25:${asset.id}`,
    name: asset.title,
    dataUrl: `data:image/png;base64,${btoa(binary)}`,
    contentHash: `sha256:${hash}`,
    width: asset.width,
    height: asset.height,
    createdAt: Date.parse(asset.provenance.generatedAt),
    kind: "ai",
    rights: {
      sourceKind: "ai-generated",
      sourceId: asset.id,
      licenseId: "toonspectrum-first-party-generated",
      licenseLabel: "ToonSpectrum 1차 AI 생성 소재",
      licenseUrl: null,
      attributionRequired: false,
      attributionText: `ToonSpectrum · ${asset.provenance.provider} · ${asset.provenance.model}`,
      rightsConfirmed: true,
    },
  };
}

/** Resolve bytes only from trusted local catalogs, never from a marketplace-provided path. */
export async function createStudioMarketplaceImageRecord(
  asset: StudioMarketplaceImageAsset,
  signal?: AbortSignal,
): Promise<StudioAsset> {
  signal?.throwIfAborted();
  const original = findStudioOriginalFreeAsset(asset.id);
  if (original) return createStudioOriginalFreeAssetRecord(original);
  const generated = findGeneratedStudio2dAsset(asset.id);
  if (generated) return createStudioGeneratedImageRecord(generated, signal);
  const cc0 = findStudioMarketplaceCc0Asset(asset.id);
  if (!cc0 || cc0.kind === "model") throw new Error("검증된 2D 마켓 에셋이 아닙니다.");
  return createStudioCc0ImageRecord(cc0, signal);
}
