import { describe, expect, it } from "vitest";

import {
  activeProjectIdFromLocation,
  contextualProjectHref,
  readActiveProjectContext,
  supportsActiveProjectBridge,
  writeActiveProjectContext,
} from "./active-project-context";

describe("active project context", () => {
  it.each([
    ["/studio/p/project-1/overview", "", "project-1"],
    ["/studio/work/work-2/canvas", "", "work-2"],
    ["/production/projects/project%203/review", "", "project 3"],
    ["/market", "?project=project-4", "project-4"],
  ])("extracts one exact project from %s%s", (pathname, search, expected) => {
    expect(activeProjectIdFromLocation(pathname, search)).toBe(expected);
  });

  it("rejects duplicate query authority", () => {
    expect(activeProjectIdFromLocation("/market", "?project=a&project=b")).toBeNull();
  });

  it("stores only one bounded project identity", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    writeActiveProjectContext(storage, "project-1");
    expect(readActiveProjectContext(storage)).toBe("project-1");
    writeActiveProjectContext(storage, null);
    expect(readActiveProjectContext(storage)).toBeNull();
  });

  it("fails open when session storage is blocked", () => {
    const storage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(readActiveProjectContext(storage)).toBeNull();
    expect(() => writeActiveProjectContext(storage, "project-1")).not.toThrow();
  });

  it("routes ecosystem actions back into the same project", () => {
    expect(contextualProjectHref("/market", "project-1")).toEqual({
      href: "/studio/assets?project=project-1&view=market",
      labelKo: "이 작품에 소재 추가",
      labelEn: "Add assets to this work",
    });
    expect(contextualProjectHref("/learn", "project-1").href).toBe("/learn?project=project-1");
  });

  it("limits the bridge to connected ecosystem pages", () => {
    expect(supportsActiveProjectBridge("/research/assets")).toBe(true);
    expect(supportsActiveProjectBridge("/studio/bg3d")).toBe(false);
  });
});
