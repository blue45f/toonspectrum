// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createStudioProject,
  readStudioProjectLibrary,
  trashStudioProject,
} from "./studio-project-library-store";
import {
  archiveStudioProjectsBulk,
  permanentlyDeleteStudioProjectsBulk,
  restoreStudioProjectsBulk,
  trashStudioProjectsBulk,
} from "./studio-project-library-bulk";

beforeEach(() => {
  window.localStorage.clear();
});

describe("studio project library bulk mutations", () => {
  it("moves eligible projects with one canonical library update", () => {
    createStudioProject(window.localStorage, { id: "one", title: "One", kind: "webtoon" });
    createStudioProject(window.localStorage, { id: "two", title: "Two", kind: "webtoon" });
    const result = archiveStudioProjectsBulk(window.localStorage, ["one", "two", "missing"], {
      at: "2026-09-16T00:00:00.000Z",
      target: window,
    });

    expect(result.affectedIds).toEqual(["one", "two"]);
    expect(result.skippedIds).toEqual(["missing"]);
    expect(readStudioProjectLibrary(window.localStorage).projects.every((project) => project.status === "archived"))
      .toBe(true);
  });

  it("restores previous status and permanently removes only trashed projects", () => {
    createStudioProject(window.localStorage, { id: "active", title: "Active", kind: "webtoon" });
    createStudioProject(window.localStorage, { id: "trashed", title: "Trashed", kind: "webtoon" });
    trashStudioProject(window.localStorage, "trashed");

    const skipped = permanentlyDeleteStudioProjectsBulk(window.localStorage, ["active"]);
    expect(skipped.affectedIds).toHaveLength(0);
    expect(skipped.skippedIds).toEqual(["active"]);

    const restored = restoreStudioProjectsBulk(window.localStorage, ["trashed"]);
    expect(restored.affectedIds).toEqual(["trashed"]);
    expect(readStudioProjectLibrary(window.localStorage).projects.find((project) => project.id === "trashed")?.status)
      .toBe("active");

    trashStudioProjectsBulk(window.localStorage, ["trashed"]);
    permanentlyDeleteStudioProjectsBulk(window.localStorage, ["trashed"]);
    expect(readStudioProjectLibrary(window.localStorage).projects.map((project) => project.id)).toEqual(["active"]);
  });
});
