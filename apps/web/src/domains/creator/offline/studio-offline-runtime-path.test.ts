import { describe, expect, it } from "vitest";

import { isStudioOfflineRuntimePath } from "./studio-offline-runtime-path";

describe("Studio offline runtime route boundary", () => {
  it.each([
    "/studio",
    "/studio/canvas",
    "/studio/projects/example/overview",
  ])("enables automatic app mode for %s", (pathname) => {
    expect(isStudioOfflineRuntimePath(pathname)).toBe(true);
  });

  it.each(["/", "/market", "/showcase", "/studios"])(
    "does not load Studio automation for %s",
    (pathname) => {
      expect(isStudioOfflineRuntimePath(pathname)).toBe(false);
    },
  );
});
