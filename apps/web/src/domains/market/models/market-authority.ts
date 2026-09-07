import {
  CreatorMarketplaceResourceManifestSchema,
  type CreatorMarketplaceResourceManifest,
} from "@/shared/lib/creator-marketplace-resource-contract";

export type MarketManifestParseResult =
  | Readonly<{ state: "empty"; manifest: null; message: string }>
  | Readonly<{ state: "invalid"; manifest: null; message: string }>
  | Readonly<{
      state: "valid";
      manifest: CreatorMarketplaceResourceManifest;
      message: string;
    }>;

/**
 * Public marketplace authority belongs to the server. This parser accepts only a complete,
 * contract-valid immutable release manifest; browser-only records are never promoted implicitly.
 */
export function parseAuthoritativeMarketManifest(
  source: string,
): MarketManifestParseResult {
  const normalized = source.trim();
  if (!normalized) {
    return {
      state: "empty",
      manifest: null,
      message: "Studio에서 만든 manifest JSON을 불러오세요.",
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(normalized) as unknown;
  } catch {
    return {
      state: "invalid",
      manifest: null,
      message: "JSON 형식을 해석할 수 없습니다. 파일 내용과 쉼표를 확인해 주세요.",
    };
  }

  const result = CreatorMarketplaceResourceManifestSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => {
        const location = issue.path.length > 0 ? issue.path.join(".") : "manifest";
        return `${location}: ${issue.message}`;
      })
      .join(" · ");
    return {
      state: "invalid",
      manifest: null,
      message: detail || "manifest 검증을 통과하지 못했습니다.",
    };
  }

  return {
    state: "valid",
    manifest: result.data,
    message: `v${result.data.resourceVersion} · ${result.data.entries.length}개 항목 · 서버 게시 준비 완료`,
  };
}

/**
 * The cache namespace changed when local drafts and starter fixtures stopped being public data.
 * Reusing v1 mixed caches would re-introduce browser-authored records into the public catalog.
 */
export function authoritativeMarketCacheKey(serializedQuery: string): string {
  return `authority:v2:${serializedQuery}`;
}

export function marketAuthorityErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
