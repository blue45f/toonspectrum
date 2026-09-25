// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY,
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceEntryPreference,
  studioVirtualSpaceNicknameFromAccount,
  writeStudioVirtualSpaceEntryPreference,
} from "./studio-virtual-space-entry-preference";

beforeEach(() => localStorage.clear());

describe("virtual space entry preference", () => {
  it("requires a first-entry confirmation without inventing a stored choice", () => {
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false, nickname: "" });
  });

  it("persists only an explicitly selected character with a versioned record", () => {
    expect(writeStudioVirtualSpaceEntryPreference(2)).toBe(true);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: 2, confirmed: true, nickname: "" });
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toEqual({
      version: 2, confirmed: true, avatarIndex: 2,
    });
    expect(writeStudioVirtualSpaceEntryPreference(-1)).toBe(false);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: 2, confirmed: true, nickname: "" });
  });

  it("rejects corrupt and out-of-range values", () => {
    localStorage.setItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY, JSON.stringify({ version: 2, confirmed: true, avatarIndex: 99 }));
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false, nickname: "" });
    expect(writeStudioVirtualSpaceEntryPreference(99)).toBe(false);
  });

  it("normalizes and persists a public nickname without exposing email addresses", () => {
    expect(normalizeStudioVirtualSpaceNickname("  희준   작가  ")).toBe("희준 작가");
    expect(normalizeStudioVirtualSpaceNickname("admin")).toBeNull();
    expect(normalizeStudioVirtualSpaceNickname("test@example.com")).toBeNull();
    expect(studioVirtualSpaceNicknameFromAccount("Creator Kim")).toBe("Creator Kim");
    expect(studioVirtualSpaceNicknameFromAccount("creator@example.com")).toBeNull();

    expect(writeStudioVirtualSpaceEntryPreference(1, " 희준 작가 ")).toBe(true);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({
      avatarIndex: 1,
      confirmed: true,
      nickname: "희준 작가",
    });
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      confirmed: true,
      avatarIndex: 1,
      nickname: "희준 작가",
    });
  });
});
