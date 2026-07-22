import { describe, expect, it, vi } from "vitest";

import {
  executeStudioCompanionToolCommand,
  type StudioCompanionToolCommandActions,
} from "./studio-companion-tool-command-executor";

import type { DrawMode, Tool } from "./studio-editor-tool-model";
import type { StudioCompanionCommandName } from "./studio-tools-companion";

interface ActionHarness {
  actions: StudioCompanionToolCommandActions;
  calls: string[];
  disarmAllPixelTools: ReturnType<typeof vi.fn<() => void>>;
  setDrawMode: ReturnType<typeof vi.fn<(mode: DrawMode) => void>>;
  setTool: ReturnType<typeof vi.fn<(tool: Tool) => void>>;
}

function createActionHarness(): ActionHarness {
  const calls: string[] = [];
  const disarmAllPixelTools = vi.fn(() => {
    calls.push("disarm");
  });
  const setTool = vi.fn((tool: Tool) => {
    calls.push(`tool:${tool}`);
  });
  const setDrawMode = vi.fn((mode: DrawMode) => {
    calls.push(`draw-mode:${mode}`);
  });

  return {
    actions: { disarmAllPixelTools, setDrawMode, setTool },
    calls,
    disarmAllPixelTools,
    setDrawMode,
    setTool,
  };
}

describe("executeStudioCompanionToolCommand", () => {
  it.each([
    ["select", ["disarm", "tool:select"]],
    ["pen", ["disarm", "tool:draw", "draw-mode:pen"]],
    ["eraser", ["disarm", "tool:draw", "draw-mode:eraser"]],
  ] as const)("runs %s in canonical disarm-first order", (command, expectedCalls) => {
    const harness = createActionHarness();

    const result = executeStudioCompanionToolCommand(command, harness.actions);

    expect(result).toEqual({ handled: true });
    expect(harness.calls).toEqual(expectedCalls);
    expect(harness.disarmAllPixelTools).toHaveBeenCalledTimes(1);
  });

  it("does not change draw mode for select", () => {
    const harness = createActionHarness();

    executeStudioCompanionToolCommand("select", harness.actions);

    expect(harness.setTool).toHaveBeenCalledExactlyOnceWith("select");
    expect(harness.setDrawMode).not.toHaveBeenCalled();
  });

  it.each([
    "template",
    "bubble",
    "text",
    "layers",
    "ai",
    "3d-character",
    "3d-bg",
    "focus-primary",
    "toggle-canvas-only",
    "enter-canvas-only",
    "exit-canvas-only",
  ] satisfies readonly StudioCompanionCommandName[])(
    "leaves non-tool command %s to the caller",
    (command) => {
      const harness = createActionHarness();

      const result = executeStudioCompanionToolCommand(command, harness.actions);

      expect(result).toEqual({ handled: false });
      expect(harness.calls).toEqual([]);
      expect(harness.disarmAllPixelTools).not.toHaveBeenCalled();
      expect(harness.setTool).not.toHaveBeenCalled();
      expect(harness.setDrawMode).not.toHaveBeenCalled();
    }
  );
});
