import { describe, expect, it } from "vitest";

import {
  creatorRoleWorkspacePreset,
  creatorRoleWorkspacePresetOptions,
} from "./creator-role-workspace-presets";
import { STUDIO_DEFAULT_WORKSPACES } from "./studio-workspaces";

describe("creator role workspace presets", () => {
  it("maps every creator role to an existing built-in workspace", () => {
    const ids = new Set(STUDIO_DEFAULT_WORKSPACES.map((workspace) => workspace.id));
    for (const role of [
      "creator", "story", "planner", "storyboard", "line-art", "background",
      "color", "lettering", "character", "three-d", "assistant", "editor",
      "producer", "localization", "reviewer",
    ] as const) {
      const preset = creatorRoleWorkspacePreset(role);
      expect(preset).not.toBeNull();
      expect(ids.has(preset!.workspaceId)).toBe(true);
    }
  });

  it("deduplicates the same editor layout across related roles", () => {
    expect(creatorRoleWorkspacePresetOptions(["line-art", "assistant", "character"]))
      .toHaveLength(1);
  });
});
