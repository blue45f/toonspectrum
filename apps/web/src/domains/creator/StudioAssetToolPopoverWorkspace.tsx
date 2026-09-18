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
    <Suspense fallback={<StudioPanelLoading label="통합 에셋을 여는 중..." />}>
      <LazyStudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />
    </Suspense>
  );
}
