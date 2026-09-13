import { createHash } from "node:crypto";

import { studioMarketplaceCc0Reference } from "../../apps/web/src/domains/creator/studio-marketplace-cc0-catalog";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "../../apps/web/src/domains/creator/studio-marketplace-cc0-catalog.generated";
import { CreatorMarketplaceResourceManifestSchema, canonicalizeCreatorMarketplaceJson, creatorMarketplaceJsonByteSize } from "../../apps/web/src/shared/lib/creator-marketplace-resource-contract";

import type { StudioCc0Asset } from "../../apps/web/src/domains/creator/studio-cc0-asset-delivery";

const digest = (value: unknown) => createHash("sha256").update(canonicalizeCreatorMarketplaceJson(value)).digest("hex");
export function buildMarketCc0Manifest(asset: StudioCc0Asset) {
  const kind = asset.kind === "model" ? "3d-asset" : "asset";
  const reference = studioMarketplaceCc0Reference(asset);
  const payload = { schemaVersion: 1, resourceKind: kind, runtime: "studio-procedural-asset-v1", definition: { recipeId: reference } };
  const builtin = { mode: "builtin-ref", runtimeRef: reference };
  const delivery = kind === "3d-asset"
    ? { ...builtin, byteSize: 0, sha256: digest(builtin) }
    : { mode: "procedural-recipe", mediaType: "application/vnd.toonspectrum.asset+json", payload, byteSize: creatorMarketplaceJsonByteSize(payload), sha256: digest(payload) };
  const format = kind === "3d-asset" ? "GLB 2.0 · 자체 포함 PBR 모델" : `${asset.width}×${asset.height} WebP · ${asset.kind === "background" ? "사진 기반 장면 레퍼런스" : "투명 배경 2D 소품"}`;
  return CreatorMarketplaceResourceManifestSchema.parse({
    schemaVersion: 1, packageId: `qa/cc0-20260913/${asset.id}`, name: `[테스트] ${asset.name}`,
    description: `${format}. ${asset.provider}의 CC0 소재를 ToonStudio에서 무료로 제공합니다. 기존 SVG 샘플과 다른 실제 소재 파일입니다. 원본 해시·크기 검사 후 사용하며, 3D는 편집기에서 렌더링을 확인한 뒤 컷에 삽입합니다. AI 보조 등록 설명을 사용했고 원본 제작자를 사칭하지 않습니다.`,
    releaseNotes: "검수된 내장 소재와 실제 미리보기를 연결한 최초 마켓 릴리스. 기존 원고와 샘플 상품은 변경하지 않습니다.",
    kind, resourceVersion: "1.0.0", minimumStudioVersion: "1.0.0",
    tags: ["QA-CC0-20260913", "CC0", kind === "asset" ? "2D" : "3D", asset.kind === "background" ? "배경" : "소품", "무료", "Poly Haven"],
    license: "cc0-1.0", attributionText: `원본: ${asset.provider} — ${asset.sourceUrl}`, containsAi: true, rightsConfirmed: true,
    provenance: { origin: "permissive", authoredByPublisher: false, sourceName: asset.provider, sourceUrl: asset.sourceUrl, sourceLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
    compatibility: { engines: kind === "asset" ? ["canvas2d"] : ["webgl2", "three"] },
    entries: [{ id: `${kind}/${asset.id}`, kind, name: asset.name, delivery }],
  });
}
export const MARKET_CC0_MANIFESTS = STUDIO_MARKETPLACE_CC0_ASSETS.map(buildMarketCc0Manifest);
