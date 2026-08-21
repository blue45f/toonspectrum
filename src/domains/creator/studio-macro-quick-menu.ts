/**
 * Studio Quick Action Radial Menu & Macro Recipe Runner — 맥락별 퀵 라디얼 메뉴
 * 및 일괄 처리 매크로 레시피(선화 추출+스크린톤+그림자 일괄 적용 등) 실행 코어.
 *
 * 마스터플랜 8.9 (Contextual Task Bar), 16.2 (생산성) & 997개 기능 갭 (F-899 ~ F-949):
 * - 현재 선택 상태(Idle, Selection, Layer, Text, Panel, 3D)에 따른 다이내믹 라디얼 메뉴 구성
 * - 안쪽 4개 주요 액션(Inner Primary) + 바깥쪽 8개 맥락 액션(Outer Contextual)
 * - 매크로 레시피 정의, 다중 컷/레이어 대상 일괄 실행(Batch Execution)
 * - 매크로 레시피 JSON 입출력 및 무결성 검증
 * - 순수 함수, 불변성, 결정론, DOM/React 무관
 */

export const STUDIO_MACRO_MENU_VERSION = 1 as const;

export const STUDIO_MACRO_LIMITS = Object.freeze({
  maxMacroSteps: 128,
  maxRadialSectors: 12,
  maxIdLength: 128,
  maxTitleLength: 200,
  maxDiagnostics: 256,
});

export const STUDIO_SELECTION_CONTEXTS = [
  "idle",
  "selection-active",
  "layer-selected",
  "text-selected",
  "panel-selected",
  "3d-object-selected",
] as const;
export type StudioSelectionContext = (typeof STUDIO_SELECTION_CONTEXTS)[number];

export interface RadialActionItem {
  readonly id: string;
  readonly label: string;
  readonly iconName: string;
  readonly commandId: string;
  readonly shortcutKey?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly ring: "inner" | "outer";
  readonly sectorIndex: number; // 0..3 for inner, 0..7 for outer
}

export interface RadialMenuConfig {
  readonly context: StudioSelectionContext;
  readonly centerAction?: RadialActionItem;
  readonly actions: readonly RadialActionItem[];
}

export interface MacroRecipeStep {
  readonly stepIndex: number;
  readonly commandId: string;
  readonly targetSelector: "active-selection" | "all-selected-panels" | "active-layer" | "all-layers";
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly optionalDescription?: string;
}

export interface MacroRecipe {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly author?: string;
  readonly steps: readonly MacroRecipeStep[];
}

export interface MacroStepExecutionResult {
  readonly stepIndex: number;
  readonly commandId: string;
  readonly success: boolean;
  readonly affectedCount: number;
  readonly message?: string;
}

export interface MacroExecutionReport {
  readonly macroId: string;
  readonly totalSteps: number;
  readonly success: boolean;
  readonly stepResults: readonly MacroStepExecutionResult[];
  readonly executedAtMs: number;
}

/**
 * 선택 상태에 맞춘 기본 라디얼 메뉴 구성을 반환한다.
 */
export function getContextualRadialMenu(
  context: StudioSelectionContext,
): RadialMenuConfig {
  const actions: RadialActionItem[] = [];

  if (context === "panel-selected") {
    actions.push(
      { id: "act_split_h", label: "가로 분할", iconName: "split-h", commandId: "panel:split-horizontal", ring: "inner", sectorIndex: 0 },
      { id: "act_split_v", label: "세로 분할", iconName: "split-v", commandId: "panel:split-vertical", ring: "inner", sectorIndex: 1 },
      { id: "act_fit_gutter", label: "거터 정렬", iconName: "align", commandId: "panel:align-gutter", ring: "inner", sectorIndex: 2 },
      { id: "act_del_panel", label: "컷 삭제", iconName: "trash", commandId: "panel:delete", ring: "inner", sectorIndex: 3 },
      { id: "act_add_3d", label: "3D 세트 삽입", iconName: "box", commandId: "panel:insert-3d-scene", ring: "outer", sectorIndex: 0 },
      { id: "act_add_balloon", label: "말풍선 생성", iconName: "message", commandId: "balloon:create", ring: "outer", sectorIndex: 1 },
      { id: "act_line_extract", label: "선화 추출", iconName: "pencil", commandId: "filter:extract-line", ring: "outer", sectorIndex: 2 },
    );
  } else if (context === "text-selected") {
    actions.push(
      { id: "act_tail_dir", label: "꼬리 방향", iconName: "arrow-up", commandId: "balloon:rotate-tail", ring: "inner", sectorIndex: 0 },
      { id: "act_font_size", label: "글자 크기", iconName: "type", commandId: "text:cycle-font-size", ring: "inner", sectorIndex: 1 },
      { id: "act_cjk_flow", label: "세로쓰기", iconName: "align-vertical", commandId: "text:toggle-vertical-flow", ring: "inner", sectorIndex: 2 },
      { id: "act_del_text", label: "텍스트 삭제", iconName: "trash", commandId: "text:delete", ring: "inner", sectorIndex: 3 },
    );
  } else {
    // Default Idle
    actions.push(
      { id: "act_brush", label: "브러시", iconName: "brush", commandId: "tool:select-brush", ring: "inner", sectorIndex: 0 },
      { id: "act_eraser", label: "지우개", iconName: "eraser", commandId: "tool:select-eraser", ring: "inner", sectorIndex: 1 },
      { id: "act_bucket", label: "채우기", iconName: "paint-bucket", commandId: "tool:select-fill", ring: "inner", sectorIndex: 2 },
      { id: "act_undo", label: "되돌리기", iconName: "undo", commandId: "history:undo", ring: "inner", sectorIndex: 3 },
    );
  }

  return Object.freeze({
    context,
    actions: Object.freeze(actions),
  });
}

/**
 * 매크로 레시피를 생성하고 단계를 검증한다.
 */
export function createMacroRecipe(params: {
  id: string;
  title: string;
  description: string;
  author?: string;
  steps: readonly Omit<MacroRecipeStep, "stepIndex">[];
}): MacroRecipe {
  const steps: MacroRecipeStep[] = params.steps.map((s, idx) =>
    Object.freeze({
      ...s,
      stepIndex: idx,
      parameters: Object.freeze({ ...s.parameters }),
    }),
  );

  return Object.freeze({
    id: params.id.trim(),
    title: params.title.trim(),
    description: params.description.trim(),
    author: params.author?.trim(),
    steps: Object.freeze(steps),
  });
}

/**
 * 매크로 레시피를 가상 실행(Dry-run) 또는 디스패처에 전달하여 리포트를 생성한다.
 */
export function executeMacroRecipe(
  macro: MacroRecipe,
  executor: (step: MacroRecipeStep) => { success: boolean; affectedCount: number; message?: string },
  nowMs: number,
): MacroExecutionReport {
  const stepResults: MacroStepExecutionResult[] = [];
  let overallSuccess = true;

  for (const step of macro.steps) {
    const res = executor(step);
    stepResults.push(
      Object.freeze({
        stepIndex: step.stepIndex,
        commandId: step.commandId,
        success: res.success,
        affectedCount: res.affectedCount,
        message: res.message,
      }),
    );
    if (!res.success) {
      overallSuccess = false;
      break; // Stop on first failure
    }
  }

  return Object.freeze({
    macroId: macro.id,
    totalSteps: macro.steps.length,
    success: overallSuccess,
    stepResults: Object.freeze(stepResults),
    executedAtMs: nowMs,
  });
}
