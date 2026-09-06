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

  it("keeps the Studio editor behind one canonical wildcard entry", () => {
    const studioRoutes = appRoutes.filter((route) => route.path.startsWith("/studio"));
    expect(studioRoutes.filter((route) => route.path.includes("*"))).toEqual([
      expect.objectContaining({
        id: "creator-studio",
        path: "/studio/*",
      }),
    ]);
    expect(studioRoutes.at(-1)).toMatchObject({ id: "creator-studio", path: "/studio/*" });
    // Public reference pages that must never boot the editor bundle are the only explicit
    // entries in front of the wildcard; every other /studio path belongs to StudioRouter.
    expect(studioRoutes.slice(0, -1).map((route) => route.path)).toEqual([
      "/studio/manual",
      "/studio/manual/:articleId",
    ]);
  });
});
