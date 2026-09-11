import { describe, expect, it } from "vitest";

import {
  STUDIO_PROJECT_SECTION_VIEWS,
  type StudioProjectSection,
} from "./studio-project-views";
import {
  auditStudioProjectViewDestinations,
  resolveStudioProjectViewDestination,
} from "./studio-project-view-destinations";

describe("Studio project view destinations", () => {
  it("connects every planned project view without placeholder self-loops", () => {
    expect(auditStudioProjectViewDestinations()).toEqual([]);

    for (const [section, views] of Object.entries(STUDIO_PROJECT_SECTION_VIEWS)) {
      for (const view of views) {
        const resolved = resolveStudioProjectViewDestination(
          "project-1",
          section as StudioProjectSection,
          view,
        );
        expect(resolved.labelKo.length).toBeGreaterThan(0);
        expect(resolved.labelEn.length).toBeGreaterThan(0);
        if (resolved.owner === "project-shell") {
          expect(resolved.href).toBeNull();
        } else {
          expect(resolved.href).toMatch(/^\//u);
          expect(resolved.href).not.toContain(`/studio/p/project-1/${section}?view=`);
        }
      }
    }
  });

  it("routes review, version, publishing and story views into the shipped workspaces", () => {
    expect(resolveStudioProjectViewDestination("project-1", "review", "comments").href)
      .toBe("/studio/work/project-1/review");
    expect(resolveStudioProjectViewDestination("project-1", "review", "versions").href)
      .toBe("/studio/work/project-1/versions");
    expect(resolveStudioProjectViewDestination("project-1", "export", "preflight").href)
      .toBe("/studio/work/project-1/publish");
    expect(resolveStudioProjectViewDestination("project-1", "story", "world").href)
      .toBe("/studio/work/project-1/storyworld");
  });

  it("preserves project identity in query-based production and asset links", () => {
    expect(resolveStudioProjectViewDestination("series/한글", "production", "board").href)
      .toBe("/studio/projects?scope=work%3Aseries%2F%ED%95%9C%EA%B8%80");
    expect(resolveStudioProjectViewDestination("series/한글", "assets", "series").href)
      .toBe("/studio/assets?project=series%2F%ED%95%9C%EA%B8%80&view=series-kit");
  });

  it("rejects unknown views and unsafe project identities", () => {
    expect(() => resolveStudioProjectViewDestination("project-1", "story", "approvals"))
      .toThrow("Unknown story project view");
    expect(() => resolveStudioProjectViewDestination("..", "story", "overview"))
      .toThrow("valid Studio project id");
  });
});
