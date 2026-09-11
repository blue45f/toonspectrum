import { describe, expect, it } from "vitest";

import {
  STUDIO_PROJECT_TEMPLATES,
  searchStudioProjectTemplates,
  studioProjectTemplateById,
  validateStudioProjectTemplateCatalog,
} from "./studio-project-template-catalog";

describe("Studio project template catalog", () => {
  it("keeps every built-in template structurally valid and uniquely identified", () => {
    expect(validateStudioProjectTemplateCatalog()).toEqual([]);
    expect(new Set(STUDIO_PROJECT_TEMPLATES.map((template) => template.id)).size)
      .toBe(STUDIO_PROJECT_TEMPLATES.length);
    expect(STUDIO_PROJECT_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it("finds templates by Korean and English production terms", () => {
    expect(searchStudioProjectTemplates({ query: "웹툰" }).map((template) => template.id))
      .toEqual(expect.arrayContaining([
        "webtoon-vertical-standard",
        "webtoon-four-panel",
      ]));
    expect(searchStudioProjectTemplates({ query: "pitch" }).map((template) => template.id))
      .toContain("presentation-series-pitch");
    expect(searchStudioProjectTemplates({ query: "non-destructive" }).map((template) => template.id))
      .toContain("image-composite-cover");
  });

  it("filters by category and recommendation without creating another product hierarchy", () => {
    const presentation = searchStudioProjectTemplates({ category: "presentation" });
    expect(presentation).toHaveLength(2);
    expect(presentation.every((template) => template.projectKind === "slides")).toBe(true);

    const featured = searchStudioProjectTemplates({ featuredOnly: true });
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((template) => template.featured)).toBe(true);
  });

  it("resolves a stable template by id", () => {
    expect(studioProjectTemplateById("3d-webtoon-room")).toMatchObject({
      projectKind: "three-d",
      documentKind: "three-d",
      defaultWorkspace: "3d",
    });
    expect(studioProjectTemplateById("missing-template")).toBeNull();
  });
});
