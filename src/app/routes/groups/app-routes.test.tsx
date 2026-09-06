import { describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("application route registry", () => {
  it("keeps every route id and path unique", () => {
    expect(duplicates(appRoutes.map((route) => route.id))).toEqual([]);
    expect(duplicates(appRoutes.map((route) => route.path))).toEqual([]);
  });

  it("keeps the catch-all last so domain routes remain explicit", () => {
    expect(appRoutes.at(-1)).toMatchObject({
      id: "not-found",
      path: "*",
    });
  });

  it("keeps Character Shaper in the creator route registry", () => {
    expect(appRoutes).toContainEqual(
      expect.objectContaining({
        id: "creator-character-shaper",
        path: "/shaper",
      }),
    );
  });

  it("keeps the editor behind one canonical Studio wildcard, with only the manual and brush lab ahead of it", () => {
    // #794 (0514bc94) registers the public user manual as two explicit lazy routes that outrank
    // `/studio/*` and bypass StudioRouter's editor/dictionary loader (docs/studio/user-manual-page.md);
    // #816 (0cea53dd) does the same for the scoped Brush Lab entries. Every other Studio surface
    // still lives behind the single wildcard entry, and this list pins the order in front of it.
    expect(
      appRoutes
        .filter((route) => route.path.startsWith("/studio"))
        .map(({ id, path }) => ({ id, path })),
    ).toEqual([
      { id: "creator-studio-brush-lab", path: "/studio/brush-lab" },
      { id: "creator-studio-work-brush-lab", path: "/studio/work/:workId/brush-lab" },
      { id: "creator-studio-remix-brush-lab", path: "/studio/remix/:sourceWorkId/brush-lab" },
      { id: "creator-studio-manual", path: "/studio/manual" },
      { id: "creator-studio-manual-article", path: "/studio/manual/:articleId" },
      { id: "creator-studio", path: "/studio/*" },
    ]);
  });
});
