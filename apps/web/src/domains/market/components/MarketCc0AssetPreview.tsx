import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { studioCc0AssetUrl } from "@/domains/creator/studio-cc0-asset-delivery";
import { resolveStudioMarketplaceCc0Entry } from "@/domains/creator/studio-marketplace-cc0-assets";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export interface MarketCc0AssetPreviewProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly entryIndex?: number;
  readonly compact?: boolean;
}

/** Preview and downloads only use the version-controlled delivery, never a posted remote URL. */
export function MarketCc0AssetPreview({ record, entryIndex = 0, compact = false }: MarketCc0AssetPreviewProps) {
  const entry = record.entries[entryIndex];
  const asset = entry ? resolveStudioMarketplaceCc0Entry(record, entry) : null;
  if (!asset) return null;
  const model = asset.kind === "model";
  const preview = studioCc0AssetUrl(compact || model ? asset.previewPath ?? asset.path : asset.path);
  if (compact) {
    return <img src={preview} alt="" loading="lazy" decoding="async"
      data-market-cc0-preview={asset.id}
      className="absolute inset-0 h-full w-full bg-panel object-contain" />;
  }
  return <figure className="mb-4 overflow-hidden rounded-xl border border-line bg-panel" data-market-cc0-preview={asset.id}>
    <img src={preview} alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "{v0} 실제 {v1} 미리보기"), { v0: String(asset.name), v1: String(model ? "모델 렌더" : "이미지") })}
      decoding="async" className="max-h-[32rem] w-full object-contain"
      {...(!model ? { width: asset.width, height: asset.height } : {})} />
    <figcaption className="space-y-2 p-4 text-xs leading-relaxed text-fg-2">
      <p>{asset.name} · {model ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "PBR GLB 모델의 렌더 미리보기") : formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "{v0}×{v1}px 원본 이미지"), { v0: String(asset.width), v1: String(asset.height) })} · {asset.provider} {translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "en", "· CC0")}</p>
      <p>{model
        ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "미리보기는 한 시점의 렌더입니다. Studio에서 실제 모델을 회전·확대하고 구도를 확인한 뒤 컷에 삽입하세요.")
        : asset.kind === "background"
          ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "사진 기반 장면 레퍼런스입니다. 웹툰 작화로 변환한 배경은 아닙니다.")
          : asset.kind === "prop-image"
            ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "표시한 3D 원본에서 렌더한 투명 2D 소품입니다.")
            : asset.kind === "surface-texture"
              ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "고해상도 표면 재질 원본입니다. 바닥·벽·소품의 재질 제작에 사용할 수 있습니다.")
              : translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "불꽃·연기·마법·스파크 등의 연출 레이어에 사용할 수 있는 투명 효과 원본입니다.")}</p>
      <a href={studioCc0AssetUrl(asset.path)} download={asset.path.split("/").at(-1) ?? `${asset.id}.${model ? "glb" : "webp"}`}
        className="inline-flex min-h-11 items-center rounded-md border border-line px-3 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {model ? translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "이 GLB 파일 다운로드") : translateCurrentStaticSourceText("domains.market.components.MarketCc0AssetPreview", "ko", "이 이미지 파일 다운로드")}
      </a>
    </figcaption>
  </figure>;
}
