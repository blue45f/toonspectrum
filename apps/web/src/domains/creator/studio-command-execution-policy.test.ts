import { describe, expect, it, vi } from "vitest";

import {
  canStudioCommandExecuteFromSearch,
  createStudioCommandExecutionBindings,
} from "./studio-command-execution-registry";

import type { StudioCommandExecutionMenuItem } from "./studio-command-execution-registry";

function menuItem(
  commandId: string,
  overrides: Partial<StudioCommandExecutionMenuItem> = {},
): StudioCommandExecutionMenuItem {
  return {
    commandId,
    label: commandId,
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("Studio command-search direct execution policy", () => {
  it("admits reversible command families and reviewed affordances", () => {
    const groups = [
      {
        items: [
          menuItem("tool.brush"),
          menuItem("view.fit-width"),
          menuItem("window.app-settings"),
          menuItem("select.all"),
          menuItem("color.swap"),
          menuItem("help.current-tool"),
          menuItem("edit.undo"),
          menuItem("edit.history"),
          menuItem("file.export"),
          menuItem("file.project-tools"),
          menuItem("filter.gaussian-blur", { searchActivation: "execute" }),
        ],
      },
    ];

    expect(
      createStudioCommandExecutionBindings(groups).map((binding) => binding.commandId),
    ).toEqual([
      "tool.brush",
      "view.fit-width",
      "window.app-settings",
      "select.all",
      "color.swap",
      "help.current-tool",
      "edit.undo",
      "edit.history",
      "file.export",
      "file.project-tools",
      "filter.gaussian-blur",
    ]);
  });

  it("keeps consequential, re-entrant and dangerous commands help-only", () => {
    const groups = [
      {
        items: [
          menuItem("file.publish"),
          menuItem("file.save-draft"),
          menuItem("layer.merge-visible"),
          menuItem("insert.image"),
          menuItem("help.command-search"),
          menuItem("view.destructive-reset", {
            danger: true,
            searchActivation: "execute",
          }),
          menuItem("command-without-namespace"),
        ],
      },
    ];

    expect(createStudioCommandExecutionBindings(groups)).toEqual([]);
  });

  it("lets explicit review cross namespace boundaries but never override danger", () => {
    expect(
      canStudioCommandExecuteFromSearch(
        menuItem("filter.last", { searchActivation: "execute" }),
      ),
    ).toBe(true);
    expect(canStudioCommandExecuteFromSearch(menuItem("filter.last"))).toBe(false);
    expect(
      canStudioCommandExecuteFromSearch(
        menuItem("filter.last", {
          danger: true,
          searchActivation: "execute",
        }),
      ),
    ).toBe(false);
  });
});