import { describe, expect, it } from "vitest";

import { isImmersiveMobileRoute } from "./immersive-mobile-route";

describe("isImmersiveMobileRoute", () => {
  it.each(["/studio/work/1", "/studio/work/1/canvas"])(
    "treats %s as a Studio-owned mobile chrome route",
    (pathname) => {
      expect(isImmersiveMobileRoute(pathname)).toBe(true);
    }
  );

  it.each(["/", "/create", "/studio", "/studio/", "/studio/projects", "/studio/new", "/studio-guide", "/studios"])(
    "keeps global mobile controls on %s",
    (pathname) => {
      expect(isImmersiveMobileRoute(pathname)).toBe(false);
    }
  );
});
