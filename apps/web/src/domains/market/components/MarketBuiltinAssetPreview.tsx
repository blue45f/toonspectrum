import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";

import type { StudioMarketplaceAssetPreview } from "@/domains/creator/studio-marketplace-preview";

export function MarketBuiltinAssetPreview({ runtimeRef }: { readonly runtimeRef: string }) {
  const [resolved, setResolved] = useState<{ ref: string; preview: StudioMarketplaceAssetPreview | null } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void import("@/domains/creator/studio-marketplace-preview").then(({ resolveStudioMarketplaceAssetPreview }) => {
      if (active) setResolved({ ref: runtimeRef, preview: resolveStudioMarketplaceAssetPreview(runtimeRef) });
    }).catch(() => {
      if (active) setResolved({ ref: runtimeRef, preview: null });
    });
    return () => { active = false; };
  }, [runtimeRef]);
  const preview = resolved?.ref === runtimeRef ? resolved.preview : null;
  if (!preview) return null;
  return (
    <figure className="border-b border-line bg-panel/30 p-3" data-market-real-preview="true">
      {failedSource === preview.src ? (
        <p role="alert" className="p-4 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.market.components.MarketBuiltinAssetPreview", "ko", "실제 미리보기 파일을 불러오지 못했습니다. Studio에서 다시 확인해 주세요.")}</p>
      ) : (
        <img src={preview.src} alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.market.components.MarketBuiltinAssetPreview", "ko", "{v0} 실제 에셋 미리보기"), { v0: String(preview.name) })} decoding="async" className="max-h-[32rem] w-full rounded-lg object-contain" onError={() => setFailedSource(preview.src)} />
      )}
      <figcaption className="mt-2 text-xs leading-relaxed text-fg-3">{preview.caption}</figcaption>
    </figure>
  );
}
