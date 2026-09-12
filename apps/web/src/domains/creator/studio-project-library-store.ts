export const STUDIO_PROJECT_LIBRARY_STORAGE_KEY =
  "toonspectrum:studio-project-library:v1";
export const STUDIO_PROJECT_LIBRARY_UPDATED_EVENT =
  "toonspectrum:studio-project-library-updated";

export const STUDIO_PROJECT_KINDS = [
  "webtoon",
  "illustration",
  "image",
  "design",
  "slides",
  "storyboard",
  "three-d",
  "animation",
] as const;

export const STUDIO_PROJECT_STATUSES = [
  "active",
  "archived",
  "trashed",
] as const;

export type StudioProjectKind = (typeof STUDIO_PROJECT_KINDS)[number];
export type StudioProjectStatus = (typeof STUDIO_PROJECT_STATUSES)[number];

export interface StudioProjectLibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly status: StudioProjectStatus;
  readonly statusBeforeTrash: Exclude<StudioProjectStatus, "trashed"> | null;
  readonly templateId: string | null;
  readonly description: string;
  readonly primaryLocale: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly lastOpenedDocumentId: string | null;
  readonly thumbnailUrl: string | null;
}

export interface StudioProjectLibraryState {
  readonly schemaVersion: 1;
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly updatedAt: string;
}

export interface StudioProjectLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioProjectLibraryEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface CreateStudioProjectInput {
  readonly id?: string;
  readonly title: string;
  readonly kind: StudioProjectKind;
  readonly templateId?: string | null;
  readonly description?: string;
  readonly primaryLocale?: string;
  readonly createdAt?: string;
}

const PROJECT_KIND_SET = new Set<string>(STUDIO_PROJECT_KINDS);
const PROJECT_STATUS_SET = new Set<string>(STUDIO_PROJECT_STATUSES);
const MAX_PROJECTS = 5_000;

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validProjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > 160
    || normalized === "."
    || normalized === ".."
    || normalized.includes("\\")
  ) {
    return false;
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return normalized === value;
}

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

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseEntry(value: unknown): StudioProjectLibraryEntry | null {
  const item = record(value);
  if (!item || !validProjectId(item.id)) return null;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  if (typeof item.kind !== "string" || !PROJECT_KIND_SET.has(item.kind)) return null;
  if (typeof item.status !== "string" || !PROJECT_STATUS_SET.has(item.status)) return null;
  if (!validTimestamp(item.createdAt) || !validTimestamp(item.updatedAt) || !validTimestamp(item.lastOpenedAt)) {
    return null;
  }
  const status = item.status as StudioProjectStatus;
  const statusBeforeTrash = item.statusBeforeTrash === "active" || item.statusBeforeTrash === "archived"
    ? item.statusBeforeTrash
    : null;
  return Object.freeze({
    id: item.id,
    title: item.title.trim().slice(0, 120),
    kind: item.kind as StudioProjectKind,
    status,
    statusBeforeTrash: status === "trashed" ? statusBeforeTrash ?? "active" : null,
    templateId: typeof item.templateId === "string" && item.templateId.trim()
      ? item.templateId.trim().slice(0, 160)
      : null,
    description: typeof item.description === "string" ? item.description.trim().slice(0, 1_000) : "",
    primaryLocale: typeof item.primaryLocale === "string" && item.primaryLocale.trim()
      ? item.primaryLocale.trim()
      : "ko-KR",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastOpenedAt: item.lastOpenedAt,
    lastOpenedDocumentId: typeof item.lastOpenedDocumentId === "string" && item.lastOpenedDocumentId.trim()
      ? item.lastOpenedDocumentId.trim().slice(0, 160)
      : null,
    thumbnailUrl: typeof item.thumbnailUrl === "string" && item.thumbnailUrl.trim()
      ? item.thumbnailUrl.trim().slice(0, 2_048)
      : null,
  });
}

function emptyState(at = new Date().toISOString()): StudioProjectLibraryState {
  if (!validTimestamp(at)) throw new Error("A valid project-library timestamp is required.");
  return Object.freeze({ schemaVersion: 1, projects: Object.freeze([]), updatedAt: at });
}

function canonicalProjects(
  projects: readonly StudioProjectLibraryEntry[],
): readonly StudioProjectLibraryEntry[] {
  const byId = new Map<string, StudioProjectLibraryEntry>();
  for (const project of projects) byId.set(project.id, Object.freeze({ ...project }));
  return Object.freeze([...byId.values()].sort((left, right) => {
    const statusOrder = { active: 0, archived: 1, trashed: 2 } as const;
    return statusOrder[left.status] - statusOrder[right.status]
      || Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt)
      || left.title.localeCompare(right.title);
  }));
}

export function readStudioProjectLibrary(
  storage: StudioProjectLibraryStorage,
): StudioProjectLibraryState {
  const raw = storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = record(JSON.parse(raw));
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.projects)) return emptyState();
    const projects = parsed.projects
      .slice(0, MAX_PROJECTS)
      .map(parseEntry)
      .filter((project): project is StudioProjectLibraryEntry => project !== null);
    return Object.freeze({
      schemaVersion: 1,
      projects: canonicalProjects(projects),
      updatedAt: validTimestamp(parsed.updatedAt) ? parsed.updatedAt : new Date().toISOString(),
    });
  } catch {
    return emptyState();
  }
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
