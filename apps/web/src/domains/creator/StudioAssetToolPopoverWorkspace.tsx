import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Suspense } from "react";

import { StudioAssetToolPopoverBody } from "./StudioAssetToolPopoverBody";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { LazyStudioUnifiedAssetToolPopoverContent } from "./studio-unified-asset-lazy-ui";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

export interface StudioAssetToolPopoverWorkspaceProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioAssetToolPopoverWorkspace({
  toolBelt,
}: StudioAssetToolPopoverWorkspaceProps) {
  if (toolBelt.menu !== "asset") {
    return <StudioAssetToolPopoverBody toolBelt={toolBelt} />;
  }

  return (
    <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioAssetToolPopoverWorkspace", "ko", "통합 에셋을 여는 중...")} />}>
      <LazyStudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />
    </Suspense>
  );
}
