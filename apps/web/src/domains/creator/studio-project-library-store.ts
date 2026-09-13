import {
  canonicalProjects,
  MAX_PROJECTS,
  PROJECT_KIND_SET,
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  validProjectId,
  validTimestamp,
} from "./studio-project-library-reader";

import type {
  CreateStudioProjectInput,
  StudioProjectLibraryEntry,
  StudioProjectLibraryEventTarget,
  StudioProjectLibraryState,
  StudioProjectLibraryStorage,
} from "./studio-project-library-reader";

export {
  readStudioProjectLibrary,
  STUDIO_PROJECT_KINDS,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  STUDIO_PROJECT_STATUSES,
} from "./studio-project-library-reader";
export type {
  CreateStudioProjectInput,
  StudioProjectKind,
  StudioProjectLibraryEntry,
  StudioProjectLibraryEventTarget,
  StudioProjectLibraryState,
  StudioProjectLibraryStorage,
  StudioProjectStatus,
} from "./studio-project-library-reader";

function normalizedTitle(value: string): string {
  const title = value.trim().replace(/\s+/gu, " ");
  if (!title) throw new Error("Project title is required.");
  if (title.length > 120) throw new Error("Project title is too long.");
  return title;
}

function normalizedDescription(value: string | undefined): string {
  const description = value?.trim() ?? "";
  if (description.length > 1_000) throw new Error("Project description is too long.");
  return description;
}

function normalizedLocale(value: string | undefined): string {
  const locale = value?.trim() || "ko-KR";
  if (!/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?$/u.test(locale)) {
    throw new Error("A valid project locale is required.");
  }
  return locale;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function projectSlug(title: string): string {
  const ascii = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 42);
  return ascii || "project";
}

