import { useStudioOnDemandModule } from "../useStudioOnDemandModule";

import type { ComponentProps } from "react";
import type { StudioMarketplaceModelImport } from "./StudioMarketplaceModelImport";

const loadModelImport = () => import("./StudioMarketplaceModelImport");

/** Optional catalogue failures must not replace an already-open editor with an error screen. */
export function StudioMarketplaceModelImportMount(props: ComponentProps<typeof StudioMarketplaceModelImport>) {
  const state = useStudioOnDemandModule(loadModelImport, Boolean(props.modelId));
  if (!props.modelId) return null;
  if (state.module) return <state.module.StudioMarketplaceModelImport {...props} />;
  return <section className="m-3 space-y-2 text-xs text-fg-3" aria-label="마켓 모델 정보 불러오기">
    <p role={state.failed ? "alert" : "status"}>{state.failed
      ? "모델 정보를 불러오지 못했습니다. 현재 장면은 유지됩니다."
      : "선택한 마켓 모델 정보를 불러오는 중…"}</p>
    {state.failed && <button type="button" onClick={state.retry}
      className="min-h-11 rounded-lg border border-line px-3 focus-visible:ring-2 focus-visible:ring-accent">다시 시도</button>}
  </section>;
}
