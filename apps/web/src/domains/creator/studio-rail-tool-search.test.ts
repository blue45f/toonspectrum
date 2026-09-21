import { describe, expect, it } from "vitest";
import { matchesStudioRailToolQuery } from "./studio-rail-tool-search";

describe("tool search aliases", () => {
  it.each([["eyedropper", "스포이드"], ["eyedropper", "Color Picker"], ["hand", "팬"],
    ["transform", "resize"], ["bg3d", "３Ｄ 배경"], ["fill", "bucket"]] as const)("finds %s using %s", (id, query) => {
    expect(matchesStudioRailToolQuery(id, query)).toBe(true);
  });
  it("searches localized names, combines terms and supports an empty query", () => {
    expect(matchesStudioRailToolQuery("reference", "Reference", () => "Reference image")).toBe(true);
    expect(matchesStudioRailToolQuery("pen", "")).toBe(true);
    expect(matchesStudioRailToolQuery("pen", "3d 배경")).toBe(false);
  });
});
