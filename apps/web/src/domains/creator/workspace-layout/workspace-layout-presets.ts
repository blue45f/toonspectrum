/**
 * T9. 내장 워크스페이스 프리셋 3종 — CSP 벤치마킹.
 *
 * CSP(Clip Studio Paint)의 워크스페이스 전환 개념을 따른다:
 * 작업 단계마다 패널 배치를 통째로 바꾸는 고정 레이아웃이다.
 * 사용자 저장 레이아웃(workspace-layout-store)과 달리 읽기 전용이며
 * id가 "preset-" 으로 시작한다.
 */
import {
  createWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspaceSlotId,
  type WorkspaceSlotLayout,
} from "./workspace-layout-model";

export const WORKSPACE_PRESET_INKING_ID = "preset-inking";
export const WORKSPACE_PRESET_COLORING_ID = "preset-coloring";
export const WORKSPACE_PRESET_MANGA_ID = "preset-manga";

export const WORKSPACE_PRESET_IDS: ReadonlyArray<string> = [
  WORKSPACE_PRESET_INKING_ID,
  WORKSPACE_PRESET_COLORING_ID,
  WORKSPACE_PRESET_MANGA_ID,
];

export const DEFAULT_WORKSPACE_PRESET_ID = WORKSPACE_PRESET_INKING_ID;

interface WorkspacePresetDefinition {
  id: string;
  name: string;
  description: string;
  slots: Record<WorkspaceSlotId, WorkspaceSlotLayout>;
}

function slot(
  panelIds: string[],
  size: number,
  collapsed = false,
): WorkspaceSlotLayout {
  return { panelIds, collapsed, size };
}

const PRESET_DEFINITIONS: ReadonlyArray<WorkspacePresetDefinition> = [
  {
    id: WORKSPACE_PRESET_INKING_ID,
    name: "잉킹용",
    description: "펜 작업에 집중 — 브러시와 레이어를 양옆에, 톤은 하단에 접어 둔다.",
    slots: {
      "left-rail": slot(["brush"], 0.22),
      "right-inspector": slot(["layers", "navigator"], 0.28),
      "bottom-dock": slot(["tone"], 0.22, true),
      floating: slot([], 0),
    },
  },
  {
    id: WORKSPACE_PRESET_COLORING_ID,
    name: "채색용",
    description: "색상 작업에 집중 — 색상·소재를 좌측에 넓게, 톤은 하단에 펼쳐 둔다.",
    slots: {
      "left-rail": slot(["color", "materials"], 0.26),
      "right-inspector": slot(["layers"], 0.28),
      "bottom-dock": slot(["tone"], 0.28, false),
      floating: slot([], 0),
    },
  },
  {
    id: WORKSPACE_PRESET_MANGA_ID,
    name: "만화용",
    description: "만화 원고 작업 — 소재·레퍼런스와 타임라인을 함께, 3D는 플로팅으로.",
    slots: {
      "left-rail": slot(["materials", "reference"], 0.24),
      "right-inspector": slot(["layers", "timeline"], 0.3),
      "bottom-dock": slot(["tone", "annotations"], 0.24),
      floating: slot(["3d"], 0),
    },
  },
];

/** 내장 프리셋 전체를 WorkspaceLayout 레코드로 반환한다. */
export function getWorkspaceLayoutPresets(now: number = Date.now()): WorkspaceLayout[] {
  return PRESET_DEFINITIONS.map((definition) =>
    createWorkspaceLayout(definition.name, definition.slots, { id: definition.id, now }),
  );
}

/** 프리셋 id로 조회. 없으면 undefined. */
export function findWorkspaceLayoutPreset(
  id: string,
  now: number = Date.now(),
): WorkspaceLayout | undefined {
  return getWorkspaceLayoutPresets(now).find((preset) => preset.id === id);
}

/** 프리셋 id인지 여부. */
export function isWorkspaceLayoutPresetId(id: string): boolean {
  return WORKSPACE_PRESET_IDS.includes(id);
}

/** 프리셋 설명 조회 (UI용). */
export function getWorkspacePresetDescription(id: string): string {
  return PRESET_DEFINITIONS.find((definition) => definition.id === id)?.description ?? "";
}
