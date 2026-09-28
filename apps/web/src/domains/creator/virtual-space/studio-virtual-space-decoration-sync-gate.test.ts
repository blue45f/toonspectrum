import { describe, expect, it } from "vitest";

import { studioVirtualSpaceSyncEnabled } from "./studio-virtual-space-decoration-sync-gate";

describe("virtual space sync flag", () => {
  it("stays off when the flag is missing so the local path is unchanged", () => {
    expect(studioVirtualSpaceSyncEnabled({})).toBe(false);
  });

  it("turns on only for the explicit truthy spellings", () => {
    for (const value of ["1", "true", "on", "TRUE", " On "]) {
      expect(studioVirtualSpaceSyncEnabled({ VITE_STUDIO_SPACE_SYNC: value })).toBe(true);
    }
  });

  it("stays off for values that only look truthy", () => {
    for (const value of ["0", "false", "off", "yes", "enabled", ""]) {
      expect(studioVirtualSpaceSyncEnabled({ VITE_STUDIO_SPACE_SYNC: value })).toBe(false);
    }
  });

  it("ignores a non string flag rather than guessing", () => {
    expect(studioVirtualSpaceSyncEnabled({ VITE_STUDIO_SPACE_SYNC: 1 })).toBe(false);
    expect(studioVirtualSpaceSyncEnabled({ VITE_STUDIO_SPACE_SYNC: true })).toBe(false);
  });
});
