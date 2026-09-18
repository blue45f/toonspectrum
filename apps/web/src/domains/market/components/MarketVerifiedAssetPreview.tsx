import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";
import { findStudioMarketplaceCc0Asset } from "@/domains/creator/studio-marketplace-cc0-catalog";
import { studioCc0AssetUrl } from "@/domains/creator/studio-cc0-asset-delivery";

import type { StudioCc0Asset } from "@/domains/creator/studio-cc0-asset-delivery";

interface Preview {
  reference: string; src: string; download: string; name: string;
  width: number; height: number; note: string; fileName: string;
}

function describeVerifiedAsset(asset: StudioCc0Asset): string {
  if (asset.kind === "model") {
    return "해당 GLB에서 렌더한 미리보기 · CC0 · 회전과 확대는 Studio에서 확인하세요.";
  }
  if (asset.kind === "background") {
    return `${asset.width}×${asset.height}px · 사진 기반 레퍼런스 배경 · CC0`;
  }
  if (asset.kind === "prop-image") {
    return `${asset.width}×${asset.height}px · 실제 3D 원본에서 렌더한 투명 2D 소품 · CC0`;
  }
  if (asset.kind === "surface-texture") {
    return `${asset.width}×${asset.height}px · 검수된 PBR 표면 재질 · CC0`;
  }
  return `${asset.width}×${asset.height}px · 투명 효과 마스크 · CC0`;
}
export function MarketVerifiedAssetPreview({ reference, compact = false }: {
  readonly reference: string; readonly compact?: boolean;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failedReference, setFailedReference] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const cc0 = findStudioMarketplaceCc0Asset(reference);
    if (cc0) {
      setPreview({ reference, src: studioCc0AssetUrl(compact ? cc0.previewPath ?? cc0.path : cc0.kind === "model" ? cc0.previewPath! : cc0.path),
        download: studioCc0AssetUrl(cc0.path), name: cc0.name, width: cc0.width ?? 768, height: cc0.height ?? 768,
        fileName: cc0.path.split("/").at(-1) ?? `${cc0.id}.${cc0.kind === "model" ? "glb" : "webp"}`,
        note: describeVerifiedAsset(cc0),
      });
      return () => { current = false; };
    }
    void import("@/domains/creator/studio-original-free-asset-packs").then(({ findStudioOriginalFreeAsset }) => {
      const asset = findStudioOriginalFreeAsset(reference.replace(/^studio-asset:/u, ""));
      if (current && asset) setPreview({ reference, src: `data:image/svg+xml,${encodeURIComponent(asset.svg)}`,
        download: `data:image/svg+xml,${encodeURIComponent(asset.svg)}`, name: asset.name,
        width: asset.width, height: asset.height, fileName: `${asset.id}.svg`, note: "실제 원본 SVG 미리보기 · 확대 가능한 벡터 · CC0" });
    }).catch(() => { if (current) setFailedReference(reference); });
    return () => { current = false; };
  }, [reference, compact]);
  if (!preview || preview.reference !== reference) return null;
  if (failedReference === reference) return compact ? null : <p role="status" className="p-4 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.market.components.MarketVerifiedAssetPreview", "ko", "원본 미리보기를 불러오지 못했습니다.")}</p>;
  // Dark GLB turntable frames disappear on dark cards; stage them on a warm paper field.
  const stageClass = compact
    ? "absolute inset-0 h-full w-full object-contain bg-[linear-gradient(180deg,#efe8dc_0%,#d9d0c2_100%)]"
    : "max-h-[32rem] w-full object-contain bg-[linear-gradient(180deg,#efe8dc_0%,#d9d0c2_100%)]";
  const image = <img src={preview.src} alt={compact ? "" : formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketVerifiedAssetPreview", "ko", "{v0} 실제 소재 미리보기"), { v0: String(preview.name) })}
    loading="lazy" decoding="async" width={preview.width} height={preview.height}
    onError={() => setFailedReference(reference)}
    className={stageClass} />;
  if (compact) return image;
  return <figure className="overflow-hidden rounded-xl border border-line bg-card" data-market-verified-preview={reference}>
    {image}<figcaption className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-fg-2">
      <span>{preview.note}</span><a href={preview.download} download={preview.fileName}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-semibold text-accent">{translateCurrentStaticSourceText("domains.market.components.MarketVerifiedAssetPreview", "ko", "검증된 소재 파일 받기")}</a>
    </figcaption>
  </figure>;
}
