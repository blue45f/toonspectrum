import { describe, expect, it } from "vitest";

import { MANUAL_ARTICLE_SCREENS, MANUAL_SECTION_TOOLS, manualArticleScreen, manualSectionTool, manualStepRegions } from "./manual-article-screens";
import {
  MANUAL_REGION_COPY,
  MANUAL_SURFACE_REGIONS,
  MANUAL_SURFACES,
  manualRegionCopy,
  manualRegionNumber,
  manualSurfaceRegions,
  type ManualBilingual,
  type ManualSurface,
} from "./manual-screen-map";
import { MANUAL_ARTICLES } from "./studio-manual-data";

const SURFACES = Object.keys(MANUAL_SURFACE_REGIONS) as ManualSurface[];

describe("manual screen map data", () => {
  it("gives every article a screen map and every map a real article", () => {
    for (const article of MANUAL_ARTICLES) expect(manualArticleScreen(article.id), article.id).toBeTruthy();
    const ids = new Set(MANUAL_ARTICLES.map((article) => article.id));
    for (const id of Object.keys(MANUAL_ARTICLE_SCREENS)) expect(ids.has(id), id).toBe(true);
  });

  it("keeps step locations aligned with the written steps and the numbered legend", () => {
    for (const article of MANUAL_ARTICLES) {
      const screen = manualArticleScreen(article.id);
      expect(screen, article.id).toBeTruthy();
      if (!screen) continue;
      // 번호가 붙는 영역은 중복 없이 그 화면 종류의 영역이어야 한다.
      expect(new Set(screen.focus).size, article.id).toBe(screen.focus.length);
      for (const region of screen.focus) expect(manualSurfaceRegions(screen.surface), `${article.id}:${region}`).toContain(region);

      for (const [sectionId, regions] of Object.entries(screen.steps ?? {})) {
        const section = article.sections.find((entry) => entry.id === sectionId);
        expect(section, `${article.id}#${sectionId}`).toBeTruthy();
        // 단계 수와 위치 수가 같아야 번호가 어긋나지 않는다.
        expect(regions.length, `${article.id}#${sectionId}`).toBe(section?.steps?.length ?? -1);
        // 단계가 가리키는 영역은 도식에서 번호가 붙은(강조한) 영역이어야 한다.
        for (const region of regions) {
          if (region) expect(manualRegionNumber(screen, region), `${article.id}#${sectionId}:${region}`).toBeGreaterThan(0);
        }
        expect(manualStepRegions(screen, sectionId)).toBe(regions);
      }
    }
    expect(manualStepRegions(undefined, "anything")).toEqual([]);
    expect(manualStepRegions(manualArticleScreen("brushes"), "no-such-section")).toEqual([]);
  });

  it("describes every region of every screen kind in both languages and lays it out exactly once", () => {
    for (const surface of SURFACES) {
      const regions = MANUAL_SURFACE_REGIONS[surface];
      const info = MANUAL_SURFACES[surface];
      expect(info.title.ko.length).toBeGreaterThan(1);
      expect(info.title.en.length).toBeGreaterThan(1);
      const laidOut = new Set(info.areas.flatMap((row) => row.split(" ")));
      expect([...laidOut].sort()).toEqual([...regions].sort());
      const table: Readonly<Record<string, { readonly name: ManualBilingual; readonly hint: ManualBilingual }>> = MANUAL_REGION_COPY[surface];
      for (const region of regions) {
        const copy = table[region];
        expect(copy?.name.ko, `${surface}:${region}`).toBeTruthy();
        expect(copy?.name.en, `${surface}:${region}`).toBeTruthy();
        expect(copy?.hint.ko, `${surface}:${region}`).toBeTruthy();
        expect(copy?.hint.en, `${surface}:${region}`).toBeTruthy();
      }
    }
  });

  it("numbers focused regions from 1 in focus order and ignores the rest", () => {
    const screen = manualArticleScreen("music-ost");
    if (!screen) throw new Error("music-ost 도식이 없습니다");
    expect(manualRegionNumber(screen, "mode")).toBe(1);
    expect(manualRegionNumber(screen, "library")).toBe(4);
    expect(manualRegionNumber(screen, "not-a-region")).toBeUndefined();
    expect(manualRegionCopy(screen, "presets")?.name.ko).toBe("스타터·테마");
    expect(manualRegionCopy(screen, "not-a-region")).toBeUndefined();
  });

  it("points section shortcuts only at real sections and in-app paths", () => {
    for (const [articleId, tools] of Object.entries(MANUAL_SECTION_TOOLS)) {
      const article = MANUAL_ARTICLES.find((entry) => entry.id === articleId);
      expect(article, articleId).toBeTruthy();
      for (const [sectionId, tool] of Object.entries(tools)) {
        expect(article?.sections.some((section) => section.id === sectionId), `${articleId}#${sectionId}`).toBe(true);
        expect(tool.href, `${articleId}#${sectionId}`).toMatch(/^\/(?!\/)[a-z0-9/-]*(#[a-z0-9-]+)?$/u);
        expect(tool.label.ko.length).toBeGreaterThan(2);
        expect(tool.label.en.length).toBeGreaterThan(2);
        expect(manualSectionTool(articleId, sectionId)).toBe(tool);
      }
    }
    expect(manualSectionTool("brushes", "basics")).toBeUndefined();
  });
});
