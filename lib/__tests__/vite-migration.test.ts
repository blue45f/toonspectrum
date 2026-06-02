import { describe, expect, it } from "vitest";
import { appRoutes } from "../../src/routes/route-manifest";
import { apiPath } from "../../src/vite/api";

describe("vite migration", () => {
  it("declares the primary product routes in the Vite router manifest", () => {
    expect(appRoutes.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/",
        "/ranking",
        "/search",
        "/recommend",
        "/explore",
        "/calendar",
        "/reviews",
        "/community",
        "/library",
        "/compare",
        "/insights",
      ])
    );
  });

  it("keeps API calls rooted at /api by default for the Vite proxy", () => {
    expect(apiPath("/ranking?limit=3")).toBe("/api/ranking?limit=3");
    expect(apiPath("search")).toBe("/api/search");
  });
});
