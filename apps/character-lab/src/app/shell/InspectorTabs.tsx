/**
 * 우측 인스펙터 탭 호스트: 파라미터·표정·포즈·물리·렌더·페인트·비전·제작 패키지·내보내기.
 * 패널은 영역 작업자 1파일씩이며 없는 패널은 '미조립' 안내로 표시한다(빈 화면으로 숨기지 않는다).
 */
import { useUiActions, useUiState } from "./lab-store-context";
import { INSPECTOR_TAB_IDS, INSPECTOR_TAB_LABELS_KO } from "./ui-state";

import type { LabPanels } from "./lab-runtime";
import type { InspectorTabId } from "./ui-state";
import type { ComponentType } from "react";

const TAB_PANEL_KEYS: Readonly<Record<InspectorTabId, keyof LabPanels>> = {
  param: "ParamPanel",
  expression: "ExpressionPanel",
  pose: "PosePanel",
  physics: "PhysicsPanel",
  render: "RenderPanel",
  paint: "PaintPanel",
  vision: "VisionPanel",
  package: "PackagePanel",
  export: "ExportPanel",
};

export function panelForTab(panels: LabPanels, tab: InspectorTabId): ComponentType | undefined {
  return panels[TAB_PANEL_KEYS[tab]];
}

export interface InspectorTabsProps {
  readonly panels: LabPanels;
}

export function InspectorTabs({ panels }: InspectorTabsProps) {
  const ui = useUiState();
  const { setInspectorTab } = useUiActions();
  const Panel = panelForTab(panels, ui.inspectorTab);
  return (
    <div className="cl-inspector">
      <div className="cl-inspector-tabs" role="tablist" aria-label="인스펙터">
        {INSPECTOR_TAB_IDS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`cl-tab-${tab}`}
            className="cl-inspector-tab"
            aria-selected={ui.inspectorTab === tab}
            aria-controls={`cl-tabpanel-${tab}`}
            data-missing={panelForTab(panels, tab) ? undefined : "true"}
            onClick={() => setInspectorTab(tab)}
          >
            {INSPECTOR_TAB_LABELS_KO[tab]}
          </button>
        ))}
      </div>
      <div className="cl-inspector-body" role="tabpanel" id={`cl-tabpanel-${ui.inspectorTab}`} aria-labelledby={`cl-tab-${ui.inspectorTab}`}>
        {Panel ? (
          <Panel />
        ) : (
          <p className="cl-notice" data-missing-panel={TAB_PANEL_KEYS[ui.inspectorTab]}>
            {INSPECTOR_TAB_LABELS_KO[ui.inspectorTab]} 패널({TAB_PANEL_KEYS[ui.inspectorTab]})이 아직 조립되지 않았습니다 — 영역 작업자 모듈 미제출.
          </p>
        )}
      </div>
    </div>
  );
}
