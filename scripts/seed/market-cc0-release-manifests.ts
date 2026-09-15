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
    const format = model ? "PBR 재질을 포함한 GLB 2.0 모델" : `${asset.width}×${asset.height}px WebP 이미지`;
    const usage = model ? "선택한 모델을 검증 후 별도 3D 장면으로 엽니다. 회전·구도를 확인하고 현재 컷에 삽입하세요."
      : asset.kind === "background" ? "사진 기반 배경 레퍼런스이며 웹툰 작화로 변환된 배경은 아닙니다."
        : "해당 3D 원본에서 렌더한 투명 2D 소품입니다.";
    return CreatorMarketplaceResourceManifestSchema.parse({
      schemaVersion: 1,
      packageId: `cc0/20260913/${asset.id}`,
      name: asset.name,
      description: `${format}. ${usage} 원본 제공: Poly Haven. CC0 원본의 무료 마켓 연결·게시 검증용 릴리스이며 게시자가 새로 만든 원본은 아닙니다.`,
      releaseNotes: "검증된 운영 원본 파일을 마켓과 연결한 최초 릴리스. 표시한 원본·라이선스를 유지합니다. 미리보기는 모든 각도의 미적 품질 보증을 뜻하지 않습니다.",
      kind, resourceVersion: "1.0.0", minimumStudioVersion: "1.0.0",
      tags: ["CC0", "Poly Haven", "QA-20260913", model ? "3D" : "2D", model ? "PBR" : asset.kind === "background" ? "배경" : "투명 소품"],
      license: "cc0-1.0", attributionText: `Poly Haven — ${asset.sourceUrl}`,
      containsAi: false, rightsConfirmed: true,
      provenance: { origin: "permissive", authoredByPublisher: false, sourceName: "Poly Haven",
        sourceUrl: asset.sourceUrl, sourceLicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
      compatibility: { engines: model ? ["webgl2", "three"] : ["canvas2d"] },
      entries: [{ id: asset.id, kind, name: asset.name,
        delivery: { mode: "builtin-ref", runtimeRef, byteSize: 0,
          sha256: createHash("sha256").update(canonical, "utf8").digest("hex") } }],
    });
  });
}
