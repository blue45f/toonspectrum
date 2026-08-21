import { describe, expect, it } from "vitest";

import {
  createMacroRecipe,
  executeMacroRecipe,
  getContextualRadialMenu,
} from "./studio-macro-quick-menu";

describe("Studio Quick Action Radial Menu & Macro Runner", () => {
  it("provides contextual radial actions based on selection mode", () => {
    const idleMenu = getContextualRadialMenu("idle");
    expect(idleMenu.actions.some((a) => a.commandId === "tool:select-brush")).toBe(true);

    const panelMenu = getContextualRadialMenu("panel-selected");
    expect(panelMenu.actions.some((a) => a.commandId === "panel:split-horizontal")).toBe(true);
    expect(panelMenu.actions.some((a) => a.commandId === "panel:insert-3d-scene")).toBe(true);

    const textMenu = getContextualRadialMenu("text-selected");
    expect(textMenu.actions.some((a) => a.commandId === "balloon:rotate-tail")).toBe(true);
  });

  it("creates and executes macro recipe step by step", () => {
    const macro = createMacroRecipe({
      id: "macro_line_tone",
      title: "선화 추출 및 톤 적용 일괄 매크로",
      description: "선택된 모든 컷에 선화 추출 필터를 걸고 하프톤 스크린을 씌웁니다.",
      steps: [
        { commandId: "filter:extract-line", targetSelector: "all-selected-panels", parameters: { threshold: 128 } },
        { commandId: "layer:apply-halftone", targetSelector: "all-selected-panels", parameters: { frequency: 40, angle: 45 } },
      ],
    });

    expect(macro.steps).toHaveLength(2);
    expect(macro.steps[0].stepIndex).toBe(0);
    expect(macro.steps[1].stepIndex).toBe(1);

    const report = executeMacroRecipe(
      macro,
      (step) => ({ success: true, affectedCount: 5, message: `Step ${step.stepIndex} executed on 5 panels` }),
      1_700_000_000_000,
    );

    expect(report.success).toBe(true);
    expect(report.totalSteps).toBe(2);
    expect(report.stepResults[0].affectedCount).toBe(5);
  });

  it("halts execution on step failure", () => {
    const macro = createMacroRecipe({
      id: "macro_fail",
      title: "실패 매크로",
      description: "2번째 단계에서 실패하는 매크로",
      steps: [
        { commandId: "cmd_1", targetSelector: "active-layer", parameters: {} },
        { commandId: "cmd_2", targetSelector: "active-layer", parameters: {} },
      ],
    });

    const report = executeMacroRecipe(
      macro,
      (step) => {
        if (step.stepIndex === 1) return { success: false, affectedCount: 0, message: "에러 발생" };
        return { success: true, affectedCount: 1 };
      },
      1_700_000_000_000,
    );

    expect(report.success).toBe(false);
    expect(report.stepResults[1].message).toBe("에러 발생");
  });
});
