import { describe, expect, it } from "vitest";

import {
  STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER,
  createStudioMainMenuPresentation,
} from "./studio-main-menu-presentation";

describe("createStudioMainMenuPresentation", () => {
  it("presents the familiar comic-production loop before specialist extensions", () => {
    const groups = [
      "file",
      "edit",
      "view",
      "canvas",
      "layer",
      "select",
      "transform",
      "brush",
      "filter",
      "vector",
      "text",
      "comic",
      "animation",
      "3d",
      "collaboration",
      "window",
      "ai",
      "help",
    ].map((id) => ({ id, items: [{ id: `${id}-command` }] }));

    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.groups.map((group) => group.id)).toEqual([
      ...STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER,
      "canvas",
      "transform",
      "brush",
      "vector",
      "text",
      "3d",
      "collaboration",
      "ai",
    ]);
    expect(presentation.specialistBoundaryGroupId).toBe("canvas");
  });

  it("preserves every group, command array, and future specialist group by reference", () => {
    const groups = [
      { id: "future-surface", items: [{ id: "future-command" }] },
      { id: "help", items: [{ id: "help-command" }] },
      { id: "file", items: [{ id: "save" }] },
      { id: "another-extension", items: [{ id: "extension-command" }] },
    ] as const;

    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.groups.map((group) => group.id)).toEqual([
      "file",
      "help",
      "future-surface",
      "another-extension",
    ]);
    expect(presentation.groups).toHaveLength(groups.length);
    for (const group of groups) {
      const presented = presentation.groups.find((candidate) => candidate.id === group.id);
      expect(presented).toBe(group);
      expect(presented?.items).toBe(group.items);
    }
    expect(presentation.specialistGroupIds).toEqual([
      "future-surface",
      "another-extension",
    ]);
  });

  it("omits a tier boundary when the catalogue has only one tier", () => {
    expect(
      createStudioMainMenuPresentation([{ id: "file" }, { id: "help" }])
        .specialistBoundaryGroupId
    ).toBeNull();
    expect(
      createStudioMainMenuPresentation([{ id: "future-a" }, { id: "future-b" }])
        .specialistBoundaryGroupId
    ).toBeNull();
  });
});
