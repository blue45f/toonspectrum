import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { StudioProjectResumeTarget } from "../studio-project-resume-target";
import { studioProjectSectionHref } from "../studio-project-views";

export type WorkspaceSurface = "home" | "team" | "hub";
export const WORKSPACE_PANELS = ["work", "tools", "help"] as const;
export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];
export function workspacePanel(value: string | null): WorkspacePanel | null {
  return WORKSPACE_PANELS.find((panel) => panel === value) ?? null;
}

/** Missing explicit context never silently opens another project's files. */
export function selectWorkspaceProject(projects: readonly StudioProjectLibraryEntry[], requested: string | null, personal = false) {
  const active = projects.filter((project) => project.status === "active").toSorted((a, b) =>
    (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt) || a.id.localeCompare(b.id));
  const selected = personal ? null : requested
    ? active.find((project) => project.id === requested) ?? null : active[0] ?? null;
  return { projects: active, selected, missing: Boolean(!personal && requested && !selected) };
}

export function workspaceProjectLinks(project: StudioProjectLibraryEntry | null, resume?: StudioProjectResumeTarget | null) {
  if (!project) return {
    resume: "/studio/new", space: "/studio", overview: "/studio", story: "/studio",
    production: "/studio", review: "/studio", assets: "/studio/assets", team: "/team", documents: "/studio",
  };
  return {
    resume: resume?.href ?? studioProjectSectionHref(project.id, "overview"),
    space: `/studio/p/${encodeURIComponent(project.id)}/space`,
    overview: studioProjectSectionHref(project.id, "overview"),
    story: studioProjectSectionHref(project.id, "story", "episodes"),
    production: studioProjectSectionHref(project.id, "production", "board"),
    documents: studioProjectSectionHref(project.id, "production", "documents"),
    review: studioProjectSectionHref(project.id, "review", "inbox"),
    assets: studioProjectSectionHref(project.id, "assets", "project"),
    team: studioProjectSectionHref(project.id, "settings", "team"),
  };
}

export function workspaceTab<T extends string>(value: string | null, allowed: readonly [T, ...T[]]): T {
  return allowed.find((tab) => tab === value) ?? allowed[0];
}
