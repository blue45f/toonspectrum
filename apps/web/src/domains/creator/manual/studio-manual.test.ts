import { describe, expect, it } from "vitest";

import { MANUAL_ARTICLES, MANUAL_CATEGORIES, MANUAL_SHORTCUTS, MANUAL_WORKSPACE_LABELS } from "./studio-manual-data";
import {
  adjacentManualArticles,
  findManualArticle,
  highlightManualText,
  MANUAL_ARTICLES_IN_ORDER,
  MANUAL_QUERY_LIMIT,
  MANUAL_SUGGESTED_QUERIES,
  manualArticleHref,
  manualReadingMinutes,
  normalizeManualSearch,
  searchManual,
} from "./studio-manual-search";

const ids = MANUAL_ARTICLES.map((article) => article.id);

describe("Studio user manual content", () => {
  it("has unique, stable article IDs and seven populated categories", () => {
    expect(MANUAL_ARTICLES).toHaveLength(17);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MANUAL_CATEGORIES).toHaveLength(7);
    for (const category of MANUAL_CATEGORIES) {
      expect(category.titleEn.length).toBeGreaterThan(3);
      expect(category.art).toMatch(/^[a-z]+(?:-[a-z]+)*$/u);
    }
    for (const article of MANUAL_ARTICLES) {
      expect(article.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      expect(MANUAL_CATEGORIES.some((category) => category.id === article.category)).toBe(true);
      expect(article.summary.length).toBeGreaterThan(20);
      expect(article.sections.length).toBeGreaterThanOrEqual(3);
      expect(new Set(article.sections.map((section) => section.id)).size).toBe(article.sections.length);
      for (const section of article.sections) {
        expect(section.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
        expect(section.paragraphs.length + (section.steps?.length ?? 0)).toBeGreaterThan(0);
      }
    }
    for (const category of MANUAL_CATEGORIES) {
      expect(MANUAL_ARTICLES.some((article) => article.category === category.id)).toBe(true);
    }
  });

  it("contains no dangling or self-referencing related links", () => {
    for (const article of MANUAL_ARTICLES) {
      for (const related of article.related) {
        expect(ids).toContain(related);
        expect(related).not.toBe(article.id);
      }
    }
  });

  it("links only to existing Studio workspace paths with a named shortcut", () => {
    const paths = [
      "/studio", "/studio/brushes", "/studio/comic", "/studio/character", "/studio/bg3d", "/studio/publish",
      "/studio/ai-lab", "/studio/assets/audio", "/studio/toolchain",
    ];
    for (const article of MANUAL_ARTICLES) {
      expect(paths).toContain(article.workspace);
      expect(MANUAL_WORKSPACE_LABELS[article.workspace]?.en).toBeTruthy();
    }
  });

  it("documents the AI, music and toolchain surfaces without promising automatic results", () => {
    expect(MANUAL_ARTICLES.filter((article) => article.category === "ai-tools").map((article) => article.id))
      .toEqual(["ai-director", "music-ost", "production-tools"]);
    expect(JSON.stringify(findManualArticle("ai-director"))).toContain("자동으로 반영되지 않습니다");
    expect(JSON.stringify(findManualArticle("music-ost"))).toContain("자동으로 다시 보내지 않습니다");
    expect(JSON.stringify(findManualArticle("production-tools"))).toContain("현재 탭에만 저장됩니다");
  });

  it("includes backup limits and does not promise automatic recovery", () => {
    const recovery = findManualArticle("save-recovery");
    expect(JSON.stringify(recovery)).toContain("이미지 파일만으로는");
    expect(JSON.stringify(recovery)).toContain("사이트 데이터 삭제");
    expect(JSON.stringify(findManualArticle("troubleshooting"))).toContain("자동으로 실행하지 않습니다");
  });

  it("documents shortcut defaults without claiming to read a live user keymap", () => {
    expect(MANUAL_SHORTCUTS).toHaveLength(14);
    expect(JSON.stringify(findManualArticle("shortcuts"))).toContain("사용자 지정 키맵을 읽거나 변경하지 않습니다");
  });
});

describe("Studio manual search and URLs", () => {
  it("returns all documents for an empty or whitespace query", () => {
    expect(searchManual("")).toEqual(MANUAL_ARTICLES);
    expect(searchManual("   \n\t ")).toEqual(MANUAL_ARTICLES);
  });
  it("ranks Korean and familiar product aliases above incidental body mentions", () => {
    expect(searchManual("스머지")[0]?.id).toBe("brushes");
    expect(searchManual("스머지").map((article) => article.id)).toContain("shortcuts");
    expect(searchManual("bucket")[0]?.id).toBe("selection-fill");
    expect(searchManual("BACKUP")[0]?.id).toBe("save-recovery");
  });
  it("normalizes full-width and decomposed characters", () => {
    expect(searchManual("ＰＮＧ")[0]?.id).toBe("export");
    expect(normalizeManualSearch("  브러시  ".normalize("NFD"))).toBe("브러시");
  });
  it("matches all tokens and respects category filters", () => {
    expect(searchManual("브러시 지우개")[0]?.id).toBe("brushes");
    expect(searchManual("", "three").map((article) => article.id)).toEqual(["character-3d", "background-3d"]);
    expect(searchManual("스머지", "three")).toEqual([]);
    expect(searchManual("", "unknown-category")).toEqual([]);
  });
  it("treats regex and markup as literal text", () => {
    expect(searchManual("(a+)+$")).toEqual([]);
    expect(searchManual("<script>alert(1)</script>")).toEqual([]);
    expect(() => searchManual("[")).not.toThrow();
  });
  it("bounds the input and returns a deterministic order", () => {
    expect(searchManual(" ".repeat(MANUAL_QUERY_LIMIT) + "not-in-the-manual")).toEqual(MANUAL_ARTICLES);
    expect(searchManual("3D")).toEqual(searchManual("3D"));
  });
  it("orders previous/next navigation by topic", () => {
    expect(MANUAL_ARTICLES_IN_ORDER).toHaveLength(MANUAL_ARTICLES.length);
    expect(adjacentManualArticles("layers").next?.id).toBe("filters");
    expect(adjacentManualArticles("getting-started").previous).toBeUndefined();
    expect(adjacentManualArticles("troubleshooting").next).toBeUndefined();
    expect(adjacentManualArticles("unknown")).toEqual({});
  });
  it("highlights literal matches and reports a reading time", () => {
    expect(highlightManualText("브러시와 지우개", "지우개")).toEqual([
      { text: "브러시와 ", match: false },
      { text: "지우개", match: true },
    ]);
    expect(highlightManualText("Save PNG", "png")).toEqual([
      { text: "Save ", match: false },
      { text: "PNG", match: true },
    ]);
    expect(highlightManualText("(a+)+$", "")).toEqual([{ text: "(a+)+$", match: false }]);
    for (const article of MANUAL_ARTICLES) expect(manualReadingMinutes(article)).toBeGreaterThanOrEqual(1);
  });
  it("only suggests searches that find at least one article", () => {
    for (const query of MANUAL_SUGGESTED_QUERIES) expect(searchManual(query).length).toBeGreaterThan(0);
  });
  it("encodes segments and safely rejects unknown documents", () => {
    expect(manualArticleHref("save-recovery")).toBe("/studio/manual/save-recovery");
    expect(manualArticleHref("../x?y#z")).toBe("/studio/manual/..%2Fx%3Fy%23z");
    expect(findManualArticle(undefined)).toBeUndefined();
    expect(findManualArticle("not-a-document")).toBeUndefined();
  });
});
