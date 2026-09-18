import { createHash } from "node:crypto";

import { STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX, STUDIO_MARKETPLACE_CC0_MODEL_PREFIX } from "../../apps/web/src/domains/creator/studio-marketplace-cc0-assets";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "../../apps/web/src/domains/creator/studio-marketplace-cc0-catalog.generated";
import {
  canonicalizeCreatorMarketplaceJson,
  CreatorMarketplaceResourceManifestSchema,
} from "../../apps/web/src/shared/lib/creator-marketplace-resource-contract";

/** Pure release preparation. No account, production database, network or publication side effects. */
export function buildMarketCc0ReleaseManifests() {
  return STUDIO_MARKETPLACE_CC0_ASSETS.map(asset => {
    const model = asset.kind === "model";
    const kind = model ? "3d-asset" : "asset";
    const runtimeRef = (model ? STUDIO_MARKETPLACE_CC0_MODEL_PREFIX : STUDIO_MARKETPLACE_CC0_IMAGE_PREFIX) + asset.id;
    const canonical = canonicalizeCreatorMarketplaceJson({ mode: "builtin-ref", runtimeRef });
    const format = model
      ? "PBR 재질을 포함한 GLB 2.0 모델"
      : asset.kind === "background"
        ? `${asset.width}×${asset.height}px 고해상도 WebP 배경 레퍼런스`
        : asset.kind === "prop-image"
          ? `${asset.width}×${asset.height}px 투명 WebP 2D 소품`
          : asset.kind === "surface-texture"
            ? `${asset.width}×${asset.height}px PBR 표면 재질`
            : `${asset.width}×${asset.height}px 투명 연출 효과 마스크`;
    const usage = model
      ? "선택한 모델을 검증 후 별도 3D 장면으로 엽니다. 회전·구도를 확인하고 현재 컷에 삽입하세요."
      : asset.kind === "background"
        ? "사진 기반 배경 레퍼런스이며 웹툰 작화로 변환된 배경은 아닙니다."
        : asset.kind === "prop-image"
          ? "검수된 원본을 캔버스에 바로 배치할 수 있는 투명 2D 소품입니다."
          : asset.kind === "surface-texture"
            ? "바닥·벽·소품 재질 제작에 사용할 수 있는 고해상도 표면 텍스처입니다."
            : "불꽃·연기·마법·스파크 등 연출 레이어에 사용할 수 있는 투명 효과 소스입니다.";
    const kindTag = model
      ? "3D PBR"
      : asset.kind === "background"
        ? "배경"
        : asset.kind === "prop-image"
          ? "2D 소품"
          : asset.kind === "surface-texture"
            ? "재질"
            : "연출 효과";
    return CreatorMarketplaceResourceManifestSchema.parse({
      schemaVersion: 1,
      packageId: `cc0/20260913/${asset.id}`,
      name: asset.name,
      description: `${format}. ${usage} 원본 제공: ${asset.provider}. CC0 원본의 무료 마켓 연결·게시 검증용 릴리스이며 게시자가 새로 만든 원본은 아닙니다.`,
      releaseNotes: "검증된 운영 원본 파일을 마켓과 연결한 최초 릴리스. 표시한 원본·라이선스를 유지합니다. 미리보기는 모든 각도의 미적 품질 보증을 뜻하지 않습니다.",
      kind, resourceVersion: "1.0.0", minimumStudioVersion: "1.0.0",
      tags: ["CC0", asset.provider, "QA-20260913", model ? "3D" : "2D", kindTag],
      license: "cc0-1.0", attributionText: `${asset.provider} — ${asset.sourceUrl}`,
      containsAi: false, rightsConfirmed: true,
      provenance: { origin: "permissive", authoredByPublisher: false, sourceName: asset.provider,
        sourceUrl: asset.sourceUrl, sourceLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      compatibility: { engines: model ? ["webgl2", "three"] : ["canvas2d"] },
      entries: [{ id: asset.id, kind, name: asset.name,
        delivery: { mode: "builtin-ref", runtimeRef, byteSize: 0,
          sha256: createHash("sha256").update(canonical, "utf8").digest("hex") } }],
    });
  });
}
