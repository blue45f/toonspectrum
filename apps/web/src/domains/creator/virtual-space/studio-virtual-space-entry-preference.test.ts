// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY,
  readStudioVirtualSpaceEntryPreference,
  writeStudioVirtualSpaceEntryPreference,
} from "./studio-virtual-space-entry-preference";

beforeEach(() => localStorage.clear());

describe("virtual space entry preference", () => {
  it("requires a first-entry confirmation without inventing a stored choice", () => {
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false });
  });

  it("persists only an explicitly selected character with a versioned record", () => {
    expect(writeStudioVirtualSpaceEntryPreference(2)).toBe(true);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: 2, confirmed: true });
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toEqual({
      version: 2, confirmed: true, avatarIndex: 2,
    });
    expect(writeStudioVirtualSpaceEntryPreference(-1)).toBe(false);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: 2, confirmed: true });
  });

  it("rejects corrupt and out-of-range values", () => {
    localStorage.setItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY, JSON.stringify({ version: 2, confirmed: true, avatarIndex: 99 }));
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false });
    expect(writeStudioVirtualSpaceEntryPreference(99)).toBe(false);
  });
});
