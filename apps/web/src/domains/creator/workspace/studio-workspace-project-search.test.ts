import { describe, expect, it } from "vitest";
import { createStudioProject } from "../studio-project-library-store";
import { searchWorkspaceProjects } from "./studio-workspace-project-search";

function work(id: string, title: string) {
  const data = new Map<string, string>();
  return createStudioProject({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } },
    { id, title, kind: "webtoon", createdAt: "2026-09-20T00:00:00.000Z" });
}

describe("read-only workspace project search", () => {
  it("normalizes Korean composition, full-width text, case and multiple query terms", () => {
    const project = work("a", "새벽의 작업실 Volume 2");
    expect(searchWorkspaceProjects([project], "  새벽의   ＶＯＬＵＭＥ  ")).toEqual([project]);
    expect(searchWorkspaceProjects([project], "새벽의".normalize("NFD"))).toEqual([project]);
    expect(searchWorkspaceProjects([project], "새벽의 없음")).toEqual([]);
  });
  it("treats search punctuation literally, not as a regular expression", () => {
    expect(searchWorkspaceProjects([work("a", "작품 (새벽)"), work("b", "다른 작품")], "(새벽)").map((p) => p.id)).toEqual(["a"]);
    expect(searchWorkspaceProjects([work("a", "작품")], ".*")).toEqual([]);
  });
  it("excludes archived and trashed works even when they match", () => {
    const active = work("a", "동일 제목");
    expect(searchWorkspaceProjects([active, { ...work("b", "동일 제목"), status: "archived" }, { ...work("c", "동일 제목"), status: "trashed" }], "")).toEqual([active]);
  });
  it("sorts recent activity without mutating input or touching the library", () => {
    const a = Object.freeze(work("a", "첫 작품"));
    const b = Object.freeze({ ...work("b", "둘째 작품"), lastOpenedAt: "2026-09-21T00:00:00.000Z" });
    const projects = Object.freeze([a, b]);
    expect(searchWorkspaceProjects(projects, "").map((p) => p.id)).toEqual(["b", "a"]);
    expect(projects[0]).toBe(a);
  });
  it("sorts titles naturally and resolves duplicate titles by stable id", () => {
    const projects = [work("z", "작품 10"), work("b", "작품 2"), work("a", "작품 2")];
    expect(searchWorkspaceProjects(projects, "", "title").map((p) => p.id)).toEqual(["a", "b", "z"]);
  });
  it("does not disclose or match project ids as title search", () => {
    expect(searchWorkspaceProjects([work("private-id", "내 원고")], "private-id")).toEqual([]);
  });
  it("supports empty libraries and whitespace-only queries", () => {
    expect(searchWorkspaceProjects([], " ")).toEqual([]);
    expect(searchWorkspaceProjects([work("a", "내 작품")], "   ")).toHaveLength(1);
  });
});
