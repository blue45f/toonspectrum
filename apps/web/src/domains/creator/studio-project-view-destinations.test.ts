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
  it("connects every planned project view without placeholder self-loops or technical copy", () => {
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
        expect(`${resolved.descriptionKo} ${resolved.descriptionEn}`).not.toMatch(
          /SQLite|OPFS|revision|리비전|lease|CRDT/u,
        );
        if (resolved.owner === "project-shell") {
          expect(resolved.href).toBeNull();
        } else {
          expect(resolved.href).toMatch(/^\//u);
          expect(resolved.href).not.toContain(`/studio/p/project-1/${section}?view=`);
        }
      }
    }
  });

  it("keeps review, export, story planning and automation inside the project shell", () => {
    expect(resolveStudioProjectViewDestination("project-1", "review", "comments"))
      .toMatchObject({ owner: "project-shell", href: null });
    expect(resolveStudioProjectViewDestination("project-1", "review", "versions"))
      .toMatchObject({ owner: "project-shell", href: null });
    expect(resolveStudioProjectViewDestination("project-1", "export", "preflight"))
      .toMatchObject({ owner: "project-shell", href: null });
    expect(resolveStudioProjectViewDestination("project-1", "story", "world"))
      .toMatchObject({ owner: "project-shell", href: null });
    expect(resolveStudioProjectViewDestination("project-1", "settings", "automation"))
      .toMatchObject({ owner: "project-shell", href: null });
  });

  it("uses specialist editors only where immersive editing is still required", () => {
    expect(resolveStudioProjectViewDestination("project-1", "production", "documents").href)
      .toBe("/studio/work/project-1/canvas");
    expect(resolveStudioProjectViewDestination("series/한글", "story", "characters").href)
      .toBe("/studio/assets/characters/new?project=series%2F%ED%95%9C%EA%B8%80");
    expect(resolveStudioProjectViewDestination("series/한글", "assets", "project").href)
      .toBe("/studio/assets?project=series%2F%ED%95%9C%EA%B8%80&view=project");
    expect(resolveStudioProjectViewDestination("series/한글", "assets", "team").href)
      .toBe("/studio/share?scope=work%3Aseries%2F%ED%95%9C%EA%B8%80");
  });

  it("rejects unknown views and unsafe project identities", () => {
    expect(() => resolveStudioProjectViewDestination("project-1", "story", "approvals"))
      .toThrow("Unknown story project view");
    expect(() => resolveStudioProjectViewDestination("..", "story", "overview"))
      .toThrow("valid Studio project id");
  });
});
