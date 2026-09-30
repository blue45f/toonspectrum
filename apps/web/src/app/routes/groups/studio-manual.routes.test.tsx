import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { shouldAppRouterOwnDocumentTitle } from "../app-route-title-ownership";

import { creatorRoutes } from "./creator.routes";

function routeId(pathname: string) {
  return matchRoutes([...creatorRoutes], pathname)?.at(-1)?.route.id;
}

describe("independent Studio manual routes", () => {
  it("matches the manual index before the editor wildcard", () => {
    expect(routeId("/studio/manual")).toBe("creator-studio-manual");
    expect(routeId("/studio/manual/")).toBe("creator-studio-manual");
  });

  it("owns article deep links, including a friendly unknown article", () => {
    expect(routeId("/studio/manual/brushes")).toBe("creator-studio-manual-article");
    expect(routeId("/studio/manual/unknown-article")).toBe("creator-studio-manual-article");
  });
  it("preserves editor, 3D and publish routes", () => {
    expect(routeId("/studio")).toBe("creator-studio-home");
    for (const path of ["/studio/canvas", "/studio/bg3d", "/studio/publish"]) {
      expect(routeId(path)).toBe("creator-studio");
    }
  });

  it("routes /studio/poser to the standalone poser page (dead-link fix)", () => {
    expect(routeId("/studio/poser")).toBe("creator-studio-poser");
    expect(routeId("/studio/poser?starter=action-pose-rig")).toBe("creator-studio-poser");
  });

  it("redirects the legacy character studio path to the character asset landing", () => {
    const match = matchRoutes([...creatorRoutes], "/studio/character")?.at(-1);
    expect(match?.route.id).toBe("creator-studio-character");
    expect(match?.route.element).toMatchObject({ props: { to: "/studio/assets/characters/new" } });
  });

  it("lets the manual own its article title without matching similar prefixes", () => {
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/studio/manual" })).toBe(false);
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/studio/manual/brushes" })).toBe(false);
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/guide" })).toBe(true);
    expect(routeId("/studio/manual-other")).toBe("creator-studio");
  });
});
