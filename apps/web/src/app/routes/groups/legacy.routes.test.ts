import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";
import { legacyRedirectRoutes } from "./legacy.routes";

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

const EXPECTED_LEGACY_REDIRECTS = [
  { id: "legacy-new", path: "/new", target: "/studio/new" },
  { id: "legacy-more", path: "/more", target: "/sitemap" },
  { id: "legacy-tour", path: "/tour", target: "/product-tour" },
  { id: "legacy-principles", path: "/principles", target: "/about/principles" },
  { id: "legacy-story", path: "/story", target: "/story-lab" },
  { id: "legacy-canvas", path: "/canvas", target: "/studio/canvas" },
] as const;

describe("레거시 단축 URL redirect", () => {
  it("registers every legacy path before the catch-all", () => {
    for (const expected of EXPECTED_LEGACY_REDIRECTS) {
      expect(legacyRedirectRoutes).toContainEqual(expect.objectContaining({ id: expected.id, path: expected.path }));
      expect(appRoutes).toContainEqual(expect.objectContaining({ id: expected.id, path: expected.path }));
    }
  });

  it("keeps the catch-all last so legacy redirects stay explicit", () => {
    expect(appRoutes.at(-1)).toMatchObject({ id: "not-found", path: "*" });
  });

  it("matches each legacy path to its redirect instead of the 404", () => {
    for (const expected of EXPECTED_LEGACY_REDIRECTS) {
      const matched = matchRoutes(appRoutes, expected.path)?.at(-1)?.route.id;
      expect(matched).toBe(expected.id);
    }
  });

  it("points every redirect target at a registered route", () => {
    for (const expected of EXPECTED_LEGACY_REDIRECTS) {
      const matched = matchRoutes(appRoutes, expected.target);
      expect(matched, `${expected.path} -> ${expected.target}`).not.toBeNull();
      expect(matched?.at(-1)?.route.id).not.toBe("not-found");
    }
  });

  it("shares each redirect target with the canonical site alias table", () => {
    // 머리글 현재 위치·시각 분류는 별칭 표를 읽으므로 리다이렉트 목적지와 어긋나면 안 된다.
    for (const expected of EXPECTED_LEGACY_REDIRECTS) {
      expect(canonicalSitePath(expected.path), expected.path).toBe(expected.target);
    }
  });
});
