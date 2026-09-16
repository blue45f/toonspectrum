import {
  readStudioProjectLibrary,
  writeStudioProjectLibrary,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryEventTarget,
  type StudioProjectLibraryState,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-store";

export interface StudioProjectBulkMutationResult {
  readonly state: StudioProjectLibraryState;
  readonly affectedIds: readonly string[];
  readonly skippedIds: readonly string[];
}

type BulkOperation = "archive" | "activate" | "trash" | "restore" | "delete-permanently";

interface BulkMutationOptions {
  readonly at?: string;
  readonly target?: StudioProjectLibraryEventTarget;
}

function uniqueProjectIds(projectIds: readonly string[]): readonly string[] {
  return Object.freeze([
    ...new Set(projectIds.filter((projectId) => typeof projectId === "string" && projectId.length > 0)),
  ]);
}

function nextProject(
  project: StudioProjectLibraryEntry,
  operation: Exclude<BulkOperation, "delete-permanently">,
  now: string,
): StudioProjectLibraryEntry | null {
  if (operation === "archive") {
    if (project.status !== "active") return null;
    return Object.freeze({ ...project, status: "archived", statusBeforeTrash: null, updatedAt: now });
  }
  if (operation === "activate") {
    if (project.status !== "archived") return null;
    return Object.freeze({ ...project, status: "active", statusBeforeTrash: null, updatedAt: now });
  }
  if (operation === "trash") {
    if (project.status === "trashed") return null;
    return Object.freeze({
      ...project,
      statusBeforeTrash: project.status,
      status: "trashed",
      updatedAt: now,
    });
  }
  if (project.status !== "trashed") return null;
  return Object.freeze({
    ...project,
    status: project.statusBeforeTrash ?? "active",
    statusBeforeTrash: null,
    updatedAt: now,
  });
}

function mutateStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  operation: BulkOperation,
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  const ids = uniqueProjectIds(projectIds);
  const current = readStudioProjectLibrary(storage);
  if (ids.length === 0) {
    return Object.freeze({ state: current, affectedIds: Object.freeze([]), skippedIds: Object.freeze([]) });
  }

  const now = options.at ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("A valid project-library timestamp is required.");

  const selected = new Set(ids);
  const affectedIds: string[] = [];
  const foundIds = new Set<string>();
  const projects: StudioProjectLibraryEntry[] = [];

  for (const project of current.projects) {
    if (!selected.has(project.id)) {
      projects.push(project);
      continue;
    }
    foundIds.add(project.id);
    if (operation === "delete-permanently") {
      if (project.status === "trashed") affectedIds.push(project.id);
      else projects.push(project);
      continue;
    }
    const updated = nextProject(project, operation, now);
    if (updated) {
      projects.push(updated);
      affectedIds.push(project.id);
    } else {
      projects.push(project);
    }
  }

  const affected = new Set(affectedIds);
  const orderedAffectedIds = ids.filter((projectId) => affected.has(projectId));
  const skippedIds = ids.filter((projectId) => !foundIds.has(projectId) || !affected.has(projectId));
  if (orderedAffectedIds.length === 0) {
    return Object.freeze({
      state: current,
      affectedIds: Object.freeze([]),
      skippedIds: Object.freeze(skippedIds),
    });
  }

  const state = writeStudioProjectLibrary(storage, Object.freeze({
    schemaVersion: 1,
    projects: Object.freeze(projects),
    updatedAt: now,
  }), options.target);
  return Object.freeze({
    state,
    affectedIds: Object.freeze(orderedAffectedIds),
    skippedIds: Object.freeze(skippedIds),
  });
}

export function archiveStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  return mutateStudioProjectsBulk(storage, projectIds, "archive", options);
}

export function activateStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  return mutateStudioProjectsBulk(storage, projectIds, "activate", options);
}

export function trashStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  return mutateStudioProjectsBulk(storage, projectIds, "trash", options);
}

export function restoreStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  return mutateStudioProjectsBulk(storage, projectIds, "restore", options);
}

export function permanentlyDeleteStudioProjectsBulk(
  storage: StudioProjectLibraryStorage,
  projectIds: readonly string[],
  options: BulkMutationOptions = {},
): StudioProjectBulkMutationResult {
  return mutateStudioProjectsBulk(storage, projectIds, "delete-permanently", options);
}
