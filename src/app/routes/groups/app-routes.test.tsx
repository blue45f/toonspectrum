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

  it("keeps the editor behind one canonical Studio wildcard, with only the manual ahead of it", () => {
    // #794 (0514bc94) registers the public user manual as two explicit lazy routes that outrank
    // `/studio/*` and bypass StudioRouter's editor/dictionary loader (docs/studio/user-manual-page.md).
    // Every other Studio surface still lives behind the single wildcard entry.
    expect(
      appRoutes
        .filter((route) => route.path.startsWith("/studio"))
        .map(({ id, path }) => ({ id, path })),
    ).toEqual([
      { id: "creator-studio-manual", path: "/studio/manual" },
      { id: "creator-studio-manual-article", path: "/studio/manual/:articleId" },
      { id: "creator-studio", path: "/studio/*" },
    ]);
  });
});