function generatedProjectId(
  title: string,
  createdAt: string,
  existing: ReadonlySet<string>,
): string {
  const slug = projectSlug(title);
  let attempt = 0;
  while (attempt < 10_000) {
    const suffix = stableHash(`${title}\u0000${createdAt}\u0000${attempt}`).slice(0, 8);
    const candidate = `${slug}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
    attempt += 1;
  }
  throw new Error("A unique project id could not be created.");
}

export function writeStudioProjectLibrary(
  storage: StudioProjectLibraryStorage,
  state: StudioProjectLibraryState,
  target?: StudioProjectLibraryEventTarget,
): StudioProjectLibraryState {
  if (!validTimestamp(state.updatedAt)) throw new Error("A valid project-library timestamp is required.");
  if (state.projects.length > MAX_PROJECTS) throw new Error("The project library is full.");
  const next = Object.freeze({
    schemaVersion: 1 as const,
    projects: canonicalProjects(state.projects),
    updatedAt: state.updatedAt,
  });
  storage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(next));
  target?.dispatchEvent(new CustomEvent(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, { detail: next }));
  return next;
}

function mutateLibrary(
  storage: StudioProjectLibraryStorage,
  updater: (current: StudioProjectLibraryState, now: string) => StudioProjectLibraryState,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): StudioProjectLibraryState {
  const now = options.at ?? new Date().toISOString();
  if (!validTimestamp(now)) throw new Error("A valid project-library timestamp is required.");
  return writeStudioProjectLibrary(storage, updater(readStudioProjectLibrary(storage), now), options.target);
}

export function createStudioProject(
  storage: StudioProjectLibraryStorage,
  input: CreateStudioProjectInput,
  options: {
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): StudioProjectLibraryEntry {
  const title = normalizedTitle(input.title);
  if (!PROJECT_KIND_SET.has(input.kind)) throw new Error("A supported project kind is required.");
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!validTimestamp(createdAt)) throw new Error("A valid project creation time is required.");
  let created: StudioProjectLibraryEntry | null = null;
  mutateLibrary(storage, (current) => {
    if (current.projects.length >= MAX_PROJECTS) throw new Error("The project library is full.");
    const existingIds = new Set(current.projects.map((project) => project.id));
    const id = input.id === undefined
      ? generatedProjectId(title, createdAt, existingIds)
      : input.id;
    if (!validProjectId(id)) throw new Error("A valid project id is required.");
    if (existingIds.has(id)) throw new Error("A project with this id already exists.");
    created = Object.freeze({
      id,
      title,
      kind: input.kind,
      status: "active",
      statusBeforeTrash: null,
      templateId: input.templateId?.trim() || null,
      description: normalizedDescription(input.description),
      primaryLocale: normalizedLocale(input.primaryLocale),
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
      lastOpenedDocumentId: null,
      thumbnailUrl: null,
    });
    return Object.freeze({
      schemaVersion: 1,
      projects: [...current.projects, created],
      updatedAt: createdAt,
    });
  }, { at: createdAt, target: options.target });
  if (!created) throw new Error("Project creation failed.");
  return created;
}

function updateProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  patcher: (project: StudioProjectLibraryEntry, now: string) => StudioProjectLibraryEntry,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): StudioProjectLibraryEntry {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  let updated: StudioProjectLibraryEntry | null = null;
  mutateLibrary(storage, (current, now) => {
    const found = current.projects.some((project) => project.id === projectId);
    if (!found) throw new Error("Project not found.");
    const projects = current.projects.map((project) => {
      if (project.id !== projectId) return project;
      updated = Object.freeze(patcher(project, now));
      return updated;
    });
    return Object.freeze({ schemaVersion: 1, projects, updatedAt: now });
  }, options);
  if (!updated) throw new Error("Project update failed.");
  return updated;
}

export function renameStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  title: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  const nextTitle = normalizedTitle(title);
  return updateProject(storage, projectId, (project, now) => ({
    ...project,
    title: nextTitle,
    updatedAt: now,
  }), options);
}

export function markStudioProjectOpened(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  documentId: string | null,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  return updateProject(storage, projectId, (project, now) => ({
    ...project,
    lastOpenedAt: now,
    lastOpenedDocumentId: documentId?.trim() || null,
    updatedAt: now,
  }), options);
}

export function duplicateStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: {
    readonly title?: string;
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): StudioProjectLibraryEntry {
  const current = readStudioProjectLibrary(storage);
  const source = current.projects.find((project) => project.id === projectId);
  if (!source) throw new Error("Project not found.");
  return createStudioProject(storage, {
    title: options.title ?? `${source.title} 복사본`,
    kind: source.kind,
    templateId: source.templateId,
    description: source.description,
    primaryLocale: source.primaryLocale,
    createdAt: options.at,
  }, { target: options.target });
}

export function archiveStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  return updateProject(storage, projectId, (project, now) => {
    if (project.status === "trashed") throw new Error("Restore the project before archiving it.");
    return { ...project, status: "archived", statusBeforeTrash: null, updatedAt: now };
  }, options);
}

export function activateStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  return updateProject(storage, projectId, (project, now) => ({
    ...project,
    status: "active",
    statusBeforeTrash: null,
    updatedAt: now,
  }), options);
}

export function trashStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  return updateProject(storage, projectId, (project, now) => {
    if (project.status === "trashed") return project;
    return {
      ...project,
      statusBeforeTrash: project.status,
      status: "trashed",
      updatedAt: now,
    };
  }, options);
}

export function restoreStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryEntry {
  return updateProject(storage, projectId, (project, now) => ({
    ...project,
    status: project.status === "trashed" ? project.statusBeforeTrash ?? "active" : "active",
    statusBeforeTrash: null,
    updatedAt: now,
  }), options);
}

export function permanentlyDeleteStudioProject(
  storage: StudioProjectLibraryStorage,
  projectId: string,
  options: { readonly at?: string; readonly target?: StudioProjectLibraryEventTarget } = {},
): StudioProjectLibraryState {
  if (!validProjectId(projectId)) throw new Error("A valid project id is required.");
  return mutateLibrary(storage, (current, now) => {
    const project = current.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error("Project not found.");
    if (project.status !== "trashed") throw new Error("Only trashed projects can be deleted permanently.");
    return Object.freeze({
      schemaVersion: 1,
      projects: current.projects.filter((candidate) => candidate.id !== projectId),
      updatedAt: now,
    });
  }, options);
}

export function studioProjectById(
  state: StudioProjectLibraryState,
  projectId: string,
): StudioProjectLibraryEntry | null {
  return state.projects.find((project) => project.id === projectId) ?? null;
}
