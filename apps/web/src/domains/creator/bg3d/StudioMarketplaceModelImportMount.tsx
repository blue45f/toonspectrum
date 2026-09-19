import { lazy, Suspense } from "react";

import type { ComponentProps } from "react";
import type { StudioMarketplaceModelImport } from "./StudioMarketplaceModelImport";

const ModelImport = lazy(() => import("./StudioMarketplaceModelImport")
  .then((module) => ({ default: module.StudioMarketplaceModelImport })));

/** The CC0 catalogue is needed only for an explicitly selected marketplace model, not BG3D startup. */
export function StudioMarketplaceModelImportMount(props: ComponentProps<typeof StudioMarketplaceModelImport>) {
  if (!props.modelId) return null;
  return <Suspense fallback={<p role="status" className="m-3 text-xs text-fg-3">선택한 마켓 모델 정보를 불러오는 중…</p>}>
    <ModelImport {...props} />
  </Suspense>;
}
