import { useId } from "react";

import { MarketBuiltinAssetPreview } from "./MarketBuiltinAssetPreview";

import { MarketVerifiedAssetPreview } from "./MarketVerifiedAssetPreview";
import { findStudioMarketplaceCc0Asset } from "@/domains/creator/studio-marketplace-cc0-catalog";

import type { RecipePreviewData } from "../models/market-preview";

/** Show the selected model's real render, not a generic mesh pretending to be the product. */
export function Market3dAssetPreview({ recipe, className }: {
  readonly recipe: RecipePreviewData;
  readonly className?: string;
}) {
  const headingId = useId();
  const noteId = useId();
  const reference = recipe.runtimeRef ?? recipe.recipeId;
  if (findStudioMarketplaceCc0Asset(reference)?.kind === "model") {
    return <MarketVerifiedAssetPreview reference={reference} />;
  }
  return (
    <section aria-labelledby={headingId} aria-describedby={noteId} className={`overflow-hidden rounded-xl border border-line bg-card ${className ?? ""}`}>
      <h2 id={headingId} className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
        3D 에셋 미리보기 ({recipe.name})
      </h2>
      <MarketBuiltinAssetPreview runtimeRef={recipe.runtimeRef ?? recipe.recipeId} />
      <div className="space-y-2 px-4 py-3 text-xs text-fg-2">
        <p>3D 에셋</p>
        <p>{Object.keys(recipe.parameters ?? {}).length}개 파라미터</p>
        <p className="max-w-full break-all font-mono">{recipe.recipeId}</p>
        <p id={noteId} className="leading-relaxed text-fg-3">
          검증된 모델에만 실제 렌더 이미지를 표시합니다. 미리보기가 없는 모델을 임의의 도형으로 대체하지 않습니다. Studio에서 선택한 모델을 검증·가져온 뒤 회전·확대하여 확인하세요.
        </p>
      </div>
    </section>
  );
}
