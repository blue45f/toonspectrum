/**
 * 셸 UI 상태(활성 슬롯·인스펙터 탭·드로잉 모드).
 * 레시피와 무관한 화면 상태라 LabState·history에 넣지 않는다.
 * 패널은 lab-store-context의 useUiState()/useUiActions()로 읽고 바꾼다(선택 사항).
 */
import type { SlotKind } from "../../contracts";

export const INSPECTOR_TAB_IDS = ["param", "expression", "pose", "physics", "render", "paint", "vision", "package", "export"] as const;
export type InspectorTabId = (typeof INSPECTOR_TAB_IDS)[number];

export const INSPECTOR_TAB_LABELS_KO: Readonly<Record<InspectorTabId, string>> = {
  param: "파라미터",
  expression: "표정",
  pose: "포즈",
  physics: "물리",
  render: "렌더",
  paint: "페인트",
  vision: "비전",
  package: "제작 패키지",
  export: "내보내기",
};

export interface UiState {
  readonly activeSlot: SlotKind;
  readonly inspectorTab: InspectorTabId;
  /** 뷰포트 포인터가 카메라 조작이 아니라 모델 위 드로잉으로 동작하는지 */
  readonly drawingMode: boolean;
}

export const DEFAULT_UI_STATE: UiState = Object.freeze({ activeSlot: "face-shape", inspectorTab: "param", drawingMode: false });

export interface UiStateStore {
  getState(): UiState;
  setActiveSlot(slot: SlotKind): void;
  setInspectorTab(tab: InspectorTabId): void;
  setDrawingMode(enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function isInspectorTabId(value: string): value is InspectorTabId {
  return (INSPECTOR_TAB_IDS as readonly string[]).includes(value);
}

export function createUiStateStore(initial: Partial<UiState> = {}): UiStateStore {
  let state: UiState = { ...DEFAULT_UI_STATE, ...initial };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<UiState>): void => {
    const next: UiState = { ...state, ...patch };
    if (next.activeSlot === state.activeSlot && next.inspectorTab === state.inspectorTab && next.drawingMode === state.drawingMode) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    setActiveSlot: (slot) => update({ activeSlot: slot }),
    setInspectorTab: (tab) => update({ inspectorTab: tab }),
    setDrawingMode: (enabled) => update({ drawingMode: enabled }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
