/**
 * Primary editor transition boundary for tool commands sent by a Studio companion.
 *
 * The companion protocol transports intent only. The primary owns every armed pixel tool, so a
 * select/pen/eraser transition must disarm those tools before changing the canonical editor mode.
 * All effects are injected to keep this module independent of React, DOM, and companion runtime.
 */

import type { DrawMode, Tool } from "./studio-editor-tool-model";
import type { StudioCompanionCommandName } from "./studio-tools-companion";

export interface StudioCompanionToolCommandActions {
  disarmAllPixelTools: () => void;
  setTool: (tool: Tool) => void;
  setDrawMode: (mode: DrawMode) => void;
}

export interface StudioCompanionToolCommandExecution {
  readonly handled: boolean;
}

const HANDLED: StudioCompanionToolCommandExecution = Object.freeze({ handled: true });
const NOT_HANDLED: StudioCompanionToolCommandExecution = Object.freeze({ handled: false });

/**
 * Executes companion tool commands in the same order as the primary editor's local tool controls.
 * Non-tool commands are left to the caller's existing command router.
 */
export function executeStudioCompanionToolCommand(
  command: StudioCompanionCommandName,
  actions: StudioCompanionToolCommandActions
): StudioCompanionToolCommandExecution {
  switch (command) {
    case "select":
      actions.disarmAllPixelTools();
      actions.setTool("select");
      return HANDLED;
    case "pen":
      actions.disarmAllPixelTools();
      actions.setTool("draw");
      actions.setDrawMode("pen");
      return HANDLED;
    case "eraser":
      actions.disarmAllPixelTools();
      actions.setTool("draw");
      actions.setDrawMode("eraser");
      return HANDLED;
    default:
      return NOT_HANDLED;
  }
}
