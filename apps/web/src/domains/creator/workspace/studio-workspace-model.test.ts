import { describe, expect, it } from "vitest";
import { createStudioProject } from "../studio-project-library-store";
import { selectWorkspaceProject, workspacePanel, workspaceProjectLinks, workspaceTab } from "./studio-workspace-model";

function project(id: string, createdAt = "2026-09-20T01:00:00.000Z") {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  return createStudioProject(storage, { id, title: `작품 ${id}`, kind: "webtoon", createdAt });
}

describe("studio-first workspace context", () => {
  it("selects the most recently opened active work without mutating the library", () => {
    const first = project("first"); const recent = project("recent", "2026-09-20T02:00:00.000Z");
    const entries = Object.freeze([first, recent]);
    expect(selectWorkspaceProject(entries, null).selected?.id).toBe("recent");
    expect(entries[0]).toBe(first);
  });
  it("never falls back to another work for a missing explicit link", () => {
    expect(selectWorkspaceProject([project("a")], "deleted")).toMatchObject({ selected: null, missing: true });
  });
  it("does not resume archived or trashed works", () => {
    const a = project("a");
    expect(selectWorkspaceProject([{ ...a, status: "trashed" }], "a")).toMatchObject({ selected: null, missing: true });
    expect(selectWorkspaceProject([{ ...a, status: "archived" }], null).projects).toEqual([]);
  });
  it("supports an explicit personal workspace without opening the most recent work", () => {
    expect(selectWorkspaceProject([project("a")], null, true)).toMatchObject({ selected: null, missing: false });
  });
  it("uses one project identity for every space and list action", () => {
    const links = workspaceProjectLinks(project("episode-one"));
    expect(links.space).toBe("/studio/p/episode-one/space");
    expect(links.team).toBe("/studio/p/episode-one/settings?view=team");
    expect(links.review).toBe("/studio/p/episode-one/review?view=inbox");
    expect(links.documents).toBe("/studio/p/episode-one/production?view=documents");
    expect(Object.values(links).every((href) => href.startsWith("/studio/p/episode-one/"))).toBe(true);
  });
  it("retains the established exact document and page resume URL", () => {
    const href = "/studio/p/a/documents/d-1/canvas?page=page-2";
    expect(workspaceProjectLinks(project("a"), { href, documentId: "d-1", summary: "page 2", exact: true }).resume).toBe(href);
  });
  it("uses explicit creation/library destinations for an empty personal studio", () => {
    const links = workspaceProjectLinks(null);
    expect(links.resume).toBe("/studio/new");
    expect(links.space).toBe("/studio");
    expect(links.team).toBe("/team");
  });
  it("accepts only known panels and categories", () => {
    expect(workspacePanel("work")).toBe("work");
    expect(workspacePanel("https://outside.example")).toBeNull();
    expect(workspaceTab("unexpected", ["works", "people"])).toBe("works");
    expect(workspaceTab("people", ["works", "people"])).toBe("people");
  });
});
