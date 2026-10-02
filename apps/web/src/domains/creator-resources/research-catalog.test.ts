import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  RESEARCH_CATEGORIES,
  RESEARCH_RECIPES,
  RESEARCH_USAGE_HINTS,
  RESEARCH_USAGE_LABELS,
  savedCountForCategory,
} from "./research-catalog";

/** 리서치 라우트 표 — 타일·추천 조합이 가리키는 화면이 실제로 있는지 소스에서 확인한다(죽은 링크 방지). */
const researchRoutes = readFileSync(new URL("../../app/routes/groups/creator-resources.routes.tsx", import.meta.url), "utf8");
const routePaths = new Set([...researchRoutes.matchAll(/path:\s*"([^"]+)"/gu)].map((match) => match[1]));

describe("research desk catalog", () => {
  it("lists the categories the desk promises, each with an icon, a short description and real providers", () => {
    expect(RESEARCH_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(RESEARCH_CATEGORIES.map((category) => category.id)).size).toBe(RESEARCH_CATEGORIES.length);
    for (const category of RESEARCH_CATEGORIES) {
      expect(category.providers.length).toBeGreaterThan(0);
      expect(category.title[0].length).toBeGreaterThan(0);
      expect(category.title[1].length).toBeGreaterThan(0);
      // 모바일 2열 타일에서 두 줄 안에 들어가는 한 줄 설명.
      expect(category.description[0].length).toBeLessThanOrEqual(24);
      expect(RESEARCH_USAGE_LABELS[category.usage]).toBeTruthy();
    }
    const ids = RESEARCH_CATEGORIES.map((category) => category.id);
    for (const id of ["references", "3d", "materials", "fonts", "editions", "creatures", "weather", "music", "open-data"]) {
      expect(ids).toContain(id);
    }
  });

  it("only links to research screens that exist in the route table", () => {
    for (const category of RESEARCH_CATEGORIES) {
      expect(category.href.startsWith("/research/"), category.href).toBe(true);
      expect(routePaths.has(category.href), `${category.id} → ${category.href}`).toBe(true);
    }
    for (const recipe of RESEARCH_RECIPES) {
      for (const step of recipe.steps) {
        const [path] = step.href.split("?");
        expect(routePaths.has(path ?? ""), `${recipe.id} → ${step.href}`).toBe(true);
      }
    }
  });

  it("turns every recipe into 2–3 ordered sources and a way to start making", () => {
    expect(RESEARCH_RECIPES.map((recipe) => recipe.id)).toEqual(["bg3d", "period", "lettering", "creature"]);
    for (const recipe of RESEARCH_RECIPES) {
      expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
      expect(recipe.steps.length).toBeLessThanOrEqual(3);
      expect(recipe.finish.href.startsWith("/studio")).toBe(true);
      expect(recipe.art.startsWith("/brand/")).toBe(true);
    }
    // 3D 배경 = HDRI 조명 + PBR 재질 + 소품 모델.
    const bg3d = RESEARCH_RECIPES.find((recipe) => recipe.id === "bg3d");
    expect(bg3d).toBeDefined();
    if (!bg3d) return;
    expect(bg3d.steps.map((step) => step.label[0])).toEqual(["HDRI 조명", "PBR 재질", "소품 모델"]);
  });

  it("explains the two license words used on the tiles in one short phrase each", () => {
    expect(RESEARCH_USAGE_HINTS.cc0[0]).toContain("상업");
    expect(RESEARCH_USAGE_HINTS.reference[0]).toContain("참고");
  });

  it("sums saved sources per category from the provider breakdown", () => {
    const fonts = RESEARCH_CATEGORIES.find((category) => category.id === "fonts");
    const editions = RESEARCH_CATEGORIES.find((category) => category.id === "editions");
    expect(fonts).toBeDefined();
    expect(editions).toBeDefined();
    if (!fonts || !editions) return;
    const breakdown = [
      { provider: "googlefonts" as const, count: 2 },
      { provider: "openlibrary" as const, count: 1 },
      { provider: "googlebooks" as const, count: 3 },
    ];
    expect(savedCountForCategory(fonts, breakdown)).toBe(2);
    expect(savedCountForCategory(editions, breakdown)).toBe(4);
    expect(savedCountForCategory(fonts, [])).toBe(0);
  });
});
