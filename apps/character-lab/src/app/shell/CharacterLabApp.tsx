import "../styles/character-lab.css";

/**
 * 조립 루트. LabRuntime(app/composition.ts 또는 테스트의 모의 조립)을 받아 Provider·TopBar·FailureBanner·워크벤치를 그린다.
 * 마운트 시 적용 루프·썸네일 드라이버를 시작하고 언마운트 시 중지한다. 엔진은 사용자가 TopBar에서 명시 선택할 때만 만든다.
 */
import { useEffect } from "react";

import { FailureBanner } from "./FailureBanner";
import { LabStoreProvider } from "./lab-store-context";
import { TopBar } from "./TopBar";
import { WorkbenchLayout } from "./WorkbenchLayout";

import type { LabRuntime } from "./lab-runtime";

export interface CharacterLabAppProps {
  readonly runtime: LabRuntime;
}

export function CharacterLabApp({ runtime }: CharacterLabAppProps) {
  useEffect(() => runtime.start(), [runtime]);
  return (
    <LabStoreProvider
      store={runtime.store}
      catalog={runtime.catalog}
      engineSession={runtime.engineSession}
      viewport={runtime.viewport}
      ui={runtime.ui}
      thumbnails={runtime.thumbnails}
      packagePlans={runtime.packagePlans}
      applyLoop={runtime.applyLoop}
    >
      <div className="cl-app">
        <TopBar />
        <FailureBanner />
        <WorkbenchLayout panels={runtime.panels} />
      </div>
    </LabStoreProvider>
  );
}
