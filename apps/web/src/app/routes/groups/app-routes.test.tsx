import { describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

interface RouteSurface {
  readonly id: string;
  readonly path: string;
}

const REQUIRED_STUDIO_FRONT_DOOR_SURFACES: readonly RouteSurface[] = [
  { id: "creator-studio-home", path: "/studio" },
  { id: "creator-studio-new", path: "/studio/new" },
  { id: "creator-studio-import", path: "/studio/import" },
  { id: "creator-studio-assets", path: "/studio/assets" },
  { id: "creator-studio-assets-brush-new", path: "/studio/assets/brushes/new" },
  { id: "creator-studio-assets-character-new", path: "/studio/assets/characters/new" },
  { id: "creator-studio-assets-audio", path: "/studio/assets/audio" },
  { id: "creator-studio-manual", path: "/studio/manual" },
  { id: "creator-studio-manual-article", path: "/studio/manual/:articleId" },
];

describe("application route registry", () => {
  it("keeps every route id and path unique", () => {
    expect(duplicates(appRoutes.map((route) => route.id))).toEqual([]);
    expect(duplicates(appRoutes.map((route) => route.path))).toEqual([]);
  });

  it("keeps the catch-all last so domain routes remain explicit", () => {
    expect(appRoutes.at(-1)).toMatchObject({ id: "not-found", path: "*" });
  });

  it("keeps Character Shaper as a compatible creator route while using Studio assets canonically", () => {
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "creator-character-shaper", path: "/shaper" }),
    );
    expect(appRoutes).toContainEqual(
      expect.objectContaining({
        id: "creator-studio-assets-character-new",
        path: "/studio/assets/characters/new",
      }),
    );
  });

  it("keeps Admin behind one canonical wildcard entry", () => {
    const adminRoutes = appRoutes.filter((route) => route.path.startsWith("/admin"));
    expect(adminRoutes).toEqual([
      expect.objectContaining({ id: "admin", path: "/admin/*" }),
    ]);
  });

  it("keeps one Studio wildcard after explicit front-door and compatibility routes", () => {
    const studioRoutes = appRoutes.filter((route) => route.path.startsWith("/studio"));
    const wildcardEntries = studioRoutes.filter((route) => route.path.includes("*"));

    expect(wildcardEntries).toEqual([
      expect.objectContaining({ id: "creator-studio", path: "/studio/*" }),
    ]);
    expect(studioRoutes.at(-1)).toMatchObject({ id: "creator-studio", path: "/studio/*" });

    for (const required of REQUIRED_STUDIO_FRONT_DOOR_SURFACES) {
      expect(studioRoutes, required.id).toContainEqual(expect.objectContaining(required));
    }
  });

  it("owns the canonical Showcase namespace without removing legacy creator-gallery URLs", () => {
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "creator-showcase", path: "/showcase" }),
    );
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "creator-gallery", path: "/create" }),
    );
  });

  it("routes legacy creator hubs to canonical Studio destinations", () => {
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "resources-make", path: "/make" }),
    );
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "resources-hub", path: "/creator-hub" }),
    );
    expect(appRoutes).toContainEqual(
      expect.objectContaining({ id: "resources-publishing", path: "/publishing" }),
    );
  });
});
