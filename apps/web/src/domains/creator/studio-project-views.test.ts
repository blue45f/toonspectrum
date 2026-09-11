import { describe, expect, it } from "vitest";

import {
  STUDIO_PROJECT_SECTION_VIEWS,
  STUDIO_PROJECT_VIEW_LABELS,
  isStudioProjectSection,
  isStudioProjectView,
  resolveStudioProjectView,
  studioProjectDefaultView,
  studioProjectSectionHref,
  studioProjectSectionPathname,
} from "./studio-project-views";

describe("Studio project section views", () => {
  it("keeps every planned project view in one registry", () => {
    expect(STUDIO_PROJECT_SECTION_VIEWS).toEqual({
      overview: ["summary", "activity", "readiness"],
      story: [
        "overview",
        "episodes",
        "script",
        "characters",
        "world",
        "timeline",
        "relations",
        "references",
        "localization",
      ],
      production: ["board", "documents", "pipeline", "calendar", "workload", "renders"],
      assets: ["project", "series", "team", "installed", "missing", "rights"],
      review: ["inbox", "comments", "requests", "approvals", "versions", "compare", "share"],
      export: ["preflight", "targets", "localization", "packages", "history", "analytics"],
      settings: ["general", "team", "automation", "defaults", "archive"],
    });

    for (const [section, views] of Object.entries(STUDIO_PROJECT_SECTION_VIEWS)) {
      expect(new Set(views).size, section).toBe(views.length);
      for (const view of views) {
        expect(STUDIO_PROJECT_VIEW_LABELS[section as keyof typeof STUDIO_PROJECT_SECTION_VIEWS][view]).toMatchObject({
          ko: expect.any(String),
          en: expect.any(String),
        });
      }
    }
  });

  it("builds canonical section links while preserving unrelated state", () => {
    expect(studioProjectSectionPathname("series/한글", "story")).toBe(
      "/studio/p/series%2F%ED%95%9C%EA%B8%80/story",
    );
    expect(studioProjectSectionHref(
      "project-1",
      "review",
      "approvals",
      "?room=team-a&view=comments",
    )).toBe(
      "/studio/p/project-1/review?room=team-a&view=approvals",
    );
  });

  it("chooses a stable default for every section", () => {
    expect(studioProjectDefaultView("overview")).toBe("summary");
    expect(studioProjectDefaultView("story")).toBe("overview");
    expect(studioProjectDefaultView("production")).toBe("board");
    expect(studioProjectDefaultView("assets")).toBe("project");
    expect(studioProjectDefaultView("review")).toBe("inbox");
    expect(studioProjectDefaultView("export")).toBe("preflight");
    expect(studioProjectDefaultView("settings")).toBe("general");
  });

  it("canonicalizes missing, duplicate and unknown view values", () => {
    expect(resolveStudioProjectView("project-1", "story", "?room=a")).toMatchObject({
      view: "overview",
      canonicalHref: "/studio/p/project-1/story?room=a&view=overview",
      changed: true,
    });
    expect(resolveStudioProjectView(
      "project-1",
      "story",
      "?view=script&room=a",
    )).toMatchObject({
      view: "script",
      canonicalHref: "/studio/p/project-1/story?room=a&view=script",
      changed: false,
    });
    expect(resolveStudioProjectView(
      "project-1",
      "review",
      "?view=unknown&view=comments",
    )).toMatchObject({
      view: "inbox",
      canonicalHref: "/studio/p/project-1/review?view=inbox",
      changed: true,
    });
  });

  it("validates sections, views and identities without accepting adjacent concepts", () => {
    expect(isStudioProjectSection("story")).toBe(true);
    expect(isStudioProjectSection("ai-lab")).toBe(false);
    expect(isStudioProjectView("story", "characters")).toBe(true);
    expect(isStudioProjectView("story", "approvals")).toBe(false);
    expect(() => studioProjectSectionPathname("..", "story")).toThrow();
    expect(() => studioProjectSectionHref(
      "project-1",
      "story",
      "approvals" as never,
    )).toThrow();
  });
});
