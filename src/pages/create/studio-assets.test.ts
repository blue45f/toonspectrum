import { describe, it, expect } from "vitest";
import { filterAssetsByLabel, filterBgSceneSections } from "./studio-assets";

describe("studio-assets picker search helpers", () => {
  const stickers = [
    { id: "cat", label: "고양이" },
    { id: "dog", label: "강아지" },
    { id: "sparkle", label: "Sparkle Burst" },
  ];

  describe("filterAssetsByLabel", () => {
    it("should return the original list for an empty or whitespace-only query", () => {
      expect(filterAssetsByLabel(stickers, "")).toBe(stickers);
      expect(filterAssetsByLabel(stickers, "   ")).toBe(stickers);
    });

    it("should match by label substring", () => {
      expect(filterAssetsByLabel(stickers, "고양")).toEqual([{ id: "cat", label: "고양이" }]);
    });

    it("should ignore case and surrounding whitespace", () => {
      expect(filterAssetsByLabel(stickers, "  SPARKLE ")).toEqual([{ id: "sparkle", label: "Sparkle Burst" }]);
    });

    it("should return an empty list when nothing matches", () => {
      expect(filterAssetsByLabel(stickers, "용")).toEqual([]);
    });
  });

  describe("filterBgSceneSections", () => {
    const sections = [
      {
        genre: "일상·학원",
        scenes: [
          { id: "classroom", label: "햇살 교실" },
          { id: "rooftop", label: "학교 옥상" },
        ],
      },
      { genre: "판타지", scenes: [{ id: "portal", label: "마법 학원 게이트" }] },
    ];

    it("should return sections unchanged for an empty query", () => {
      expect(filterBgSceneSections(sections, "")).toBe(sections);
    });

    it("should filter scenes per section and drop sections left empty", () => {
      expect(filterBgSceneSections(sections, "교실")).toEqual([
        { genre: "일상·학원", scenes: [{ id: "classroom", label: "햇살 교실" }] },
      ]);
    });

    it("should keep section order when multiple sections match", () => {
      const result = filterBgSceneSections(sections, "학");
      expect(result.map((section) => section.genre)).toEqual(["일상·학원", "판타지"]);
      expect(result[0].scenes.map((scene) => scene.id)).toEqual(["rooftop"]);
    });

    it("should return an empty list when no scene matches", () => {
      expect(filterBgSceneSections(sections, "우주정거장")).toEqual([]);
    });
  });
});
