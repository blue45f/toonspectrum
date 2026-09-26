import type { ComponentType } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useStudioOnDemandModule } from "../useStudioOnDemandModule";

/** 선택 패널의 실패는 열린 월드에 영향을 주지 않고 사용자가 명시적으로 다시 불러온다. */
export function createStudioVirtualSpacePanel<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) {
  return function StudioVirtualSpaceOnDemandPanel(props: Props) {
    const bt = useBilingual("StudioVirtualSpacePage");
    const { module, failed, retry } = useStudioOnDemandModule(load, true);
    if (failed) return <section role="alert">
      <p>{bt("패널을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.", "The panel could not load. Check your connection and try again.")}</p>
      <button type="button" onClick={retry}>{bt("패널 다시 불러오기", "Retry loading panel")}</button>
    </section>;
    if (!module) return <p role="status">{bt("패널 불러오는 중…", "Loading panel…")}</p>;
    const Panel = module.default;
    return <Panel {...props} />;
  };
}
